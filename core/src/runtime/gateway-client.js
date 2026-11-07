/**
 * 网关客户端（worker 侧）
 *
 * FARM_NETWORK_MODE=gateway 时，worker 不再自己握 WebSocket，而是把请求交给
 * 独立的连接网关进程（gateway-process.js）。网关攥着连接与凭证，worker 可以
 * 随时被杀掉重启——连接那头根本不知道发生了什么，也就不会掉号、不用重新抓码。
 *
 * 分工：
 *   - 网关：WebSocket、心跳、加密、登录态、重连判定
 *   - worker：protobuf 业务解码、通知分发、任务调度（本文件只做搬运）
 */
'use strict';

const net = require('net');
const { EventEmitter } = require('events');
const { encodeFrame, decodeFrame, toBase64, fromBase64, splitFrames } = require('./gateway-protocol');
const { log, logWarn } = require('../utils/utils');

const DEFAULT_TIMEOUT_MS = 30000;
const CRITICAL_METHODS = new Set(['Heartbeat', 'Login', 'Logout', 'Reconnect', 'Kickout']);
const CRITICAL_SERVICE = /(UserService|LoginService|AceService|SecurityService)/i;

function isCriticalRequest(service, method) {
    if (CRITICAL_METHODS.has(String(method || ''))) return true;
    return CRITICAL_SERVICE.test(String(service || '')) && /login|heartbeat|ace|security/i.test(String(method || ''));
}

function createNetwork(direct) {
    const socketPath = process.env.FARM_GATEWAY_SOCK || '';
    const accountId = String(process.env.FARM_ACCOUNT_ID || '');

    let sock = null;
    let buffer = '';
    let nextId = 1;
    let loggedIn = false;
    let backoffUntil = 0;
    let backoffReason = '';
    let lastHealth = { pending: 0, oldestPendingMs: 0 };
    const pending = new Map();
    // 复用直连那份 EventEmitter：业务模块在覆盖前就订阅了它，
    // 网关这边必须往同一个实例里发事件，否则 disconnect / kickout / login
    // 这些信号业务侧永远收不到（表现为「已经掉线了，界面还是运行中」）。
    const networkEvents = direct.networkEvents || new EventEmitter();
    const userState = { gid: 0, name: '', level: 0, gold: 0, exp: 0, openId: '', avatar: '' };

    function ensureSocket() {
        if (sock && !sock.destroyed) return sock;
        if (!socketPath) throw new Error('网关模式缺少 FARM_GATEWAY_SOCK');
        buffer = '';
        sock = net.connect(socketPath, () => log('网关', '已连接本地连接网关进程'));
        sock.setEncoding('utf8');
        sock.on('data', (chunk) => {
            const [frames, rest] = splitFrames(buffer + chunk);
            buffer = rest;
            for (const line of frames) handleFrame(decodeFrame(line));
        });
        sock.on('close', () => {
            sock = null;
            loggedIn = false;
            // 网关进程没了（不是连接断了）：把事件抛出去，让 worker 走既有的重连提示
            networkEvents.emit('disconnect', { code: 'gateway_close' });
        });
        sock.on('error', (err) => logWarn('网关', `socket 错误: ${err.message}`));
        return sock;
    }

    function sendFrame(frame) {
        const s = ensureSocket();
        if (!s || s.destroyed) return false;
        s.write(encodeFrame(frame) + '\n');
        return true;
    }

    function handleFrame(frame) {
        if (!frame) return;
        switch (frame.t) {
        case 'login':
        case 'reused':
            loggedIn = true;
            Object.assign(userState, frame.userState || {});
            if (frame.t === 'reused') log('网关', '复用网关里已有的连接，worker 重启不影响登录态');
            // 必须把登录信号发出去：worker 的 connect(code, onLoginSuccess) 就是等这个事件，
            // 之前没发，导致「已连上网关」之后业务照旧按未登录状态乱跑。
            networkEvents.emit('login', { ...userState });
            break;
        case 'response': {
            const p = pending.get(frame.id);
            if (!p) break;
            pending.delete(frame.id);
            clearTimeout(p.timer);
            if (frame.error) p.reject(new Error(frame.error));
            else p.resolve({ body: fromBase64(frame.body), meta: frame.meta || {} });
            break;
        }
        case 'notify':
            // 通知交给 worker 本地解码：与直连模式走同一条 handleMessage 路径
            try { direct.ingestFrame(fromBase64(frame.body)); } catch (e) { logWarn('网关', `通知解码失败: ${e.message}`); }
            break;
        case 'event':
            handleEvent(frame.name, frame.payload || {});
            break;
        case 'pong':
            break;
        default:
            break;
        }
    }

    function handleEvent(name, payload) {
        if (name === 'degraded') {
            backoffUntil = Date.now() + (Number(payload.backoffMs) || 30000);
            backoffReason = String(payload.reason || '业务请求连续超时');
            logWarn('网关', `连接亚健康，暂停业务请求 ${Math.round((payload.backoffMs || 30000) / 1000)}s 给心跳让路（${backoffReason}）`);
            networkEvents.emit('connection_degraded', payload);
            return;
        }
        if (name === 'recovered') {
            backoffUntil = 0;
            backoffReason = '';
            networkEvents.emit('connection_recovered', payload);
            return;
        }
        networkEvents.emit(name, payload);
    }

    /** 等网关把登录信号发回来（已登录立刻返回） */
    function waitForLogin(ms = 15000) {
        if (loggedIn) return Promise.resolve(true);
        return new Promise((resolve) => {
            let done = false;
            const finish = (ok) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                networkEvents.removeListener('login', onLogin);
                resolve(ok);
            };
            const onLogin = () => finish(true);
            const timer = setTimeout(() => finish(loggedIn), Math.max(500, Number(ms) || 15000));
            networkEvents.once('login', onLogin);
        });
    }

    function isBackoffActive(now = Date.now()) {
        if (!backoffUntil) return false;
        if (now >= backoffUntil) {
            backoffUntil = 0;
            backoffReason = '';
            return false;
        }
        return true;
    }

    function connect(code, onLoginSuccess) {
        sendFrame({
            t: 'connect',
            accountId,
            code: String(code || ''),
            platform: process.env.FARM_PLATFORM || '',
            os: process.env.FARM_OS || '',
            clientVersion: process.env.FARM_CLIENT_VERSION || '',
        });
        const onLogin = (payload) => {
            loggedIn = true;
            if (typeof onLoginSuccess === 'function') {
                try { onLoginSuccess(payload || userState); } catch (e) { logWarn('网关', `登录回调异常: ${e.message}`); }
            }
        };
        networkEvents.once('login', onLogin);
        return true;
    }

    async function sendMsgAsync(service, method, bodyBytes, timeout = 20000, options = {}) {
        const critical = isCriticalRequest(service, method);
        if (!critical && isBackoffActive()) {
            const remainS = Math.ceil((backoffUntil - Date.now()) / 1000);
            throw new Error(`网关亚健康退避中（${backoffReason}），剩余 ${remainS}s，暂停业务请求给心跳让路`);
        }
        const limit = Math.max(1000, Number(timeout) || DEFAULT_TIMEOUT_MS);
        // 网关进程刚起来时它自己还没连上游戏，这时把请求转过去只会拿到
        // 「连接未打开: Xxx」。先等登录信号，最多等到本次请求超时的 3/4。
        if (!loggedIn && !critical) {
            await waitForLogin(Math.min(Math.floor(limit * 0.75), 15000));
        }
        const id = nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`网关请求超时: ${method}`));
            }, limit);
            pending.set(id, { resolve, reject, timer });
            const ok = sendFrame({
                t: 'request',
                accountId,
                id,
                service,
                method,
                body: toBase64(bodyBytes),
                timeout: limit,
                critical: Boolean(options.critical || critical),
            });
            if (!ok) {
                clearTimeout(timer);
                pending.delete(id);
                reject(new Error('网关连接不可用'));
            }
        });
    }

    function stopNetwork() {
        loggedIn = false;
        try { sendFrame({ t: 'stop' }); } catch { /* 网关可能已退出 */ }
        if (sock) { sock.destroy(); sock = null; }
    }

    function reconnect() {
        // 网关自己负责重连；worker 侧只需等待 login/reused 事件
        return true;
    }

    function getGatewayHealth() {
        return {
            ...lastHealth,
            degraded: isBackoffActive(),
            degradedRemainingMs: backoffUntil ? Math.max(0, backoffUntil - Date.now()) : 0,
            reason: backoffReason,
            mode: 'gateway',
        };
    }

    function isGatewayHealthyForBusiness() { return loggedIn && !isBackoffActive(); }

    return {
        connect,
        reconnect,
        cleanup: () => {},
        stopNetwork,
        getWs: () => null,
        isConnected: () => loggedIn,
        sendMsgAsync,
        getUserState: () => (userState.gid ? userState : direct.getUserState()),
        getGatewayHealth,
        isGatewayHealthyForBusiness,
        isGatewayIdleForLowPriority: () => !isBackoffActive(),
        waitForGatewayIdle: async () => true,
        getAceStatus: () => ({ running: false, runtime: 'gateway' }),
        networkEvents,
        getWsErrorState: () => direct.getWsErrorState(),
        setHealthBackoff(ms, reason) {
            const dur = Number(ms) || 0;
            if (dur <= 0) return;
            backoffUntil = Math.max(backoffUntil, Date.now() + dur);
            backoffReason = String(reason || backoffReason || '业务请求连续超时');
        },
        isHealthBackoffActive: isBackoffActive,
    };
}

module.exports = { createNetwork, isCriticalRequest };
/**
 * 连接网关进程（独立子进程）
 *
 * 唯一持有游戏 WebSocket：心跳、加密、登录态、重连判定都在这里。
 * worker 进程随时可以杀掉重启——重启后连上来先发 connect，网关发现连接还活着
 * 就直接回 reused，凭证不动、农场继续跑，不用重新抓码。
 *
 * 前提说清楚：网关进程自己重启（崩溃/被 kill）仍然要重新抓码，
 * 这是凭证机制决定的，绕不过去。
 *
 * 两级假死处理见 gateway-stall.js：
 *   连续 2 次业务超时 → 发 degraded，worker 暂停业务只留心跳
 *   连续 7 次业务超时 → 发 dead，交给上层重新取码
 */
'use strict';

const net = require('net');
const fs = require('fs');
const network = require('../utils/network');
const { createStallMonitor } = require('./gateway-stall');
const { encodeFrame, decodeFrame, toBase64, fromBase64, splitFrames } = require('./gateway-protocol');

const SOCK = process.env.FARM_GATEWAY_SOCK || '';
const ACCOUNT_ID = String(process.env.FARM_ACCOUNT_ID || '');

const stall = createStallMonitor({
    degradedAfter: Number(process.env.FARM_GATEWAY_DEGRADED_AFTER) || 2,
    deadAfter: Number(process.env.FARM_GATEWAY_DEAD_AFTER) || 7,
    baseMs: Number(process.env.FARM_GATEWAY_BACKOFF_BASE_MS) || 30000,
    maxMs: Number(process.env.FARM_GATEWAY_BACKOFF_MAX_MS) || 180000,
});

const clients = new Set();
let loggedIn = false;
let lastUserState = null;
let lastConnectCode = '';
let stopping = false;

function sendTo(client, frame) {
    if (!client || client.destroyed) return;
    try { client.write(encodeFrame(frame) + '\n'); } catch { /* 客户端已断开 */ }
}

function broadcast(frame) {
    for (const client of clients) sendTo(client, frame);
}

function logLine(message) {
    broadcast({ t: 'log', level: 'info', message });
    process.stdout.write(`[gateway:${ACCOUNT_ID}] ${message}\n`);
}

// 网关自己不解业务包，只把原始帧转给 worker
network.setRawMessageHook((buf) => {
    const body = toBase64(buf);
    broadcast({ t: 'notify', body });
});

network.networkEvents.on('disconnect', (payload) => {
    loggedIn = false;
    broadcast({ t: 'event', name: 'disconnect', payload: payload || {} });
});

network.networkEvents.on('kickout', (payload) => {
    loggedIn = false;
    broadcast({ t: 'event', name: 'kickout', payload: payload || {} });
});

network.networkEvents.on('ws_error', (payload) => {
    broadcast({ t: 'event', name: 'ws_error', payload: payload || {} });
});

function startLogin(code) {
    lastConnectCode = String(code || '');
    network.connect(lastConnectCode, (userState) => {
        loggedIn = true;
        lastUserState = { ...(userState || {}) };
        broadcast({ t: 'login', accountId: ACCOUNT_ID, userState: lastUserState });
        logLine('登录成功，连接已就绪');
    });
}

/** 等自己和游戏服务器连上（worker 常常在 connect 之后立刻发业务请求） */
async function waitForLoggedIn(ms = 15000) {
    const deadline = Date.now() + Math.max(500, Number(ms) || 15000);
    while (Date.now() < deadline) {
        if (loggedIn && network.isConnected()) return true;
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return loggedIn && network.isConnected();
}

async function handleRequest(client, frame) {
    const { id, service, method, body, timeout } = frame;
    // 还没连上游戏服务器时不要往下转发：否则直接拿到「连接未打开: Xxx」，
    // worker 那边会把它当成业务错误一路重试。先等，等不到就给一句人话。
    if (!network.isConnected()) {
        const ready = await waitForLoggedIn(Math.min(Number(timeout) || 20000, 15000));
        if (!ready) {
            sendTo(client, { t: 'response', id, error: '还没连上游戏服务器（正在登录），请稍后重试' });
            return;
        }
    }
    try {
        const result = await network.sendMsgAsync(service, method, fromBase64(body), Number(timeout) || 20000);
        const verdict = stall.onSuccess(service, method);
        if (verdict.recovered) {
            broadcast({ t: 'event', name: 'recovered', payload: stall.snapshot() });
            logLine('连接已恢复，解除业务请求暂停');
        }
        sendTo(client, {
            t: 'response',
            id,
            body: toBase64(result && result.body),
            meta: (result && result.meta) || {},
        });
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        const isTimeout = /超时/.test(message);
        if (isTimeout) {
            const verdict = stall.onTimeout(service, method);
            if (verdict.dead) {
                broadcast({ t: 'event', name: 'dead', payload: stall.snapshot() });
                logLine('连接判定为假死（业务请求连续超时已达上限），需要重新取码');
            } else if (verdict.justDegraded || verdict.degraded) {
                broadcast({
                    t: 'event',
                    name: 'degraded',
                    payload: { ...stall.snapshot(), backoffMs: verdict.backoffMs || 30000, reason: `${method} 连续超时` },
                });
                logLine(`连接亚健康：${method} 连续 ${verdict.streak} 次超时，暂停业务请求给心跳让路`);
            }
        }
        sendTo(client, { t: 'response', id, error: message });
    }
}

function handleFrame(client, frame) {
    if (!frame || typeof frame !== 'object') return;
    switch (frame.t) {
    case 'connect':
        if (loggedIn && network.isConnected()) {
            sendTo(client, { t: 'reused', accountId: ACCOUNT_ID, userState: lastUserState || {} });
            logLine('worker 重连，复用已有连接（无需重新抓码）');
            return;
        }
        startLogin(frame.code);
        break;
    case 'request':
        handleRequest(client, frame).catch(() => {});
        break;
    case 'stop':
        stopping = true;
        network.stopNetwork('worker 请求停止');
        loggedIn = false;
        broadcast({ t: 'event', name: 'stopped', payload: {} });
        break;
    case 'ping':
        sendTo(client, { t: 'pong' });
        break;
    default:
        break;
    }
}

function startServer() {
    if (!SOCK) {
        console.error('[gateway] 缺少 FARM_GATEWAY_SOCK');
        process.exit(2);
    }
    // Unix socket 可能残留，先删；Windows 命名管道不需要
    if (process.platform !== 'win32' && fs.existsSync(SOCK)) {
        try { fs.unlinkSync(SOCK); } catch { /* 忽略 */ }
    }
    const server = net.createServer((client) => {
        clients.add(client);
        let buffer = '';
        client.setEncoding('utf8');
        client.on('data', (chunk) => {
            const [frames, rest] = splitFrames(buffer + chunk);
            buffer = rest;
            for (const line of frames) handleFrame(client, decodeFrame(line));
        });
        client.on('close', () => clients.delete(client));
        client.on('error', () => clients.delete(client));
        // 新客户端先握手：告诉对方网关身份与连接状态
        sendTo(client, { t: 'ready', accountId: ACCOUNT_ID, loggedIn, userState: lastUserState || {} });
    });
    server.listen(SOCK, () => {
        process.stdout.write(`[gateway:${ACCOUNT_ID}] listening ${SOCK}\n`);
        if (process.send) process.send({ type: 'gateway_ready', accountId: ACCOUNT_ID, sock: SOCK });
    });
    server.on('error', (error) => {
        process.stderr.write(`[gateway] ${error.message}\n`);
        if (process.send) process.send({ type: 'gateway_error', accountId: ACCOUNT_ID, message: error.message });
        process.exit(1);
    });
}

process.on('uncaughtException', (error) => {
    process.stderr.write(`[gateway] uncaught: ${error && error.stack ? error.stack : error}\n`);
});
process.on('unhandledRejection', (error) => {
    process.stderr.write(`[gateway] unhandled: ${error && error.stack ? error.stack : error}\n`);
});
process.on('SIGTERM', () => {
    try { network.stopNetwork('网关退出'); } catch { /* 忽略 */ }
    process.exit(0);
});

startServer();
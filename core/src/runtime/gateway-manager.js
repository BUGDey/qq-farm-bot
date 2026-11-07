/**
 * 网关进程管理（主进程侧）
 *
 * 每个账号最多一个网关子进程，按账号复用：worker 重启时网关不动，
 * 连接、凭证、心跳都还在，所以改完代码重启 worker 不用重新抓码。
 *
 * 只有用户显式停止账号 / 删号时才杀网关。
 */
'use strict';

const path = require('path');
const os = require('os');

const GATEWAY_SCRIPT = path.join(__dirname, 'gateway-process.js');
const READY_TIMEOUT_MS = Number(process.env.FARM_GATEWAY_READY_TIMEOUT_MS) || 15000;

function isGatewayMode(env = process.env) {
    return String(env.FARM_NETWORK_MODE || '').toLowerCase() === 'gateway';
}

function socketPathFor(accountId) {
    const id = String(accountId || '').replace(/[^\w.-]/g, '_') || 'default';
    if (process.platform === 'win32') return `\\\\.\\pipe\\qqfarm-gateway-${id}`;
    return path.join(os.tmpdir(), `qqfarm-gateway-${id}.sock`);
}

function createGatewayManager(deps = {}) {
    const fork = deps.fork;
    const log = typeof deps.log === 'function' ? deps.log : () => {};
    const gateways = new Map();

    function spawnGateway(accountId) {
        const sock = socketPathFor(accountId);
        const child = fork(GATEWAY_SCRIPT, [], {
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            env: {
                ...process.env,
                // 网关自己必须走直连，否则会再套一层网关
                FARM_NETWORK_MODE: 'direct',
                FARM_NETWORK_ROLE: 'gateway',
                FARM_ACCOUNT_ID: String(accountId),
                FARM_GATEWAY_SOCK: sock,
            },
        });
        const record = { child, sock, ready: false, accountId: String(accountId) };
        gateways.set(String(accountId), record);
        child.on('exit', (code, signal) => {
            log('网关', `账号 ${accountId} 的网关进程退出 (code=${code}, signal=${signal || '-'})`);
            if (gateways.get(String(accountId)) === record) gateways.delete(String(accountId));
        });
        return record;
    }

    function waitReady(record) {
        if (record.ready) return Promise.resolve(record);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('网关进程启动超时'));
            }, READY_TIMEOUT_MS);
            const onMessage = (msg) => {
                if (!msg || msg.accountId !== record.accountId) return;
                if (msg.type === 'gateway_ready') {
                    record.ready = true;
                    cleanup();
                    resolve(record);
                } else if (msg.type === 'gateway_error') {
                    cleanup();
                    reject(new Error(msg.message || '网关进程启动失败'));
                }
            };
            const onExit = (code) => {
                cleanup();
                reject(new Error(`网关进程提前退出 (code=${code})`));
            };
            function cleanup() {
                clearTimeout(timer);
                record.child.off('message', onMessage);
                record.child.off('exit', onExit);
            }
            record.child.on('message', onMessage);
            record.child.on('exit', onExit);
        });
    }

    async function ensureGateway(accountId) {
        const key = String(accountId);
        const existing = gateways.get(key);
        if (existing) {
            if (existing.child.connected === false && existing.child.killed) {
                gateways.delete(key);
            } else {
                return waitReady(existing);
            }
        }
        log('网关', `为账号 ${accountId} 启动连接网关进程`);
        return waitReady(spawnGateway(key));
    }

    function killGateway(accountId, reason = '停止账号') {
        const key = String(accountId);
        const record = gateways.get(key);
        if (!record) return false;
        gateways.delete(key);
        try {
            record.child.kill();
        } catch { /* 已退出 */ }
        log('网关', `账号 ${accountId} 的网关进程已停止（${reason}）`);
        return true;
    }

    function killAll(reason = '关闭面板') {
        for (const key of [...gateways.keys()]) killGateway(key, reason);
    }

    function getGatewaySock(accountId) {
        const record = gateways.get(String(accountId));
        return record ? record.sock : socketPathFor(accountId);
    }

    function has(accountId) {
        return gateways.has(String(accountId));
    }

    return { isGatewayMode, ensureGateway, killGateway, killAll, getGatewaySock, has, socketPathFor };
}

module.exports = { createGatewayManager, isGatewayMode, socketPathFor };
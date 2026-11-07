/**
 * 连接网关 IPC 协议（worker ⇄ gateway）
 *
 * 走本地命名管道（Windows）或 Unix domain socket，帧为「一行一个 JSON」，
 * 二进制 protobuf 用 base64 放进 JSON。
 *
 * worker → gateway:
 *   { t:'connect', accountId, code, platform, os, clientVersion }
 *   { t:'request', accountId, id, service, method, body(base64), timeout }
 *   { t:'stop' }  { t:'ping' }
 * gateway → worker:
 *   { t:'ready', accountId }
 *   { t:'reused' | 'login', accountId, userState }
 *   { t:'response', id, error, body(base64), meta }
 *   { t:'notify', body(base64) }
 *   { t:'event', name, payload }
 *   { t:'pong' }  { t:'log', level, message }
 */
'use strict';

function encodeFrame(obj) {
    return JSON.stringify(obj);
}

function decodeFrame(text) {
    try {
        const value = JSON.parse(text);
        return value && typeof value === 'object' ? value : null;
    } catch {
        return null;
    }
}

function toBase64(buf) {
    if (!buf) return '';
    if (Buffer.isBuffer(buf)) return buf.toString('base64');
    return Buffer.from(buf).toString('base64');
}

function fromBase64(str) {
    if (!str) return Buffer.alloc(0);
    return Buffer.from(String(str), 'base64');
}

/** 把数据流切成完整帧（按换行），返回 [frames, rest] */
function splitFrames(chunk) {
    const frames = [];
    let rest = String(chunk || '');
    let idx = rest.indexOf('\n');
    while (idx >= 0) {
        const line = rest.slice(0, idx).trim();
        rest = rest.slice(idx + 1);
        if (line) frames.push(line);
        idx = rest.indexOf('\n');
    }
    return [frames, rest];
}

module.exports = { encodeFrame, decodeFrame, toBase64, fromBase64, splitFrames };
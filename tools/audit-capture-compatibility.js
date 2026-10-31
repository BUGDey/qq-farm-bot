#!/usr/bin/env node

/**
 * 检查抓包里的 RPC 与本地 protobuf 定义是否兼容。
 *
 * 薄包装：内部调用 core/scripts/inspect-protocol-capture.js 并强制带上 --audit，
 * 发现未知字段 / wire type 不匹配 / 缺失类型时返回非零退出码。
 *
 * 用法：
 *   node tools/audit-capture-compatibility.js <抓包.har|bin目录> [--service ...] [--method ...]
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const target = path.join(__dirname, '..', 'core', 'scripts', 'inspect-protocol-capture.js');

if (process.argv.length < 3) {
    console.error('用法：node tools/audit-capture-compatibility.js <抓包.har|bin目录> [选项]');
    process.exit(2);
}

const args = process.argv.slice(2);
if (!args.includes('--audit')) args.push('--audit');

const result = spawnSync(process.execPath, [target, ...args], { stdio: 'inherit' });
process.exit(result.status == null ? 1 : result.status);

#!/usr/bin/env node

/**
 * 解码指定抓包目录里的协议帧。
 *
 * 薄包装：内部调用 core/scripts/inspect-protocol-capture.js，不重复实现解析逻辑。
 * 参数会原样透传，退出码也原样返回，方便接 CI。
 *
 * 用法：
 *   node tools/decode-latest-protocols.js <抓包.har|bin目录> [--pretty] [--shape] ...
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const target = path.join(__dirname, '..', 'core', 'scripts', 'inspect-protocol-capture.js');

if (process.argv.length < 3) {
    console.error('用法：node tools/decode-latest-protocols.js <抓包.har|bin目录> [选项]');
    console.error('选项见 docs/tools.md（--service / --method / --shape / --pretty ...）');
    process.exit(2);
}

const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status == null ? 1 : result.status);

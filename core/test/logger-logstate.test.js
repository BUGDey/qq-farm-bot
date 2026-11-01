const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 每个测试文件独立进程，这里直接改环境变量，让 logger 把数据目录/日志目录落到临时目录
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqfarm-logstate-'));
const logDir = path.join(tmpRoot, 'logs');
const stateDir = path.join(tmpRoot, 'logstate');

fs.mkdirSync(logDir, { recursive: true });
// 模拟老版本遗留的隐藏状态文件
fs.writeFileSync(
  path.join(logDir, '.combined-log-audit.json'),
  JSON.stringify({ hashType: 'sha256', hash: 'legacy-combined', file: 'logs/combined-2026-11-01-08.log' })
);
fs.writeFileSync(
  path.join(logDir, '.error-log-audit.json'),
  JSON.stringify({ hashType: 'sha256', hash: 'legacy-error', file: 'logs/error-2026-11-01-08.log' })
);

process.env.FARM_DATA_DIR = tmpRoot;
process.env.FARM_LOG_DIR = logDir;

const { createModuleLogger } = require('../src/services/logger');

test('轮转状态文件迁移到 logstate 目录', async () => {
  const logger = createModuleLogger('logstate-test');
  logger.info('logstate smoke');

  await new Promise(resolve => setTimeout(resolve, 400));

  assert.ok(fs.existsSync(stateDir), '应创建 logstate 目录');

  const combinedAudit = path.join(stateDir, 'combined-audit.json');
  const errorAudit = path.join(stateDir, 'error-audit.json');
  assert.ok(fs.existsSync(combinedAudit), 'combined 状态文件应在新目录');
  assert.ok(fs.existsSync(errorAudit), 'error 状态文件应在新目录');

  const migrated = JSON.parse(fs.readFileSync(combinedAudit, 'utf8'));
  assert.strictEqual(migrated.hash, 'legacy-combined', '应保留老状态内容，避免轮转断档');

  assert.ok(
    !fs.existsSync(path.join(logDir, '.combined-log-audit.json')),
    'logs 目录里不应再残留旧的隐藏状态文件'
  );
  assert.ok(
    !fs.existsSync(path.join(logDir, '.error-log-audit.json')),
    'logs 目录里不应再残留旧的隐藏状态文件'
  );
});

test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

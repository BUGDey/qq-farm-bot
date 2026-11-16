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

// 老版本遗留的隐藏状态文件：内容是真实的 file-stream-rotator 结构，
// 其中 auditLog 指向**上一份部署**的绝对路径（这是会重建老目录的元凶）
const legacyCombinedLog = path.join(logDir, 'combined-2026-11-01-08.log');
const legacyErrorLog = path.join(logDir, 'error-2026-11-01-08.log');
fs.writeFileSync(legacyCombinedLog, '{}\n');
fs.writeFileSync(legacyErrorLog, '{}\n');

const staleDir = path.join(tmpRoot, 'old-deployment', 'main-project', 'core', 'data', 'logs');
const staleCombinedAudit = path.join(staleDir, '.combined-log-audit.json');
const staleErrorAudit = path.join(staleDir, '.error-log-audit.json');

fs.writeFileSync(
  path.join(logDir, '.combined-log-audit.json'),
  JSON.stringify({
    keep: { days: true, amount: 3 },
    auditLog: staleCombinedAudit,
    files: [{ date: Date.now(), name: legacyCombinedLog, hash: 'legacy-combined' }],
    hashType: 'sha256',
  })
);
fs.writeFileSync(
  path.join(logDir, '.error-log-audit.json'),
  JSON.stringify({
    keep: { days: true, amount: 3 },
    auditLog: staleErrorAudit,
    files: [{ date: Date.now(), name: legacyErrorLog, hash: 'legacy-error' }],
    hashType: 'sha256',
  })
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
  assert.strictEqual(migrated.auditLog, combinedAudit, 'auditLog 应改写为当前状态文件路径');
  assert.ok(
    migrated.files.some(entry => entry.hash === 'legacy-combined'),
    '仍存在的日志记录应保留，避免轮转断档'
  );
  assert.ok(
    migrated.files.every(entry => fs.existsSync(entry.name)),
    '状态文件里不应留下已被删掉的日志路径'
  );

  assert.ok(
    !fs.existsSync(staleDir),
    '不应按照老状态文件里的 auditLog 把上一份部署的目录重新建出来'
  );

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

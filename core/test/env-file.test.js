'use strict';
const test = require('node:test');
const assert = require('node:assert');

const { applyEnvValues, getEnvValue, readEnvPairs } = require('../scripts/env-file');

test('.env 写入：替换已有键并保留注释与顺序', () => {
  const before = ['# 顶部注释', 'FARM_ADMIN_USERNAME=admin', 'FARM_ADMIN_PASSWORD=old', '', 'NAPCAT_LOGIN_ENABLED=false', ''].join('\n');
  const after = applyEnvValues(before, { FARM_ADMIN_PASSWORD: 'new-pass', NAPCAT_LOGIN_ENABLED: 'true' });
  const lines = after.split('\n');
  assert.strictEqual(lines[0], '# 顶部注释');
  assert.strictEqual(lines[1], 'FARM_ADMIN_USERNAME=admin');
  assert.strictEqual(lines[2], 'FARM_ADMIN_PASSWORD=new-pass');
  assert.ok(after.includes('NAPCAT_LOGIN_ENABLED=true'));
  assert.ok(!after.includes('NAPCAT_LOGIN_ENABLED=false'));
  assert.ok(after.endsWith('\n'));
});

test('.env 写入：缺失键追加到末尾，null 表示不改', () => {
  const before = 'FARM_ADMIN_USERNAME=admin\n';
  const after = applyEnvValues(before, {
    NAPCAT_IMAGE: 'mlikiowa/napcat-docker:v4.18.19',
    NAPCAT_DEVICE_NAME: null,
  });
  assert.strictEqual(getEnvValue(after, 'NAPCAT_IMAGE'), 'mlikiowa/napcat-docker:v4.18.19');
  assert.strictEqual(getEnvValue(after, 'NAPCAT_DEVICE_NAME'), '');
  assert.strictEqual(after.split('\n').filter(Boolean).length, 2);
});

test('.env 写入：重复执行结果稳定（幂等）', () => {
  const before = 'A=1\n';
  const once = applyEnvValues(before, { B: '2', C: '3' });
  const twice = applyEnvValues(once, { B: '2', C: '3' });
  assert.strictEqual(once, twice);
});

test('.env 解析：提取键值、去引号、忽略注释与空行', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envpairs-'));
  const file = path.join(dir, 'sample.env');
  fs.writeFileSync(file, [
    '# 顶部注释',
    '',
    'FARM_ADMIN_USERNAME=admin',
    'NAPCAT_LOGIN_ENABLED=true',
    'QUOTED="a b c"',
    'SINGLE=\'x y\'',
    'EMPTY=',
    'WITH_EQUALS=a=b=c',
  ].join('\n'), 'utf8');

  const pairs = readEnvPairs(file);
  assert.strictEqual(pairs.FARM_ADMIN_USERNAME, 'admin');
  assert.strictEqual(pairs.NAPCAT_LOGIN_ENABLED, 'true');
  assert.strictEqual(pairs.QUOTED, 'a b c');
  assert.strictEqual(pairs.SINGLE, 'x y');
  assert.strictEqual(pairs.EMPTY, '');
  assert.strictEqual(pairs.WITH_EQUALS, 'a=b=c');
  assert.ok(!('# 顶部注释' in pairs));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('.env 解析：文件不存在时返回空对象', () => {
  assert.deepStrictEqual(readEnvPairs('Z:\\definitely\\missing\\.env'), {});
});

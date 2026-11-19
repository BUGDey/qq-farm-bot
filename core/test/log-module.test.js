const assert = require('node:assert/strict');
const test = require('node:test');

const { log, setLogHook } = require('../src/utils/utils');

test('牧场日志保留场景标签和业务分类', () => {
  const entries = [];
  setLogHook((tag, message, isWarn, meta) => entries.push({ tag, meta }));
  try {
    log('牧场', '自动收获成功', { module: 'ranch', scene: 'ranch' });
    log('牧场', '自动偷取成功', { module: 'friend', scene: 'ranch' });
    log('牧场', '自动出售成功', { module: 'warehouse', scene: 'ranch' });
    log('牧场', '巡查完成');
    assert.deepEqual(entries.map(e => e.tag), ['牧场', '牧场', '牧场', '牧场']);
    assert.equal(entries[1].meta.module, 'friend');
    assert.equal(entries[2].meta.module, 'warehouse');
    assert.equal(entries[3].meta.module, 'ranch');
  } finally { setLogHook(null); }
});

test('宠物模块日志使用宠物标签', () => {
  let received;
  setLogHook((tag, message, isWarn, meta) => {
    received = { tag, message, isWarn, meta };
  });

  try {
    log('系统', '已派出比熊犬', { module: 'pet', event: '派出宠物' });
    assert.deepEqual(received, {
      tag: '宠物',
      message: '已派出比熊犬',
      isWarn: false,
      meta: { module: 'pet', event: '派出宠物' },
    });
  }
  finally {
    setLogHook(null);
  }
});

test('旧式宠物标签可推断为宠物模块', () => {
  let received;
  setLogHook((tag, message, isWarn, meta) => {
    received = { tag, message, isWarn, meta };
  });

  try {
    log('宠物', '已召回宠物');
    assert.equal(received.tag, '宠物');
    assert.equal(received.meta.module, 'pet');
  }
  finally {
    setLogHook(null);
  }
});

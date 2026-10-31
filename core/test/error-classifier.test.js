const assert = require('node:assert/strict');
const test = require('node:test');

const { classifyError, isRetryable } = require('../src/utils/error-classifier');

test('explicit errorType wins', () => {
  const error = Object.assign(new Error('whatever'), { errorType: 'offline' });
  assert.equal(classifyError(error).errorType, 'offline');
  assert.equal(isRetryable(error), true);
});

test('automation busy is recognised by name', () => {
  const error = new Error('自动任务正在执行');
  error.name = 'AutomationBusyError';
  const result = classifyError(error);
  assert.equal(result.errorType, 'automation_busy');
  assert.equal(result.retryable, true);
});

test('rate limit message is classified and retryable', () => {
  const result = classifyError('操作过于频繁，请稍后再试');
  assert.equal(result.errorType, 'rate_limit');
  assert.equal(result.retryable, true);
});

test('offline and timeout are distinguished', () => {
  assert.equal(classifyError(new Error('连接已断开')).errorType, 'offline');
  assert.equal(classifyError(new Error('请求超时')).errorType, 'timeout');
});

test('auth and protocol errors are not retryable', () => {
  assert.equal(classifyError(new Error('登录失效，请重新登录')).errorType, 'auth');
  assert.equal(classifyError(new Error('Unknown method')).errorType, 'protocol');
  assert.equal(isRetryable(new Error('登录失效，请重新登录')), false);
});

test('unknown error falls back to unknown', () => {
  const result = classifyError(new Error('莫名其妙的错误'));
  assert.equal(result.errorType, 'unknown');
  assert.equal(result.retryable, false);
});

test('string and object inputs both work, phase is preserved', () => {
  assert.equal(classifyError('未连接', { phase: 'tick' }).phase, 'tick');
  assert.equal(classifyError({ error: '请求超时' }).errorType, 'timeout');
});

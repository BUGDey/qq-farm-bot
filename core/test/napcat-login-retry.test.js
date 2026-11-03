const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

/**
 * 回归测试：NapCat 在 QQ 登录/注销、RestartNapCat 之后会作废旧 Credential，
 * 并且用 HTTP 200 + {code:-1,message:"Unauthorized"} 表示鉴权失败。
 * 服务遇到这种返回必须重新登录并重试，而不是把英文 Unauthorized 抛给用户。
 */

function startFakeNapcat({ unauthorizedTimes = 1 } = {}) {
  const state = { logins: 0, statusCalls: 0 };
  const server = http.createServer((req, res) => {
    const send = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.url === '/api/auth/login') {
      state.logins += 1;
      send({ code: 0, data: { Credential: `cred-${state.logins}` } });
      return;
    }
    if (req.url === '/api/QQLogin/CheckLoginStatus') {
      state.statusCalls += 1;
      if (state.statusCalls <= unauthorizedTimes) send({ code: -1, message: 'Unauthorized' });
      else send({ code: 0, data: { isLogin: false, isOffline: false, loginPhase: 'ready' } });
      return;
    }
    if (req.url === '/api/QQLogin/GetQQLoginQrcode') {
      send({ code: 0, data: { qrcode: 'https://example.com/qr-token' } });
      return;
    }
    send({ code: 0, data: {} });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, state, port: server.address().port }));
  });
}

test('Credential 失效时自动重新登录并重试，不把 Unauthorized 抛给用户', async () => {
  const fake = await startFakeNapcat({ unauthorizedTimes: 1 });
  const keys = ['NAPCAT_LOGIN_ENABLED', 'NAPCAT_WEBUI_URL', 'NAPCAT_OPENAUTH_URL', 'NAPCAT_TOKEN', 'NAPCAT_TOKEN_FILE'];
  const saved = {};
  for (const key of keys) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NAPCAT_LOGIN_ENABLED = 'true';
  process.env.NAPCAT_WEBUI_URL = `http://127.0.0.1:${fake.port}/api`;
  process.env.NAPCAT_OPENAUTH_URL = `http://127.0.0.1:${fake.port}/plugin/api`;
  process.env.NAPCAT_TOKEN = 'unit-test-token';

  delete require.cache[require.resolve('../src/services/napcat-login')];
  const napcatLogin = require('../src/services/napcat-login');
  try {
    const task = await napcatLogin.create('tester');
    assert.ok(task.taskId, '应当返回二维码任务');
    assert.equal(fake.state.logins, 2, '第一次 Unauthorized 后应重新登录一次');
    assert.equal(fake.state.statusCalls, 2, '应重试同一个接口');
    await napcatLogin.cancel(task.taskId, 'tester');
  }
  finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    fake.server.close();
    delete require.cache[require.resolve('../src/services/napcat-login')];
  }
});

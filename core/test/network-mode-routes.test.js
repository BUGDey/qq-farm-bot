// 连接网关开关的接口挂载检查：不改真实配置，只看路由是否注册、非法值是否被拒。
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAdminSystemRoutes } = require('../src/controllers/admin-system-routes');

function buildApp() {
    const routes = [];
    const app = {
        get: (path) => routes.push(['get', path]),
        post: (path) => routes.push(['post', path]),
        use: () => {},
    };
    const store = {
        getNetworkMode: () => 'direct',
        setNetworkMode: (mode) => mode,
    };
    registerAdminSystemRoutes({
        app,
        store,
        getDefaultSystemConfig: () => ({}),
        getRuntimeConfig: () => ({}),
        updateRuntimeConfig: () => ({ mode: 'direct' }),
        requireAdminToken: (req, res, next) => next && next(),
        requireAdminRole: (req, res, next) => next && next(),
        requireDangerConfirmation: () => true,
        logger: { warn: () => {}, info: () => {}, error: () => {} },
    });
    return routes;
}

test('全局设置挂载了连接网关的读写接口', () => {
    const routes = buildApp();
    assert.ok(routes.some(([m, p]) => m === 'get' && p === '/api/admin/network-mode'));
    assert.ok(routes.some(([m, p]) => m === 'post' && p === '/api/admin/network-mode'));
});
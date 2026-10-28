/**
 * 活动插件管理 API（仅 admin / super_admin）。
 *
 *   GET    /api/plugins                插件清单（含前端入口 URL 与自动化声明）
 *   POST   /api/plugins/upload         上传 zip 安装并立即激活
 *   POST   /api/plugins/:id/enable     启用
 *   POST   /api/plugins/:id/disable    停用（保留安装）
 *   POST   /api/plugins/:id/uninstall  卸载（删除文件并强制关闭其自动化开关）
 *   POST   /api/plugins/:id/rollback   回滚到上一保留版本
 */

const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 120 * 1024 * 1024, files: 1 },
});

function registerAdminPluginRoutes({ app, pluginHost, provider, requireAdminRole, sendProviderError }) {
    app.get('/api/plugins', (req, res) => {
        try {
            res.json({ ok: true, plugins: pluginHost.listForApi() });
        } catch (error) {
            sendProviderError(res, error);
        }
    });

    app.post('/api/plugins/upload', requireAdminRole, upload.single('file'), async (req, res) => {
        try {
            if (!req.file || !req.file.buffer || !req.file.buffer.length) {
                return res.status(400).json({ ok: false, error: '请上传插件 zip 包' });
            }
            const entry = pluginHost.install(req.file.buffer, { activate: true });
            res.json({
                ok: true,
                plugin: {
                    id: entry.id,
                    name: entry.manifest.name,
                    version: entry.version,
                    automationCount: (entry.manifest.automation || []).length,
                },
            });
        } catch (error) {
            res.status(400).json({ ok: false, error: error.message });
        }
    });

    const wrap = handler => async (req, res) => {
        try {
            const pluginId = String(req.params.id || '');
            const result = await handler(pluginId);
            res.json({ ok: true, ...(result || {}) });
        } catch (error) {
            if (String(error.message || '').includes('不存在')) {
                return res.status(404).json({ ok: false, error: error.message });
            }
            sendProviderError(res, error);
        }
    };

    app.post('/api/plugins/:id/enable', requireAdminRole, wrap(id => pluginHost.enable(id)));
    app.post('/api/plugins/:id/disable', requireAdminRole, wrap(id => pluginHost.disable(id)));
    app.post('/api/plugins/:id/rollback', requireAdminRole, wrap(id => pluginHost.rollback(id)));
    // 卸载后在所有账号上强制关闭该插件的自动化开关（与活动过期同一条关闭路径），
    // 并把配置快照同步给对应 worker。
    app.post('/api/plugins/:id/uninstall', requireAdminRole, wrap((id) => {
        const removed = pluginHost.uninstall(id);
        const keys = removed.keys || [];
        let changed = [];
        if (keys.length) {
            changed = require('../models/store').forceDisableAutomationKeys(keys);
        }
        for (const accountId of changed) {
            provider.broadcastConfigToWorkers(accountId);
        }
        return { uninstalled: id, disabledKeys: keys, affectedAccounts: changed.length };
    }));
}

module.exports = { registerAdminPluginRoutes };

/**
 * 插件系统总开关（默认关闭）。
 *
 * - false（默认）：
 *   - 主进程跳过插件启动激活（admin.js 不调 pluginHost.restoreAll()）；
 *   - worker 启动时不下发插件清单（worker-manager.js 的 plugin_sync 恒为空数组）；
 *   - /api/plugins 返回空清单，其余插件管理 API 返回 403；
 *   - gameConfig 不注册内置素材插件；
 *   - 前端管理页「插件」导航入口已注释（web/src/views/AdminPanel.vue）。
 *   注册表与已安装插件目录原样保留，插件代码不删除，随时可恢复。
 * - true：恢复全部插件功能。需同时在 web/src/views/AdminPanel.vue
 *   恢复被注释的「插件」tabs 入口与 AdminPluginsPanel 渲染行。
 */
const PLUGIN_SYSTEM_ENABLED
    = String(process.env.PLUGIN_SYSTEM_ENABLED || '').trim().toLowerCase() === 'true';

module.exports = { PLUGIN_SYSTEM_ENABLED };

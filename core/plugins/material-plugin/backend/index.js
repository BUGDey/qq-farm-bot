// 素材插件 backend stub：不提供活动面板、自动化或协议服务；
// 只靠 manifest.gameConfig.provides=true 让宿主自动把 assets/ 与 catalog/ 合并进核心配置。
module.exports = {
    apiVersion: 1,
    admin: {
        register() {},
        unregister() {},
    },
    worker: {
        register() {},
        unregister() {},
    },
};

/**
 * worker 插件宿主的模块级桥。
 *
 * worker.js 创建宿主实例后注册到这里；warehouse 等不依赖 worker.js
 * 的模块通过桥访问插件扩展（当前仅果实保留谓词），避免相互 require。
 */

let hostRef = null;

function setWorkerPluginHost(host) {
    hostRef = host || null;
}

function reserveFruit(itemId, context) {
    try {
        return hostRef ? hostRef.reserveFruit(itemId, context) === true : false;
    } catch {
        return false;
    }
}

module.exports = { setWorkerPluginHost, reserveFruit };

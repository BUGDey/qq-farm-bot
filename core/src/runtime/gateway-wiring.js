/**
 * 网关模式接线（纯函数，便于测试）
 *
 * 关键点：`createNetwork(direct)` 里的 `direct` 必须是**覆盖之前的快照**。
 * 如果直接把 module.exports 传进去再 Object.assign 回同一个对象，
 * 包装函数里再调用 `direct.sendMsgAsync()` 就会调到自己 → 无限递归 →
 * "Maximum call stack size exceeded"，worker 一启动就崩。
 */
'use strict';

function applyGatewayOverrides(target, createNetwork) {
    if (!target || typeof createNetwork !== 'function') {
        throw new TypeError('applyGatewayOverrides 需要目标对象与 createNetwork');
    }
    // 浅拷贝一层：函数引用在此刻冻结，后续对 target 的覆盖不会影响 direct
    const direct = Object.assign({}, target);
    const wrapper = createNetwork(direct);
    Object.assign(target, wrapper);
    return target;
}

module.exports = { applyGatewayOverrides };
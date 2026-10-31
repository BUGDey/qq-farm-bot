'use strict';

/**
 * 错误分类：把底层报错归一到少数几类，供前端提示与重试策略使用。
 *
 * 之前 api_response 只带一段纯文本错误，前端无法区分"网络断了"和"被限流"，
 * 只能统一提示失败；这里给每条错误附上 errorType 与 retryable，前端可据此
 * 决定是提示重试、等待，还是让用户重新登录。
 *
 * errorType 取值：
 *   offline        未连接 / 连接断开
 *   timeout        请求超时、网关无响应
 *   rate_limit     服务端限流、操作过于频繁
 *   gateway_busy   本地排队让位（非错误，稍后重试）
 *   automation_busy 自动任务正在执行同类操作
 *   auth           登录失效、鉴权失败
 *   protocol       请求参数/协议解码错误
 *   server         服务端内部错误
 *   unknown        其余
 */

const RETRYABLE_TYPES = new Set(['offline', 'timeout', 'gateway_busy', 'automation_busy', 'server']);

const RULES = [
    { type: 'rate_limit', retryable: true, patterns: [/限流/, /过于频繁/, /操作太快/, /rate\s*limit/i, /too\s*many\s*requests/i] },
    { type: 'auth', retryable: false, patterns: [/登录失效/, /未登录/, /请重新登录/, /鉴权失败/, /token\s*(失效|过期|无效)/i, /unauthori[sz]ed/i, /forbidden/i] },
    { type: 'offline', retryable: true, patterns: [/未连接/, /连接已断开/, /连接断开/, /断线/, /网络未就绪/, /not\s*connected/i, /socket\s*(closed|hang\s*up)/i] },
    { type: 'timeout', retryable: true, patterns: [/超时/, /timeout/i, /timed\s*out/i, /ETIMEDOUT/i, /没有响应/, /网关无响应/] },
    { type: 'protocol', retryable: false, patterns: [/协议/, /解码失败/, /decode/i, /protobuf/i, /unknown\s*method/i, /参数(错误|不合法)/, /invalid\s*(argument|param)/i] },
    { type: 'server', retryable: true, patterns: [/服务器(内部)?错误/, /internal\s*server\s*error/i, /\b50[0-4]\b/] },
];

function normalizeText(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return String(error.message || error.error || '');
}

/**
 * @param {Error|string|object} error
 * @param {{ phase?: string }} [context]
 * @returns {{ errorType: string, retryable: boolean, message: string, phase: string }}
 */
function classifyError(error, context = {}) {
    const message = normalizeText(error);
    const phase = String(context.phase || '');
    const explicit = (error && typeof error === 'object')
        ? String(error.errorType || error.code || '')
        : '';
    const explicitType = explicit === 'AUTOMATION_BUSY' ? 'automation_busy'
        : explicit === 'GATEWAY_BUSY' ? 'gateway_busy'
            : explicit;

    const known = new Set(['offline', 'timeout', 'rate_limit', 'gateway_busy', 'automation_busy', 'auth', 'protocol', 'server', 'unknown']);
    if (known.has(explicitType)) {
        return { errorType: explicitType, retryable: RETRYABLE_TYPES.has(explicitType), message, phase };
    }

    const name = error && typeof error === 'object' ? String(error.name || '') : '';
    if (name === 'AutomationBusyError') {
        return { errorType: 'automation_busy', retryable: true, message, phase };
    }
    if (name === 'GatewayBusyError') {
        return { errorType: 'gateway_busy', retryable: true, message, phase };
    }

    for (const rule of RULES) {
        if (rule.patterns.some(pattern => pattern.test(message))) {
            return { errorType: rule.type, retryable: rule.retryable, message, phase };
        }
    }

    return { errorType: 'unknown', retryable: false, message, phase };
}

function isRetryable(error, context) {
    return classifyError(error, context).retryable;
}

module.exports = { classifyError, isRetryable, RETRYABLE_TYPES };

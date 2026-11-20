'use strict';

// Keep IPC diagnostics structured; never include API arguments (which may contain credentials).
function workerApiError(method, timeoutMs, accountId) {
    const error = new Error(`Worker 调用超时: ${method}，等待 ${timeoutMs}ms（账号 ${accountId}）；任务可能仍在执行，写操作请先核对结果，不要重复提交`);
    error.code = 'WORKER_API_TIMEOUT';
    error.method = method;
    error.timeoutMs = timeoutMs;
    return error;
}
function serializeWorkerError(error) {
    const result = {};
    for (const key of ['code', 'errorType', 'method', 'scene']) {
        if (typeof error?.[key] === 'string') result[key] = error[key].slice(0, 160);
    }
    for (const key of ['timeoutMs', 'elapsedMs']) {
        if (Number.isFinite(error?.[key])) result[key] = error[key];
    }
    const causeCode = error?.cause?.code;
    if (typeof causeCode === 'string') result.causeCode = causeCode.slice(0, 80);
    return result;
}
function restoreWorkerError(message, details = {}) {
    const error = new Error(String(message));
    Object.assign(error, serializeWorkerError(details));
    if (typeof details.causeCode === 'string') error.cause = { code: details.causeCode.slice(0, 80) };
    return error;
}
module.exports = { workerApiError, serializeWorkerError, restoreWorkerError };

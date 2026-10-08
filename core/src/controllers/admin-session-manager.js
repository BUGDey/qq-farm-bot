/**
 * 会话管理
 *
 * 职责：
 *   1. 生成/校验 token（x-admin-token 请求头）
 *   2. 每次带 token 的请求都复查账号状态：封禁 / 过期 / 会话超时 -> 强制登出
 *   3. 定时清理失效会话并断开对应 WebSocket
 */
const crypto = require('node:crypto');
const { USER_SYSTEM_CONFIG, isElevatedRole } = require('../config/user-system');
const userStore = require('../models/user-store');

function createAdminSessionManager({ logger, getIo }) {
  const adminTokens = new Set();
  const adminSessions = new Map();

  function generateAdminToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  function sendUnauthorized(res) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
    });
  }

  function logSessionEvent(event, reason, username) {
    const fn = logger && typeof logger.info === 'function' ? logger.info : () => {};
    fn.call(logger, event, { reason, username });
  }

  function logSessionRejected(reason, username) {
    const fn = logger && typeof logger.warn === 'function' ? logger.warn : () => {};
    fn.call(logger, 'session rejected', { reason, username });
  }

  function createAdminSession(user) {
    const token = generateAdminToken();
    adminTokens.add(token);
    adminSessions.set(token, {
      ...user,
      card: user.subscription || user.card || null,
      createdAt: Date.now(),
    });
    return token;
  }

  function invalidateAdminSession(token) {
    adminTokens.delete(token);
    adminSessions.delete(token);
  }

  function disconnectAdminTokenSockets(token) {
    const io = typeof getIo === 'function' ? getIo() : null;
    if (!io) return;
    for (const socket of io.sockets.sockets.values()) {
      String(socket.data.adminToken || '') === String(token)
        && socket.disconnect(true);
    }
  }

  function invalidateAdminSessionAndDisconnect(token) {
    invalidateAdminSession(token);
    disconnectAdminTokenSockets(token);
  }

  function invalidateAdminSessions(predicate) {
    for (const [token, session] of adminSessions.entries()) {
      if (predicate(session, token))
        invalidateAdminSessionAndDisconnect(token);
    }
  }

  function updateAdminSessions(predicate, updateSession) {
    for (const [token, session] of adminSessions.entries()) {
      if (predicate(session, token)) {
        updateSession(session, token);
        adminSessions.set(token, session);
      }
    }
  }

  /**
   * 复查会话是否仍然有效
   * 管理员 / 超级管理员豁免有效期检查
   */
  function getSessionRejection(session) {
    if (!session) return { reason: 'no_session', error: 'Unauthorized' };
    if (isElevatedRole(session.role)) return null;

    const subscription = session.subscription || session.card || null;
    if (subscription && subscription.enabled === false) {
      return { reason: 'disabled', error: '账号已被禁用，请联系管理员' };
    }
    if (subscription && userStore.isSubscriptionExpired(subscription)) {
      return { reason: 'expired', error: '账号已过期，请续费后重新登录' };
    }
    const ttl = Number(USER_SYSTEM_CONFIG.sessionTtlMs) || 0;
    if (ttl > 0 && session.createdAt && Date.now() - session.createdAt > ttl) {
      return { reason: 'timeout', error: '登录已超时，请重新登录' };
    }
    return null;
  }

  function requireAdminToken(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!token || !adminTokens.has(token))
      return sendUnauthorized(res);
    req.adminToken = token;
    req.currentUser = adminSessions.get(token);
    const rejection = getSessionRejection(req.currentUser);
    if (rejection) {
      logSessionRejected(rejection.reason, req.currentUser?.username);
      invalidateAdminSession(token);
      return res.status(403).json({
        ok: false,
        error: rejection.error,
        errorType: rejection.reason,
      });
    }
    next();
  }

  function cleanupInvalidAdminSessions() {
    const expiredSessions = [];
    for (const [token, session] of adminSessions.entries()) {
      const rejection = getSessionRejection(session);
      if (!rejection) continue;
      logSessionEvent('session cleanup queued', rejection.reason, session.username);
      expiredSessions.push({ token, username: session.username, reason: rejection.reason });
    }
    for (const { token, username, reason } of expiredSessions) {
      invalidateAdminSessionAndDisconnect(token);
      logSessionEvent('session force logout', reason, username);
    }
  }

  function hasToken(token) {
    return adminTokens.has(token);
  }

  function getSession(token) {
    return adminSessions.get(token) || null;
  }

  return {
    cleanupInvalidAdminSessions,
    createAdminSession,
    getSession,
    getSessionRejection,
    hasToken,
    invalidateAdminSessionAndDisconnect,
    invalidateAdminSessions,
    requireAdminToken,
    updateAdminSessions,
  };
}

module.exports = {
  createAdminSessionManager,
};

/**
 * 登录页「账号续费」辅助路由。
 *
 * 续费本身复用已有的 `POST /api/public/renew`（见 admin-auth-routes.js：用户名 + 卡密，
 * 免登录、受 USER_SYSTEM_CONFIG.allowPublicRenew 开关与 IP 限流约束），这里只补一个
 * 「查账号有效期状态」的只读接口，让登录页在核销前就能提示「该账号已过期 / 有效期至」。
 */

const userStore = require('../models/user-store');

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  return req.socket?.remoteAddress || req.ip || '';
}

/** 只回传续费需要的字段，避免把角色、创建人等管理信息暴露给未登录访客 */
function toRenewStatus(user) {
  if (!user) return null;
  return {
    username: user.username,
    isExpired: user.isExpired === true,
    isPermanent: user.subscription?.isPermanent === true,
    expiresAt: user.subscription?.expiresAt || null,
    expiresAtText: user.expiresAtText || '',
    remainingText: user.remainingText || '',
    accountLimit: user.accountLimit,
  };
}

function registerPublicRenewRoutes({ app }) {
  app.get('/api/public/account-status', (req, res) => {
    try {
      const username = String(req.query?.username || '').trim();
      if (!username) return res.status(400).json({ ok: false, error: '请输入账号' });

      const rate = userStore.checkRateLimit(getClientIp(req));
      if (!rate.allowed) {
        return res.status(429).json({ ok: false, error: rate.message, errorType: 'rate_limit' });
      }

      const user = userStore.getUserByName(username);
      if (!user) return res.json({ ok: true, data: { exists: false, username } });
      return res.json({ ok: true, data: { exists: true, ...toRenewStatus(user) } });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { registerPublicRenewRoutes };
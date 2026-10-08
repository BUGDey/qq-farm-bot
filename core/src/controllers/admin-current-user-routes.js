/**
 * 当前登录用户相关接口
 */
const { USER_SYSTEM_CONFIG, isElevatedRole } = require('../config/user-system');

function requireCurrentUser(req, res) {
  const currentUser = req.currentUser;
  if (!currentUser) {
    res.status(401).json({ ok: false, error: '未登录' });
    return null;
  }
  return currentUser;
}

function registerAdminCurrentUserRoutes({
  app,
  requireAdminToken,
  userStore,
  store,
  getAccountsForUser,
}) {
  app.get('/api/user/me', requireAdminToken, (req, res) => {
    try {
      const currentUser = requireCurrentUser(req, res);
      if (!currentUser) return;

      const subscription = currentUser.subscription || currentUser.card || null;
      const accountCount = getAccountsForUser
        ? getAccountsForUser().filter(item => item.username === currentUser.username).length
        : 0;
      const limit = Number(currentUser.accountLimit);
      const unlimited = isElevatedRole(currentUser.role) || limit === -1;

      res.json({
        ok: true,
        data: {
          username: currentUser.username,
          role: currentUser.role,
          card: subscription,
          subscription,
          accountLimit: currentUser.accountLimit || userStore.DEFAULT_ACCOUNT_LIMIT || 2,
          accountCount,
          accountRemaining: unlimited ? -1 : Math.max(0, (Number.isFinite(limit) ? limit : 0) - accountCount),
          isExpired: subscription ? userStore.isSubscriptionExpired(subscription) : false,
          remainingMs: subscription ? userStore.getRemainingMs(subscription) : 0,
          allowRegister: USER_SYSTEM_CONFIG.allowRegister === true,
          allowPublicRenew: USER_SYSTEM_CONFIG.allowPublicRenew === true,
          allowPublicResetPassword: USER_SYSTEM_CONFIG.allowPublicResetPassword === true,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/user/device-protocol', requireAdminToken, (req, res) => {
    try {
      const currentUser = requireCurrentUser(req, res);
      if (!currentUser) return;

      const config = store.setUserDeviceProtocol(
        req.body || {},
        currentUser.username,
      );
      res.json({ ok: true, config });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('/api/user/device-protocol', requireAdminToken, (req, res) => {
    try {
      const currentUser = requireCurrentUser(req, res);
      if (!currentUser) return;

      res.json({
        ok: true,
        config: store.getUserDeviceProtocol(currentUser.username),
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { registerAdminCurrentUserRoutes };

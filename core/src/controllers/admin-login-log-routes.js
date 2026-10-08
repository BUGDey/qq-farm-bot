/**
 * 管理员后台 —— 登录审计日志
 */
function registerAdminLoginLogRoutes({
  app,
  requireAdminToken,
  requireAdminRole,
  requireDangerConfirmation,
  userStore,
  adminLogger,
}) {
  app.get('/api/admin/login-logs', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const { limit, offset, username, event } = req.query || {};
      const result = userStore.getLoginLogs({
        limit: Number.parseInt(limit) || 100,
        offset: Number.parseInt(offset) || 0,
        username: username || '',
        event: event || '',
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.delete('/api/admin/login-logs', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'CLEAR_LOGIN_LOGS')) return;
      const result = userStore.clearLoginLogs();
      adminLogger.warn('清空登录日志', {
        admin: req.currentUser?.username || '',
        confirmation: 'CLEAR_LOGIN_LOGS',
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { registerAdminLoginLogRoutes };

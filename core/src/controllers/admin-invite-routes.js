/**
 * 邀请奖励相关路由
 *
 * 用户侧：GET /api/user/invite             我的邀请码与战绩
 * 管理侧：GET  /api/admin/invite/overview  开关 + 规则 + 统计 + 记录
 *         POST /api/admin/invite/settings  保存开关与奖励规则
 * 公开侧：GET  /api/public/invite/preview   注册页预览邀请码是否有效（不消耗、不记流水）
 */
const invite = require('../services/invite-rewards');

function registerAdminInviteRoutes({
  app,
  requireAdminToken,
  requireAdminRole,
  userStore,
  inviteService = invite,
}) {
  /** 我的邀请码 */
  app.get('/api/user/invite', requireAdminToken, (req, res) => {
    const username = req.currentUser?.username;
    if (!username) return res.status(401).json({ ok: false, error: '未登录' });
    try {
      return res.json({ ok: true, data: inviteService.getUserSummary(username) });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 管理后台概览 */
  app.get('/api/admin/invite/overview', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const limit = Number.parseInt(req.query.limit, 10) || 100;
      return res.json({ ok: true, data: inviteService.getAdminOverview({ limit }) });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 管理后台保存开关与规则 */
  app.post('/api/admin/invite/settings', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const settings = inviteService.saveSettings(req.body || {});
      return res.json({ ok: true, data: { settings } });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 注册页预览：只判断能不能拿奖励，不写任何记录 */
  app.get('/api/public/invite/preview', (req, res) => {
    try {
      const code = String(req.query.code || '');
      const settings = inviteService.getSettings();
      if (!settings.enabled) {
        return res.json({ ok: true, data: { valid: false, reason: 'disabled' } });
      }
      const found = inviteService.findInviterByCode(code);
      if (!found) {
        return res.json({ ok: true, data: { valid: false, reason: 'code_not_found' } });
      }
      return res.json({
        ok: true,
        data: {
          valid: true,
          inviter: found.username,
          inviteeDays: settings.inviteeDays,
          inviterDays: settings.inviterDays,
        },
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { registerAdminInviteRoutes };
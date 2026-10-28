/**
 * 系统公告接口。
 *
 * - GET  /api/announcement        当前登录用户拉取公告（含是否需要弹出）
 * - POST /api/announcement/read   标记已读
 * - GET  /api/admin/announcement  管理员读取公告设置
 * - POST /api/admin/announcement  管理员保存公告内容（可设置每次登录都弹）
 */
function registerAnnouncementRoutes({ app, requireAdminToken, requireAdminRole, store }) {
  const currentUsername = (req) => String(req.currentUser?.username || '').trim();

  app.get('/api/announcement', requireAdminToken, (req, res) => {
    try {
      const username = currentUsername(req);
      const announcement = store.getAnnouncement();
      res.json({
        ok: true,
        data: {
          content: announcement.content,
          showOnce: announcement.showOnce,
          updatedAt: announcement.updatedAt,
          shouldShow: username ? store.shouldShowAnnouncement(username) : false,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/announcement/read', requireAdminToken, (req, res) => {
    try {
      const username = currentUsername(req);
      if (!username) {
        res.status(401).json({ ok: false, error: '未登录' });
        return;
      }
      store.markAnnouncementRead(username);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('/api/admin/announcement', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      res.json({ ok: true, data: store.getAnnouncement() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/admin/announcement', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const body = req.body || {};
      const content = String(body.content ?? '').trim();
      const showOnce = body.showOnce !== false;
      res.json({ ok: true, data: store.setAnnouncement(content, showOnce) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { registerAnnouncementRoutes };
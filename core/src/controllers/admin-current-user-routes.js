/**
 * 当前登录用户相关接口
 */
const fs = require('fs');
const path = require('path');
const { USER_SYSTEM_CONFIG, isElevatedRole } = require('../config/user-system');
const { getAccountOwner } = require('./admin-account-access');

/** 本站排行：聚合全部账号的日/周/月/总历史偷菜与赚取收益（登录用户可看，前端负责脱敏展示） */
function registerRankingRoute({ app, requireAdminToken, store }) {
  app.get('/api/ranking', requireAdminToken, (req, res) => {
    try {
      const period = ['daily', 'weekly', 'monthly', 'total'].includes(String(req.query.period || '')) ? String(req.query.period) : 'daily';
      const type = ['earn', 'steal'].includes(String(req.query.type || '')) ? String(req.query.type) : 'earn';

      const dataDir = process.env.FARM_DATA_DIR || path.join(__dirname, '../../data');
      const statsDir = path.join(dataDir, 'stats');
      const accounts = store.getAccounts();
      const accountList = accounts && Array.isArray(accounts.accounts) ? accounts.accounts : [];
      const byId = new Map();
      for (const account of accountList) {
        byId.set(String(account.id), {
          name: String(account.name || account.username || ''),
          avatar: String(account.avatar || ''),
          platform: String(account.platform || 'qq'),
          owner: getAccountOwner(account),
        });
      }

      const rows = [];
      if (fs.existsSync(statsDir)) {
        for (const file of fs.readdirSync(statsDir)) {
          if (!file.endsWith('.json')) continue;
          try {
            const raw = JSON.parse(fs.readFileSync(path.join(statsDir, file), 'utf8'));
            const seg = raw && raw.rank && raw.rank[period];
            if (!seg || typeof seg !== 'object') continue;
            const accountId = file.replace(/\.json$/, '');
            const meta = byId.get(accountId) || { name: '', avatar: '', platform: 'qq', owner: '' };
            rows.push({
              accountId,
              name: meta.name,
              avatar: meta.avatar,
              platform: meta.platform,
              owner: meta.owner,
              steal: Number(seg.steal) || 0,
              earn: Number(seg.earn) || 0,
              savedAt: Number(raw.savedAt) || 0,
            });
          } catch {}
        }
      }

      rows.sort((a, b) => (Number(b[type]) || 0) - (Number(a[type]) || 0));
      res.json({ ok: true, data: { period, type, list: rows.slice(0, 50) } });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}

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
  registerRankingRoute({ app, requireAdminToken, store });

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

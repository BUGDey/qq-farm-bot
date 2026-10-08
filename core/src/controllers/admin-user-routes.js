/**
 * 管理员后台 —— 普通用户管理
 *
 * 权限矩阵：
 *   GET    /api/admin/users                  管理员：查看全部用户
 *   POST   /api/admin/users                  管理员：直接开号（可指定有效期/额度）
 *   POST   /api/admin/users/:username/edit   管理员：编辑用户（资料/密码/角色/额度/有效期）
 *   POST   /api/admin/users/:username        管理员：启停 / 改有效期（需危险操作确认）
 *   DELETE /api/admin/users/:username        管理员：删除用户（需危险操作确认）
 *   POST   /api/admin/users/:username/renew  管理员：代用户核销卡密
 *   GET    /api/admin/users/:username/accounts 管理员：查看用户名下农场账号与配置
 *   POST   /api/admin/users/clear-expired    管理员：清理已过期用户
 *
 * 普通管理员不能增删改其他管理员账号（getAdminUserMutationError 拦截）。
 */
const { USER_ROLES, isElevatedRole } = require('../config/user-system');

function parseExpiresAt(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '' || value === 0) return null;
  const text = String(value).trim();
  // 支持 "YYYY-MM-DD HH:mm" / "YYYY-MM-DDTHH:mm" / 时间戳
  if (/^\d+$/.test(text)) return Number(text);
  const normalized = text.replace(' ', 'T');
  const parsed = Date.parse(normalized.length <= 16 ? `${normalized}:00` : normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function registerAdminUserRoutes({
  app,
  requireAdminToken,
  requireAdminRole,
  requireSuperAdminRole,
  requireDangerConfirmation,
  getAdminUserMutationError,
  userStore,
  adminLogger,
  invalidateAdminSessions,
  updateAdminSessions,
  getAccountsForUser,
  store,
}) {
  /** 用户列表（附带农场账号数量） */
  app.get('/api/admin/users', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const users = userStore.listUsersForAdmin({
        countAccounts: (username) => {
          const list = getAccountsForUser ? getAccountsForUser() : [];
          return list.filter(account => account.username === username).length;
        },
      });
      res.json({ ok: true, data: users });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 管理员直接开号 */
  app.post('/api/admin/users', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const {
        username, password, role, accountLimit, expiresAt, isPermanent,
        nick, email, phone, remark,
      } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ ok: false, error: '请提供用户名和密码' });
      }
      if (role === USER_ROLES.SUPER_ADMIN && req.currentUser?.role !== USER_ROLES.SUPER_ADMIN) {
        return res.status(403).json({ ok: false, error: '只有超级管理员可以创建超级管理员账号' });
      }
      const result = userStore.createUserByAdmin({
        username,
        password,
        role,
        accountLimit,
        expiresAt: parseExpiresAt(expiresAt),
        isPermanent: isPermanent === true,
        nick,
        email,
        phone,
        remark,
        operator: req.currentUser?.username || '',
      });
      if (!result.ok) return res.status(400).json(result);
      adminLogger.info('管理员开号', {
        admin: req.currentUser?.username || '',
        username: result.user.username,
        role: result.user.role,
      });
      res.json({ ok: true, data: result.user });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 编辑用户资料 */
  app.post('/api/admin/users/:username/edit', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const { username } = req.params;
      const mutationError = getAdminUserMutationError(req.currentUser, username);
      if (mutationError) return res.status(403).json({ ok: false, error: mutationError });

      const {
        newUsername, password, role, accountLimit, expiresAt, isPermanent,
        enabled, nick, email, phone, remark,
      } = req.body || {};

      const targetUser = typeof userStore.getUserByName === 'function'
        ? userStore.getUserByName(username)
        : null;
      if (!targetUser) return res.status(404).json({ ok: false, error: '用户不存在' });

      // 角色校验：只在「角色真的发生变化」时才限制。
      // 编辑表单每次都会带上 role 字段，若无条件校验会导致管理员连自己的昵称/密码都改不了。
      let nextRole;
      if (role !== undefined && role !== null && role !== '') {
        nextRole = role;
        const currentRole = targetUser.role || USER_ROLES.USER;
        if (role !== currentRole) {
          const isSelf = String(req.currentUser?.username || '').trim() === String(username).trim();
          if (isSelf) {
            return res.status(400).json({ ok: false, error: '不能修改自己的角色，以免把自己锁在门外' });
          }
          if (role === USER_ROLES.SUPER_ADMIN && req.currentUser?.role !== USER_ROLES.SUPER_ADMIN) {
            return res.status(403).json({ ok: false, error: '只有超级管理员可以授予超级管理员角色' });
          }
          if (isElevatedRole(currentRole) && req.currentUser?.role !== USER_ROLES.SUPER_ADMIN) {
            return res.status(403).json({ ok: false, error: '只有超级管理员可以调整其他管理员的角色' });
          }
        }
      }

      const result = userStore.editUser(username, {
        newUsername,
        password,
        role: nextRole,
        accountLimit,
        expiresAt: parseExpiresAt(expiresAt),
        isPermanent: isPermanent === true,
        enabled,
        nick,
        email,
        phone,
        remark,
      });
      if (!result.ok) return res.status(400).json(result);

      adminLogger.warn('编辑用户', {
        admin: req.currentUser?.username || '',
        username,
        newUsername: result.user?.username || username,
        changedPassword: !!String(password || '').trim(),
        accountLimit: result.user?.accountLimit ?? null,
        isPermanent: isPermanent === true,
        expiresAt: result.user?.subscription?.expiresAt ?? null,
      });

      updateAdminSessions(
        session => session.username === username,
        (session) => {
          session.username = result.user.username;
          session.subscription = result.user.subscription;
          session.card = result.user.subscription;
          session.accountLimit = result.user.accountLimit;
          session.role = result.user.role;
        },
      );
      res.json({ ok: true, data: result.user });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 启停 / 改有效期（危险操作） */
  app.post('/api/admin/users/:username', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'UPDATE_USER_STATUS')) return;
      const { username } = req.params;
      const mutationError = getAdminUserMutationError(req.currentUser, username);
      if (mutationError) return res.status(403).json({ ok: false, error: mutationError });

      const { enabled, expiresAt, isPermanent } = req.body || {};
      const updates = {};
      if (enabled !== undefined) updates.enabled = enabled !== false;
      if (isPermanent === true) updates.isPermanent = true;
      if (updates.isPermanent !== true) {
        const parsed = parseExpiresAt(expiresAt);
        if (parsed !== undefined) updates.expiresAt = parsed;
      }

      const result = userStore.updateUser(username, updates);
      if (!result.ok) return res.status(404).json(result);

      adminLogger.warn('更新用户状态', {
        admin: req.currentUser?.username || '',
        username,
        enabled: result.user?.subscription?.enabled ?? null,
        expiresAt: result.user?.subscription?.expiresAt ?? null,
        confirmation: 'UPDATE_USER_STATUS',
      });
      updateAdminSessions(
        session => session.username === username,
        (session) => {
          session.subscription = result.user.subscription;
          session.card = result.user.subscription;
        },
      );
      res.json({ ok: true, data: result.user });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 代用户核销卡密 */
  app.post('/api/admin/users/:username/renew', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'RENEW_USER')) return;
      const { username } = req.params;
      const { cardCode } = req.body || {};
      if (!cardCode) return res.status(400).json({ ok: false, error: '请提供卡密' });

      const result = userStore.redeemCard(username, cardCode, {
        operator: req.currentUser?.username || 'admin',
      });
      if (!result.ok) return res.status(400).json(result);

      updateAdminSessions(
        session => session.username === username,
        (session) => {
          session.subscription = result.subscription;
          session.card = result.subscription;
          session.accountLimit = result.accountLimit;
        },
      );
      adminLogger.warn('管理员代续费', {
        admin: req.currentUser?.username || '',
        username,
        cardCode,
        cardType: result.cardType || null,
        summary: result.summary || '',
        confirmation: 'RENEW_USER',
      });
      res.json({
        ok: true,
        data: {
          subscription: result.subscription,
          accountLimit: result.accountLimit,
          cardType: result.cardType,
          summary: result.summary,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 查看用户名下农场账号及其自动化配置 */
  app.get('/api/admin/users/:username/accounts', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const { username } = req.params;
      const withConfig = req.query?.withConfig === '1' || req.query?.withConfig === 'true';
      const all = getAccountsForUser ? getAccountsForUser() : [];
      const accounts = all
        .filter(account => (account.owner || account.username) === username)
        .map((account) => {
          const base = {
            id: account.id,
            name: account.name || '',
            platform: account.platform || '',
            uin: account.uin || account.qq || '',
            nick: account.nick || '',
            createdAt: account.createdAt || null,
            updatedAt: account.updatedAt || null,
          };
          if (!withConfig || !store || typeof store.getConfigSnapshot !== 'function') return base;
          try {
            const config = store.getConfigSnapshot(account.id) || {};
            return {
              ...base,
              config: {
                automation: config.automation || {},
                intervals: config.intervals || {},
                plantingStrategy: config.plantingStrategy || '',
                friendQuietHours: config.friendQuietHours || null,
                plantBlacklist: config.plantBlacklist || [],
              },
            };
          } catch {
            return base;
          }
        });
      const offlineReminder = store && typeof store.getOfflineReminder === 'function'
        ? store.getOfflineReminder(username)
        : null;
      res.json({
        ok: true,
        data: { username, accounts, total: accounts.length, offlineReminder },
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 删除用户 */
  app.delete('/api/admin/users/:username', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'DELETE_USER')) return;
      const { username } = req.params;
      const currentUser = req.currentUser;
      if (currentUser && currentUser.username === username) {
        return res.status(400).json({ ok: false, error: '不能删除自己的账号' });
      }
      const mutationError = getAdminUserMutationError(currentUser, username);
      if (mutationError) return res.status(403).json({ ok: false, error: mutationError });

      const force = req.body?.force === true;
      const result = userStore.deleteUser(username, { force });
      if (!result.ok) return res.status(400).json(result);

      adminLogger.warn('删除用户', {
        admin: currentUser?.username || '',
        username,
        confirmation: 'DELETE_USER',
      });
      invalidateAdminSessions(session => session.username === username);
      res.json({ ok: true, data: result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 清理已过期的普通用户 */
  app.post('/api/admin/users/clear-expired', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'CLEAR_EXPIRED_USERS')) return;
      const result = userStore.clearExpiredUsers();
      if (result.ok && result.deletedCount > 0) {
        for (const username of result.deletedUsers) {
          invalidateAdminSessions(session => session.username === username);
        }
        adminLogger.info('清理到期用户', {
          admin: req.currentUser?.username || '',
          deletedCount: result.deletedCount,
          deletedUsers: result.deletedUsers,
        });
      }
      res.json({ ok: true, data: result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 用户统计概览 */
  app.get('/api/admin/users/stats', requireAdminToken, requireAdminRole, (_req, res) => {
    try {
      const users = userStore.getAllUsers();
      const nowTs = Date.now();
      const stats = {
        total: users.length,
        admin: 0,
        active: 0,
        expired: 0,
        disabled: 0,
        permanent: 0,
      };
      for (const user of users) {
        if (user.role !== USER_ROLES.USER) {
          stats.admin += 1;
          continue;
        }
        if (user.subscription?.enabled === false) {
          stats.disabled += 1;
          continue;
        }
        if (user.subscription?.isPermanent === true) {
          stats.permanent += 1;
          stats.active += 1;
          continue;
        }
        const expiresAt = Number(user.subscription?.expiresAt || 0);
        if (expiresAt > 0 && expiresAt <= nowTs) stats.expired += 1;
        else stats.active += 1;
      }
      res.json({ ok: true, data: stats });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 仅超级管理员：查看含密码哈希的用户列表 */
  app.get('/api/admin/users-with-password', requireAdminToken, requireSuperAdminRole, (_req, res) => {
    try {
      res.status(403).json({ ok: false, error: '出于安全考虑不提供密码导出' });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { registerAdminUserRoutes };

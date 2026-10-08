/**
 * 认证相关路由：登录 / 注册（绑定卡密）/ 续费 / 改密 / 找回密码 / 卡密预览
 *
 * 全部接口位于 /api 下，其中 login、register、card/info、public/* 需要在
 * admin.js 的 PUBLIC_API_PATHS 中放行，无需 token 即可访问。
 */
const { USER_SYSTEM_CONFIG } = require('../config/user-system');

function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return cfIp.trim();

  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp.trim();

  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const candidates = forwardedFor
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    if (candidates.length > 0) return candidates[0];
  }

  if (req.ip && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') return req.ip;

  const remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
  if (remoteAddress?.startsWith('::ffff:')) return remoteAddress.substring(7);
  return remoteAddress || 'unknown';
}

function statusForError(errorType) {
  if (errorType === 'rate_limit') return 429;
  if (errorType === 'locked') return 423;
  if (errorType === 'disabled') return 403;
  if (errorType === 'expired') return 403;
  return 401;
}

function registerAdminAuthRoutes({
  app,
  logger,
  userStore,
  requireAdminToken,
  createAdminSession,
  updateAdminSessions,
}) {
  /** 登录：用户名 + 密码，校验有效期与封禁状态 */
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!username || !password) {
      return res.status(401).json({ ok: false, error: '请输入用户名和密码' });
    }

    const result = userStore.validateUser(username, password, ip);
    if (!result || result.error) {
      const errorType = result ? result.error : 'invalid_credentials';
      const message = result ? result.message : '用户名或密码错误';
      logger.warn('登录失败', { username, error: errorType, ip, message });
      userStore.addLoginLog('login_failed', username, errorType, ip, userAgent);
      return res.status(statusForError(errorType)).json({
        ok: false,
        error: message,
        errorType,
        remainingMs: result ? result.remainingMs : undefined,
      });
    }

    // 有效期与封禁检查（管理员与超级管理员豁免）
    const subscription = result.subscription || result.card || null;
    if (result.role === 'user' && subscription) {
      if (subscription.enabled === false) {
        userStore.addLoginLog('login_rejected', username, 'disabled', ip, userAgent);
        return res.status(403).json({ ok: false, error: '账号已被禁用，请联系管理员', errorType: 'disabled' });
      }
      if (userStore.isSubscriptionExpired(subscription)) {
        userStore.addLoginLog('login_rejected', username, 'expired', ip, userAgent);
        return res.status(403).json({ ok: false, error: '账号已过期，请续费后重新登录', errorType: 'expired' });
      }
    }

    userStore.addLoginLog('login_success', username, null, ip, userAgent);
    const token = createAdminSession(result);
    return res.json({
      ok: true,
      data: {
        token,
        role: result.role,
        card: subscription,
        subscription,
        accountLimit: result.accountLimit,
        expiresAt: subscription ? subscription.expiresAt : null,
        isPermanent: subscription ? subscription.isPermanent === true : true,
        isExpired: subscription ? userStore.isSubscriptionExpired(subscription) : false,
        user: { username: result.username },
        mustChangePassword: result.mustChangePassword || false,
      },
    });
  });

  /** 注册：必须绑定一张加时卡，卡密面值决定初始有效期 */
  app.post('/api/register', (req, res) => {
    const { username, password, cardCode } = req.body || {};
    const ip = getClientIp(req);
    if (!username || !password || !cardCode) {
      return res.status(400).json({ ok: false, error: '请填写用户名、密码和卡密' });
    }
    const rate = userStore.checkRateLimit(ip);
    if (!rate.allowed) {
      return res.status(429).json({ ok: false, error: rate.message, errorType: 'rate_limit' });
    }

    const result = userStore.registerUser(username, password, cardCode, { ip });
    if (!result.ok) {
      userStore.addLoginLog('register_failed', username, 'invalid_card', ip, req.headers['user-agent'] || '');
      return res.status(400).json(result);
    }
    userStore.addLoginLog('register_success', username, null, ip, req.headers['user-agent'] || '');
    return res.json({ ok: true, data: result.user });
  });

  /** 卡密预览：注册页输入卡密后回显面值（不消耗卡密） */
  app.get('/api/card/info/:code', (req, res) => {
    try {
      const { code } = req.params;
      const peek = userStore.peekCard(code);
      if (!peek.ok) return res.status(400).json({ ok: false, error: peek.error });
      return res.json({ ok: true, data: peek.card });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 当前用户配置概览（含额度使用情况） */
  app.get('/api/user/quota', requireAdminToken, (req, res) => {
    const currentUser = req.currentUser;
    if (!currentUser) return res.status(401).json({ ok: false, error: '未登录' });
    return res.json({
      ok: true,
      data: {
        username: currentUser.username,
        role: currentUser.role,
        accountLimit: currentUser.accountLimit,
        subscription: currentUser.subscription || currentUser.card || null,
        card: currentUser.subscription || currentUser.card || null,
      },
    });
  });

  /** 自助续费：加时卡延长有效期，额度卡提升账号配额 */
  app.post('/api/user/renew', requireAdminToken, (req, res) => {
    const { cardCode } = req.body || {};
    const username = req.currentUser?.username;
    if (!username) return res.status(401).json({ ok: false, error: '未登录' });
    if (!cardCode) return res.status(400).json({ ok: false, error: '请提供卡密' });

    const result = userStore.renewUser(username, cardCode);
    if (!result.ok) return res.status(400).json(result);

    updateAdminSessions(
      session => session.username === username,
      (session) => {
        session.subscription = result.subscription;
        session.card = result.subscription;
        session.accountLimit = result.accountLimit;
      },
    );
    return res.json({
      ok: true,
      data: {
        card: result.subscription,
        subscription: result.subscription,
        accountLimit: result.accountLimit,
        cardType: result.cardType,
        summary: result.summary,
      },
    });
  });

  /** 修改密码 */
  app.post('/api/user/change-password', requireAdminToken, (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    const username = req.currentUser?.username;
    if (!username) return res.status(401).json({ ok: false, error: '未登录' });
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: '请提供原密码和新密码' });
    }
    const result = userStore.changePassword(username, oldPassword, newPassword);
    return res.json(result);
  });

  /** 免登录续费（凭用户名 + 卡密） */
  app.post('/api/public/renew', (req, res) => {
    try {
      if (!USER_SYSTEM_CONFIG.allowPublicRenew) {
        return res.status(403).json({ ok: false, error: '未开放公开续费' });
      }
      const ip = getClientIp(req);
      const rate = userStore.checkRateLimit(ip);
      if (!rate.allowed) {
        return res.status(429).json({ ok: false, error: rate.message, errorType: 'rate_limit' });
      }
      const { username, cardCode } = req.body || {};
      if (!username) return res.status(400).json({ ok: false, error: '请提供用户名' });
      if (!cardCode) return res.status(400).json({ ok: false, error: '请提供卡密' });

      const result = userStore.renewUser(username, cardCode);
      if (!result.ok) return res.status(400).json(result);

      logger.info('公开续费成功', { username, cardType: result.cardType, ip });
      updateAdminSessions(
        session => session.username === username,
        (session) => {
          session.subscription = result.subscription;
          session.card = result.subscription;
          session.accountLimit = result.accountLimit;
        },
      );
      return res.json({
        ok: true,
        data: {
          subscription: result.subscription,
          accountLimit: result.accountLimit,
          cardType: result.cardType,
          summary: result.summary,
        },
      });
    } catch (error) {
      logger.error('公开续费失败', { error: error.message });
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 找回密码：校验用户名与卡密归属 */
  app.post('/api/public/reset-password/verify', (req, res) => {
    try {
      if (!USER_SYSTEM_CONFIG.allowPublicResetPassword) {
        return res.status(403).json({ ok: false, error: '未开放找回密码' });
      }
      const ip = getClientIp(req);
      const rate = userStore.checkRateLimit(ip);
      if (!rate.allowed) {
        return res.status(429).json({ ok: false, error: rate.message, errorType: 'rate_limit' });
      }
      const { username, cardCode } = req.body || {};
      if (!username || !cardCode) {
        return res.status(400).json({ ok: false, error: '请提供用户名和卡密' });
      }
      const result = userStore.verifyCardOwnership(username, cardCode);
      if (!result.ok) return res.status(400).json(result);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 找回密码：确认重置 */
  app.post('/api/public/reset-password/confirm', (req, res) => {
    try {
      if (!USER_SYSTEM_CONFIG.allowPublicResetPassword) {
        return res.status(403).json({ ok: false, error: '未开放找回密码' });
      }
      const ip = getClientIp(req);
      const rate = userStore.checkRateLimit(ip);
      if (!rate.allowed) {
        return res.status(429).json({ ok: false, error: rate.message, errorType: 'rate_limit' });
      }
      const { username, cardCode, newPassword } = req.body || {};
      if (!username || !cardCode || !newPassword) {
        return res.status(400).json({ ok: false, error: '请提供用户名、卡密和新密码' });
      }
      const result = userStore.resetPasswordByCard(username, cardCode, newPassword);
      if (!result.ok) return res.status(400).json(result);
      logger.info('找回密码重置成功', { username, ip });
      return res.json({ ok: true, message: result.message });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 卡密自助领取（发号机） */
  app.post('/api/card-claim/claim', (req, res) => {
    try {
      const userAgent = req.headers['user-agent'] || '';
      const username = req.body?.username || null;
      const claim = userStore.claimCardByUA(userAgent, username);
      if (!claim.ok) {
        const payload = { ok: false, error: claim.error };
        if (claim.remainingMs) payload.remainingMs = claim.remainingMs;
        return res.status(400).json(payload);
      }
      return res.json({ ok: true, cardCode: claim.cardCode, description: claim.description, valueText: claim.valueText });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 卡密领取开关状态 */
  app.get('/api/card-claim/status', (_req, res) => {
    try {
      const status = userStore.getCardClaimStatus();
      return res.json({ ok: true, ...status });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 我的核销记录 */
  app.get('/api/user/redemptions', requireAdminToken, (req, res) => {
    const username = req.currentUser?.username;
    if (!username) return res.status(401).json({ ok: false, error: '未登录' });
    const limit = Number.parseInt(req.query.limit) || 50;
    const result = userStore.getRedemptions({ username, limit });
    return res.json({ ok: true, data: result });
  });

  /** 兼容旧客户端：单机模式自动登录。多用户体系开启时禁止。 */
  app.post('/api/auto-login', (req, res) => {
    if (USER_SYSTEM_CONFIG.enabled) {
      return res.status(403).json({
        ok: false,
        error: '多用户体系已启用，请使用账号密码登录',
      });
    }
    const admin = {
      username: USER_SYSTEM_CONFIG.bootstrapAdminUsername,
      role: 'admin',
      accountLimit: -1,
      subscription: { isPermanent: true, expiresAt: null, enabled: true },
      card: { isPermanent: true, expiresAt: null, enabled: true },
    };
    const token = createAdminSession(admin);
    return res.json({
      ok: true,
      data: {
        token,
        role: admin.role,
        card: admin.card,
        subscription: admin.subscription,
        accountLimit: admin.accountLimit,
        user: { username: admin.username },
        mustChangePassword: false,
      },
    });
  });
}

module.exports = { registerAdminAuthRoutes, getClientIp };

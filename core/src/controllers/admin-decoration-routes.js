/**
 * 装扮（小屋 / 木牌 / 栅栏 / 围栏 / 仓库 / 街道 / 头像框）相关接口。
 *
 * GET  /api/decorations        列出全部装扮、按分类分组、标记是否已拥有
 * POST /api/decorations/equip  装备一件已拥有的装扮（body: { itemId }）
 */

const BAD_REQUEST_CODES = new Set([
  "INVALID_ARGUMENT",
  "DECORATION_NOT_FOUND",
  "DECORATION_NOT_OWNED",
]);

function getAuthorizedAccountId({
  req,
  res,
  getAccountIdFromRequest,
  canAccessAccount,
}) {
  const accountId = getAccountIdFromRequest(req);
  if (!accountId) {
    res.status(400).json({ ok: false, error: "Missing x-account-id" });
    return null;
  }
  if (!canAccessAccount(req, accountId)) {
    res.status(403).json({ ok: false, error: "无权访问此账号" });
    return null;
  }
  return accountId;
}

function respondError(res, error, sendProviderError, logger, label) {
  const code = String((error && error.code) || "");
  if (BAD_REQUEST_CODES.has(code)) {
    return res.status(400).json({
      ok: false,
      error: error.message,
      errorType: code,
    });
  }
  if (logger) {
    logger.error(label, { error: error.message, stack: error.stack });
  }
  return sendProviderError(res, error);
}

function registerAdminDecorationRoutes({
  app,
  provider,
  adminLogger,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  app.get("/api/decorations", async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
    });
    if (!accountId) return;

    try {
      const data = await provider.getDecorations(accountId);
      res.json({ ok: true, data });
    } catch (error) {
      respondError(res, error, sendProviderError, adminLogger, "获取装扮列表失败");
    }
  });

  // 医生模式：把三路来源的原始 ID 全吐出来，用来判断服务端到底认哪些装扮
  app.get("/api/decorations/diagnostics", async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
    });
    if (!accountId) return;

    try {
      const data = await provider.getDecorationDiagnostics(accountId);
      res.json({ ok: true, data });
    } catch (error) {
      respondError(res, error, sendProviderError, adminLogger, "获取装扮诊断失败");
    }
  });

  app.post("/api/decorations/equip", async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
    });
    if (!accountId) return;

    const itemId = Number((req.body && req.body.itemId) || 0);
    if (!itemId) {
      return res.status(400).json({
        ok: false,
        error: "缺少装扮 ID",
        errorType: "INVALID_ARGUMENT",
      });
    }

    try {
      const data = await provider.equipDecoration(accountId, itemId);
      res.json({ ok: true, data });
    } catch (error) {
      respondError(res, error, sendProviderError, adminLogger, "装备装扮失败");
    }
  });
}

module.exports = { registerAdminDecorationRoutes };
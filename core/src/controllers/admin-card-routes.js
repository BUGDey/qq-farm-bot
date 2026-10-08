/**
 * 管理员后台 —— 卡密管理
 *
 * 卡密分两类：
 *   time  加时卡：延长账号有效期（durationValue + durationUnit，或 isPermanent）
 *   quota 额度卡：增加可添加农场账号数量（value）
 *
 * 生命周期：生成(未使用) -> 核销(已使用) / 禁用 / 作废 / 删除
 * 所有核销与作废都会写入 card-redemptions.json 流水。
 */
const { CARD_TYPES } = require('../config/user-system');

function registerAdminCardRoutes({
  app,
  requireAdminToken,
  requireAdminRole,
  requireDangerConfirmation,
  userStore,
  adminLogger,
}) {
  /** 卡密列表（支持 type / status / keyword 过滤） */
  app.get('/api/admin/cards', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const { type, status, keyword } = req.query || {};
      const cards = userStore.getAllCards({ type, status, keyword });
      res.json({ ok: true, data: cards });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 卡密统计 */
  app.get('/api/admin/cards/stats', requireAdminToken, requireAdminRole, (_req, res) => {
    try {
      res.json({ ok: true, data: userStore.getCardStats() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 生成卡密（count>1 时批量） */
  app.post('/api/admin/cards', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const {
        description, days, type, durationValue, durationUnit, isPermanent, value, count,
      } = req.body || {};
      const countNum = Math.max(Number.parseInt(count, 10) || 1, 1);
      if (!requireDangerConfirmation(req, res, countNum > 1 ? 'CREATE_CARDS_BATCH' : 'CREATE_CARD')) return;
      if (!description || (days === undefined && durationValue === undefined && value === undefined && !isPermanent)) {
        return res.status(400).json({ ok: false, error: '请提供卡密描述和面值' });
      }

      const result = userStore.createCard({
        description,
        type: type === CARD_TYPES.QUOTA ? CARD_TYPES.QUOTA : CARD_TYPES.TIME,
        days,
        durationValue,
        durationUnit,
        isPermanent,
        value,
        count: countNum,
        createdBy: req.currentUser?.username || '',
      });
      if (!result.ok) return res.status(400).json(result);

      adminLogger.info('生成卡密', {
        admin: req.currentUser?.username || '',
        description: String(description || '').trim(),
        type: result.cards[0]?.type,
        count: result.count,
        batchId: result.batchId,
      });
      res.json({ ok: true, data: result.cards, batchId: result.batchId, count: result.count });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 更新卡密（描述 / 启停 / 作废） */
  app.post('/api/admin/cards/:code', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'UPDATE_CARD_STATUS')) return;
      const { code } = req.params;
      const { description, enabled, revoked } = req.body || {};
      const updates = {};
      if (description !== undefined) updates.description = description;
      if (revoked !== undefined) updates.revoked = revoked === true;
      if (enabled !== undefined) updates.enabled = enabled !== false;

      const result = revoked === true
        ? userStore.revokeCard(code, req.currentUser?.username || '')
        : userStore.updateCard(code, updates);
      if (!result.ok) return res.status(404).json(result);

      adminLogger.warn('更新卡密', {
        admin: req.currentUser?.username || '',
        code,
        enabled: result.card?.enabled ?? null,
        revoked: result.card?.revoked ?? null,
        confirmation: 'UPDATE_CARD_STATUS',
      });
      res.json({ ok: true, data: result.card });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 删除单张卡密 */
  app.delete('/api/admin/cards/:code', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'DELETE_CARD')) return;
      const { code } = req.params;
      const result = userStore.deleteCard(code);
      if (!result.ok) return res.status(404).json(result);
      adminLogger.warn('删除卡密', {
        admin: req.currentUser?.username || '',
        code,
        confirmation: 'DELETE_CARD',
      });
      res.json({ ok: true, data: result.card });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 批量删除卡密 */
  app.post('/api/admin/cards/batch-delete', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'DELETE_CARDS_BATCH')) return;
      const { codes } = req.body || {};
      if (!Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ ok: false, error: '请提供要删除的卡密列表' });
      }
      const result = userStore.deleteCardsBatch(codes);
      adminLogger.warn('批量删除卡密', {
        admin: req.currentUser?.username || '',
        deleteCount: codes.length,
        deletedCount: result.deletedCount,
        confirmation: 'DELETE_CARDS_BATCH',
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 核销流水 */
  app.get('/api/admin/card-redemptions', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const { username, code, limit, offset } = req.query || {};
      const result = userStore.getRedemptions({
        username,
        code,
        limit: Number.parseInt(limit) || 100,
        offset: Number.parseInt(offset) || 0,
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 卡密领取开关 */
  app.get('/api/admin/card-claim/status', requireAdminToken, requireAdminRole, (_req, res) => {
    try {
      res.json({ ok: true, data: userStore.getCardClaimStatus() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/admin/card-claim/status', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'UPDATE_CARD_CLAIM_STATUS')) return;
      const { enabled } = req.body || {};
      const status = userStore.setCardClaimStatus(enabled === true);
      if (enabled === true && status.availableTimeCards <= 0) {
        return res.status(400).json({
          ok: false,
          error: '可领取的加时卡库存不足，无法开启',
          availableTimeCards: status.availableTimeCards,
        });
      }
      adminLogger.warn('更新卡密领取开关', {
        admin: req.currentUser?.username || '',
        enabled: status.enabled,
      });
      res.json({ ok: true, data: status });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** 卡密领取记录 */
  app.get('/api/admin/card-claim/records', requireAdminToken, requireAdminRole, (_req, res) => {
    try {
      res.json({ ok: true, data: userStore.getCardClaimRecords() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { registerAdminCardRoutes };

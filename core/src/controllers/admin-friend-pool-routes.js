/**
 * 管理后台 - 好友号池管理
 *
 * 用途：
 * 1. 查看号池里所有分享链接（全账号共用的链接库），以及每个链接被多少账号申请过/已加上/判定不可加；
 * 2. 批量导入分享链接（粘贴文本或已解析的 items 数组），批量导出为 share.txt 兼容的行；
 * 3. 删除单条或批量删除链接（同时清掉所有账号对它的申请状态）。
 *
 * 与设置页「好友申请」的区别：
 * - 那边的接口都带 x-account-id，按账号维度申请与查看状态；
 * - 这里是管理员视角，只动号池数据本身，不触发任何游戏内请求。
 */
const friendPool = require('../services/friend-pool');
const { parseShareLink } = require('../services/invite');

/** 单次导入上限：再多请分批，避免一次请求占满事件循环 */
const MAX_IMPORT_ITEMS = 500;

/**
 * 把一行文本解析成号池条目：
 * 支持整条分享链接（含 ? 前缀）、裸 query 串、以及 uid=..&openid=.. 这种片段。
 * 除 share_key 外都接受 share-key / shareSource 等别名。
 */
function parseLinkLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  const queryIndex = raw.indexOf('?');
  const query = queryIndex >= 0 ? raw.slice(queryIndex) : raw;
  const parsed = parseShareLink(query);
  if (!parsed || !parsed.uid || !parsed.openid) return null;
  return {
    uid: String(parsed.uid).trim(),
    openid: String(parsed.openid).trim(),
    shareSource: parsed.shareSource == null ? '' : String(parsed.shareSource),
    docId: parsed.docId == null ? '' : String(parsed.docId),
    shareKey: parsed.shareKey == null ? '' : String(parsed.shareKey).trim(),
  };
}

/** 把前端已解析的 items 规整成号池条目，缺 uid/openid 的丢弃 */
function normalizeIncomingItems(items) {
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const uid = String(item.uid || '').trim();
    const openid = String(item.openid || item.openId || '').trim();
    if (!uid || !openid) continue;
    result.push({
      uid,
      openid,
      shareSource: item.shareSource != null ? String(item.shareSource) : '',
      docId: item.docId != null ? String(item.docId) : '',
      shareKey: String(item.shareKey || item.share_key || '').trim(),
      cardTime: item.cardTime != null
        ? String(item.cardTime)
        : (item.at != null ? String(item.at) : ''),
    });
  }
  return result;
}

/** 导出用：一行一条 share.txt 兼容的链接 */
function formatExportLine(entry) {
  const parts = [`uid=${entry.uid}`, `openid=${entry.openid}`];
  if (entry.shareSource) parts.push(`share_source=${entry.shareSource}`);
  if (entry.docId) parts.push(`doc_id=${entry.docId}`);
  if (entry.shareKey) parts.push(`share_key=${entry.shareKey}`);
  return parts.join('&');
}

/**
 * 解析导入内容：既支持逐行粘贴的链接文本，也支持「本次采集卡片」那种 JSON：
 * - JSON 对象 { total, note, data: [ { uid, openid, share_source, share_key, name, level, at } ] }
 * - 或直接传数组 [{ uid, openid, shareKey, ... }]
 */
function parseImportText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (raw.startsWith('{') || raw.startsWith('[')) {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.data) ? parsed.data : []);
    return normalizeIncomingItems(arr);
  }
  return raw
    .split('\n')
    .map((line) => parseLinkLine(line))
    .filter(Boolean);
}

function registerAdminFriendPoolRoutes({
  app,
  provider,
  requireAdminRole,
  sendProviderError,
}) {
  const adminOnly = typeof requireAdminRole === 'function'
    ? requireAdminRole
    : (req, res, next) => next();

  function replyError(res, error, fallback = '操作失败') {
    if (typeof sendProviderError === 'function' && error && error.code === 'PROVIDER_UNAVAILABLE') {
      sendProviderError(res, error);
      return;
    }
    res.status(500).json({ ok: false, error: (error && error.message) || fallback });
  }

  /** 号池总览：全账号共用链接 + 每个链接的跨账号状态汇总 */
  app.get('/api/admin/friend-pool', adminOnly, (req, res) => {
    try {
      const { summary, entries } = friendPool.getPoolOverview();
      res.json({ ok: true, summary, entries });
    } catch (error) {
      replyError(res, error, '读取好友号池失败');
    }
  });

  /** 导出全部链接为文本（share.txt 兼容），供管理员保存/迁移 */
  app.get('/api/admin/friend-pool/export', adminOnly, (req, res) => {
    try {
      const { entries } = friendPool.getPoolOverview();
      const lines = entries
        .filter((entry) => entry.shareKey)
        .map(formatExportLine);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="friend-pool.txt"');
      res.send(`${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`);
    } catch (error) {
      replyError(res, error, '导出好友号池失败');
    }
  });

  /**
   * 批量读取等级：用指定账号对号池里的分享链接做 Enter → Leave，拿对方的昵称/农场等级并写回号池。
   * 不发送好友申请，只读；body: { accountId, uids?: string[], limit?: number, delayMs?: number }
   */
  app.post('/api/admin/friend-pool/fetch-levels', adminOnly, async (req, res) => {
    try {
      if (!provider || typeof provider.fetchSharerLevels !== 'function') {
        res.status(503).json({ ok: false, error: 'provider 不可用，无法读取等级' });
        return;
      }
      const body = req.body || {};
      const accountId = String(body.accountId || '').trim();
      if (!accountId) {
        res.status(400).json({ ok: false, error: 'Missing accountId：读取等级需要指定一个微信账号' });
        return;
      }
      const uids = Array.isArray(body.uids) ? body.uids.map(uid => String(uid)) : [];
      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);
      const { entries } = friendPool.getPoolOverview();
      const wanted = uids.length > 0 ? new Set(uids) : null;
      const items = entries
        .filter(entry => entry.shareKey && (!wanted || wanted.has(String(entry.uid))))
        .slice(0, limit)
        .map(entry => ({ uid: entry.uid, openid: entry.openid, shareKey: entry.shareKey }));
      if (items.length === 0) {
        res.status(400).json({ ok: false, error: '没有可读取等级的条目：需要 share_key（可从卡片 JSON 或完整链接导入）' });
        return;
      }
      const data = await provider.fetchSharerLevels(accountId, items, {
        delayMs: Number(body.delayMs) || 300,
      });
      res.json({ ok: true, data });
    } catch (error) {
      replyError(res, error, '读取等级失败');
    }
  });

  /** 批量导入：收 text（逐行粘贴）或 items（前端已解析），重复 uid 只保留最后一条 */
  app.post('/api/admin/friend-pool/import', adminOnly, (req, res) => {
    try {
      const body = req.body || {};
      const fromItems = normalizeIncomingItems(body.items);
      let fromText = [];
      try {
        fromText = parseImportText(body.text);
      } catch (error) {
        res.status(400).json({ ok: false, error: `导入内容解析失败：${error.message}` });
        return;
      }

      const merged = new Map();
      for (const item of [...fromItems, ...fromText])
        merged.set(item.uid, item);

      const items = [...merged.values()];
      if (items.length === 0) {
        res.status(400).json({ ok: false, error: '没有可导入的分享链接：每行需要包含 uid 和 openid' });
        return;
      }
      if (items.length > MAX_IMPORT_ITEMS) {
        res.status(400).json({ ok: false, error: `单次最多导入 ${MAX_IMPORT_ITEMS} 条，请分批处理` });
        return;
      }

      const { added, updated } = friendPool.upsertInviteItems(items);
      const { summary } = friendPool.getPoolOverview();
      res.json({ ok: true, data: { total: items.length, added, updated, summary } });
    } catch (error) {
      replyError(res, error, '导入好友号池失败');
    }
  });

  /** 删除单条 */
  app.post('/api/admin/friend-pool/remove', adminOnly, (req, res) => {
    try {
      const uid = String((req.body && req.body.uid) || '').trim();
      if (!uid) {
        res.status(400).json({ ok: false, error: 'Missing uid' });
        return;
      }
      const removed = friendPool.removeEntry(uid);
      if (!removed) {
        res.status(404).json({ ok: false, error: '号池里没有这条链接' });
        return;
      }
      res.json({ ok: true, data: { removed: 1 } });
    } catch (error) {
      replyError(res, error, '删除好友号池条目失败');
    }
  });

  /** 批量删除 */
  app.post('/api/admin/friend-pool/remove-batch', adminOnly, (req, res) => {
    try {
      const uids = Array.isArray(req.body && req.body.uids) ? req.body.uids : [];
      if (uids.length === 0) {
        res.status(400).json({ ok: false, error: '没有要删除的 uid' });
        return;
      }
      if (uids.length > MAX_IMPORT_ITEMS) {
        res.status(400).json({ ok: false, error: `单次最多删除 ${MAX_IMPORT_ITEMS} 条，请分批处理` });
        return;
      }
      let removed = 0;
      for (const uid of uids) {
        if (friendPool.removeEntry(String(uid).trim())) removed++;
      }
      res.json({ ok: true, data: { removed } });
    } catch (error) {
      replyError(res, error, '批量删除好友号池条目失败');
    }
  });
}

module.exports = { registerAdminFriendPoolRoutes };
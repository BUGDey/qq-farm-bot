/**
 * 管理后台 - 采集器（自动导入）
 *
 * 采集器用「账号 + 密码」登录本面板（/api/login），拿到 admin token 后：
 *   - POST /api/auto-import/heartbeat  上报心跳（按 name 自动注册，面板显示连接状态）
 *   - POST /api/auto-import/push       推送采集到的分享卡片，直接写入好友号池
 *
 * 面板侧还支持：
 *   - 粘贴分享链接手动添加记录（不自动导入，可逐条点「导入」）
 *   - 对未导入的记录点「导入」手动写入号池
 *
 * 存储：data/auto-import.json（json-db 原子写）
 * {
 *   version: 3,
 *   entries: { [name]: {...} },
 *   records: [ { id, ts, source, uid, openid, shareSource, docId, shareKey,
 *                raw, added, updated, imported, error } ]  // 最近 RECORD_LIMIT 条
 * }
 *
 * 连接状态：never 未连接 / online 已连接(90秒内有心跳) / offline 已断开
 */
const crypto = require('node:crypto');
const { getDataFile } = require('../config/runtime-paths');
const { readTextFile, writeTextFileAtomic } = require('../services/json-db');
const friendPool = require('../services/friend-pool');

const STATE_FILE = 'auto-import.json';
const ONLINE_THRESHOLD_MS = 90 * 1000;
const MAX_ITEMS = 500;
const RECORD_LIMIT = 300;
const VERSION = 3;

function getStatePath() {
  return getDataFile(STATE_FILE);
}

function emptyState() {
  return { version: VERSION, entries: {}, records: [] };
}

function loadState() {
  const raw = readTextFile(getStatePath(), '');
  if (!raw) return emptyState();
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyState();
    if (!data.entries || typeof data.entries !== 'object') data.entries = {};
    if (!Array.isArray(data.records)) data.records = [];
    // 老记录补全 raw / 新字段，前端复制按钮才拿得到完整数据
    for (const r of data.records) {
      if (!r.raw) r.raw = buildRaw(r);
      if (r.shareSource === undefined) r.shareSource = '';
      if (r.docId === undefined) r.docId = '';
    }
    data.version = VERSION;
    return data;
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  writeTextFileAtomic(getStatePath(), JSON.stringify(state, null, 2));
}

function cleanName(value) {
  return String(value || '').trim().slice(0, 80) || '未命名采集器';
}

/** 生成完整可复制的一行（与「导入分享链接」框格式一致） */
function buildRaw(item) {
  const parts = [
    `uid=${item.uid || ''}`,
    `openid=${item.openid || ''}`,
  ];
  if (item.shareSource !== undefined && item.shareSource !== null && String(item.shareSource) !== '')
    parts.push(`share_source=${item.shareSource}`);
  if (item.docId !== undefined && item.docId !== null && String(item.docId) !== '')
    parts.push(`doc_id=${item.docId}`);
  if (item.shareKey)
    parts.push(`share_key=${item.shareKey}`);
  return parts.join('&');
}

function connectionStatus(entry, now = Date.now()) {
  const at = Number(entry && entry.lastHeartbeatAt);
  if (!at || !Number.isFinite(at)) return 'never';
  return now - at <= ONLINE_THRESHOLD_MS ? 'online' : 'offline';
}

function publicEntry(name, entry, now) {
  return {
    name,
    url: entry.url || '',
    enabled: entry.enabled !== false,
    createdAt: entry.createdAt || 0,
    lastHeartbeatAt: entry.lastHeartbeatAt || 0,
    lastImportAt: entry.lastImportAt || 0,
    importTotal: entry.importTotal || 0,
    status: connectionStatus(entry, now),
  };
}

/** 规整采集器推来的条目：兼容 uid/gid、share_key/shareKey 等别名 */
function normalizeItems(items) {
  const result = [];
  for (const raw of (Array.isArray(items) ? items : [])) {
    if (!raw || typeof raw !== 'object') continue;
    const uid = String(raw.uid || raw.gid || '').trim();
    const openid = String(raw.openid || raw.openId || '').trim();
    if (!uid || !openid) continue;
    result.push({
      uid,
      openid,
      shareKey: String(raw.shareKey || raw.share_key || '').trim(),
      shareSource: raw.shareSource != null ? String(raw.shareSource) : (raw.shareCfgId != null ? String(raw.shareCfgId) : ''),
      docId: raw.docId != null ? String(raw.docId) : '',
    });
  }
  return result;
}

function makeRecord(item, source) {
  return {
    id: crypto.randomBytes(6).toString('hex'),
    ts: Date.now(),
    source: source || '手动添加',
    uid: item.uid,
    openid: item.openid,
    shareSource: item.shareSource || '',
    docId: item.docId || '',
    shareKey: item.shareKey || '',
    raw: buildRaw(item),
    added: 0,
    updated: 0,
    imported: false,
    error: '',
  };
}

function registerAdminAutoImportRoutes({ app, requireAdminRole }) {
  const adminOnly = typeof requireAdminRole === 'function'
    ? requireAdminRole
    : (req, res, next) => next();

  function replyError(res, error, fallback) {
    res.status(500).json({ ok: false, error: (error && error.message) || fallback });
  }

  function ensureEntry(state, name, url) {
    let entry = state.entries[name];
    if (!entry) {
      entry = {
        name,
        url: url || '',
        enabled: true,
        createdAt: Date.now(),
        lastHeartbeatAt: 0,
        lastImportAt: 0,
        importTotal: 0,
      };
      state.entries[name] = entry;
    } else if (url && !entry.url) {
      entry.url = url;
    }
    return entry;
  }

  // ================= 面板管理接口（adminOnly） =================

  app.get('/api/admin/auto-import/entries', adminOnly, (req, res) => {
    try {
      const state = loadState();
      const now = Date.now();
      const list = Object.keys(state.entries).map(name => publicEntry(name, state.entries[name], now));
      list.sort((a, b) => b.lastHeartbeatAt - a.lastHeartbeatAt);
      res.json({ ok: true, data: { entries: list, onlineThresholdMs: ONLINE_THRESHOLD_MS } });
    } catch (error) {
      replyError(res, error, '读取采集器列表失败');
    }
  });

  app.post('/api/admin/auto-import/entries/:name/toggle', adminOnly, (req, res) => {
    try {
      const name = cleanName(req.params.name);
      const state = loadState();
      const entry = state.entries[name];
      if (!entry) {
        res.status(404).json({ ok: false, error: '采集器不存在' });
        return;
      }
      entry.enabled = req.body && req.body.enabled !== undefined ? !!req.body.enabled : !entry.enabled;
      saveState(state);
      res.json({ ok: true, data: publicEntry(name, entry, Date.now()) });
    } catch (error) {
      replyError(res, error, '操作失败');
    }
  });

  app.post('/api/admin/auto-import/entries/:name/delete', adminOnly, (req, res) => {
    try {
      const name = cleanName(req.params.name);
      const state = loadState();
      if (!state.entries[name]) {
        res.status(404).json({ ok: false, error: '采集器不存在' });
        return;
      }
      delete state.entries[name];
      saveState(state);
      res.json({ ok: true, data: { removed: 1 } });
    } catch (error) {
      replyError(res, error, '删除失败');
    }
  });

  /** 导入记录（每条采集器推送的卡片 + 导入结果） */
  app.get('/api/admin/auto-import/records', adminOnly, (req, res) => {
    try {
      const state = loadState();
      const limit = Math.max(1, Math.min(RECORD_LIMIT, Number(req.query.limit) || 100));
      const records = state.records.slice(-limit).reverse();
      res.json({ ok: true, data: { records, total: state.records.length } });
    } catch (error) {
      replyError(res, error, '读取导入记录失败');
    }
  });

  /** 手动导入单条记录到号池 */
  app.post('/api/admin/auto-import/records/:id/import', adminOnly, (req, res) => {
    try {
      const id = String(req.params.id || '');
      const state = loadState();
      const rec = state.records.find(r => r.id === id);
      if (!rec) {
        res.status(404).json({ ok: false, error: '记录不存在' });
        return;
      }
      if (rec.imported) {
        res.json({ ok: true, data: { already: true, added: rec.added, updated: rec.updated } });
        return;
      }
      const item = {
        uid: rec.uid,
        openid: rec.openid,
        shareKey: rec.shareKey || '',
        shareSource: rec.shareSource || '',
        docId: rec.docId || '',
      };
      try {
        const result = friendPool.upsertInviteItems([item]);
        rec.added = result.added || 0;
        rec.updated = result.updated || 0;
        rec.imported = true;
        rec.error = '';
        rec.ts = Date.now();
      } catch (e) {
        rec.imported = false;
        rec.error = (e && e.message) || '导入失败';
      }
      saveState(state);
      if (!rec.imported) {
        res.status(500).json({ ok: false, error: rec.error });
        return;
      }
      res.json({ ok: true, data: { added: rec.added, updated: rec.updated } });
    } catch (error) {
      replyError(res, error, '手动导入失败');
    }
  });

  /** 清空导入记录 */
  app.post('/api/admin/auto-import/records/clear', adminOnly, (req, res) => {
    try {
      const state = loadState();
      const removed = state.records.length;
      state.records = [];
      saveState(state);
      res.json({ ok: true, data: { removed } });
    } catch (error) {
      replyError(res, error, '清空导入记录失败');
    }
  });

  // ================= 采集器上报接口（走全局 admin token 门禁） =================

  app.post('/api/auto-import/heartbeat', (req, res) => {
    try {
      const name = cleanName(req.body && req.body.name);
      const url = String((req.body && req.body.url) || '').trim();
      const state = loadState();
      const entry = ensureEntry(state, name, url);
      if (entry.enabled === false) {
        res.status(403).json({ ok: false, error: '该采集器已被停用' });
        return;
      }
      entry.lastHeartbeatAt = Date.now();
      saveState(state);
      res.json({ ok: true, data: { name, serverTime: Date.now() } });
    } catch (error) {
      replyError(res, error, '心跳失败');
    }
  });

  app.post('/api/auto-import/push', (req, res) => {
    try {
      const name = cleanName(req.body && req.body.name);
      const url = String((req.body && req.body.url) || '').trim();
      const state = loadState();
      const entry = ensureEntry(state, name, url);
      if (entry.enabled === false) {
        res.status(403).json({ ok: false, error: '该采集器已被停用' });
        return;
      }
      const items = normalizeItems(req.body && req.body.items);
      if (items.length === 0) {
        res.status(400).json({ ok: false, error: '没有可导入的条目（需要 uid + openid）' });
        return;
      }
      if (items.length > MAX_ITEMS) {
        res.status(400).json({ ok: false, error: `单次最多 ${MAX_ITEMS} 条` });
        return;
      }

      let added = 0;
      let updated = 0;
      let error = '';
      let imported = false;
      try {
        const result = friendPool.upsertInviteItems(items);
        added = result.added || 0;
        updated = result.updated || 0;
        imported = true;
      } catch (e) {
        error = (e && e.message) || '写号池失败';
      }

      const now = Date.now();
      entry.lastHeartbeatAt = now;
      if (imported) {
        entry.lastImportAt = now;
        entry.importTotal = (entry.importTotal || 0) + items.length;
      }

      for (const item of items) {
        const rec = makeRecord(item, name);
        rec.ts = now;
        rec.added = added;
        rec.updated = updated;
        rec.imported = imported;
        rec.error = error;
        state.records.push(rec);
      }
      if (state.records.length > RECORD_LIMIT)
        state.records = state.records.slice(-RECORD_LIMIT);

      saveState(state);
      res.json({ ok: true, data: { total: items.length, added, updated, imported } });
    } catch (error) {
      replyError(res, error, '自动导入失败');
    }
  });
}

module.exports = { registerAdminAutoImportRoutes };

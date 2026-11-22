const { isElevatedRole } = require("../models/user-store");

const DOG_INFO_HTTP_TIMEOUT_MS = 11 * 60 * 1000;

/** 好友申请 / 好友号池是 VIP 功能：管理员以上放行，其余账号需要在卡密中心开通 VIP */
function requireFriendVip(req, res, next) {
  const user = req.currentUser || {};
  if (user.vip === true || isElevatedRole(user.role)) return next();
  return res.status(403).json({
    ok: false,
    error: "好友申请需要 VIP 权限，请在卡密中心开通",
    errorType: "vip_required",
  });
}

function getAccountOrRespond(req, res, { getAccountIdFromRequest, canAccessAccount, includeMissingMessage = true }) {
  const accountId = getAccountIdFromRequest(req);
  if (!accountId) {
    const payload = { ok: false };
    if (includeMissingMessage) payload.error = "Missing x-account-id";
    res.status(400).json(payload);
    return null;
  }
  if (!canAccessAccount(req, accountId)) {
    res.status(403).json({ ok: false, error: "无权访问此账号" });
    return null;
  }
  return accountId;
}

async function getFriendMetaByGid(provider, accountId) {
  let friends = [];
  try {
    if (provider && typeof provider.getFriends === "function") {
      friends = (await provider.getFriends(accountId)) || [];
    }
  } catch {}

  const metaByGid = new Map();
  for (const friend of friends) {
    const gid = Number(friend && friend.gid);
    if (gid > 0) {
      metaByGid.set(gid, {
        name: friend.name || friend.remark || "",
        avatarUrl: friend.avatarUrl || friend.avatar_url || "",
      });
    }
  }
  return metaByGid;
}

function formatFriendBlacklist(gids, metaByGid) {
  return gids.map((gid) => {
    const meta = metaByGid.get(Number(gid)) || {};
    return {
      gid: Number(gid),
      name: meta.name || "",
      avatarUrl: meta.avatarUrl || "",
    };
  });
}

function getKnownFriendGidsData(store, accountId) {
  return {
    knownFriendGids: store.getKnownFriendGids
      ? store.getKnownFriendGids(accountId)
      : [],
  };
}

function broadcastConfig(provider, accountId) {
  if (provider && typeof provider.broadcastConfig === "function") {
    provider.broadcastConfig(accountId);
  }
}

function registerAdminFriendRoutes({
  app,
  provider,
  store,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  const access = { getAccountIdFromRequest, canAccessAccount };

  app.get("/api/friends", async (req, res) => {
    const accountId = getAccountOrRespond(req, res, {
      ...access,
      includeMissingMessage: false,
    });
    if (!accountId) return;

    try {
      const forceSync = req.query.forceSync === "true";
      const data = await provider.getFriends(accountId, forceSync);
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/friends/clear-cache", async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      await provider.clearFriendsCache(accountId);
      res.json({ ok: true });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/friends/fetch-dog-info", async (req, res) => {
    req.setTimeout(DOG_INFO_HTTP_TIMEOUT_MS);
    res.setTimeout(DOG_INFO_HTTP_TIMEOUT_MS);

    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const result = await provider.fetchFriendsDogInfo(accountId);
      res.json(result);
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.get("/api/interact-records", async (req, res) => {
    const accountId = getAccountIdFromRequest(req);
    if (!accountId) {
      return res.status(400).json({ ok: false, error: "Missing x-account-id" });
    }

    try {
      const data = await provider.getInteractRecords(accountId);
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  /** 外挂检测：基于访客互动样本的行为分析（72 小时窗口，挂机过程中持续积累） */
  app.get("/api/friend-cheat-analysis", async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const cheatDetect = require("../services/cheat-detect");
      res.json({ ok: true, data: cheatDetect.analyzeFriendCheat(accountId) });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.get("/api/friend/:gid/lands", async (req, res) => {
    const accountId = getAccountOrRespond(req, res, {
      ...access,
      includeMissingMessage: false,
    });
    if (!accountId) return;

    try {
      const data = await provider.getFriendLands(accountId, req.params.gid);
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/friend/:gid/op", async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const opType = String((req.body || {}).opType || "");
      const data = await provider.doFriendOp(accountId, req.params.gid, opType);
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.get("/api/friend/:gid/dog", async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const data = await provider.getFriendDogInfo(accountId, req.params.gid);
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/friend/:gid/delete", async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const gid = Number(req.params.gid);
      if (!gid) {
        return res.status(400).json({ ok: false, error: "无效的好友 GID" });
      }

      await provider.delFriend(accountId, gid);
      res.json({ ok: true, message: "删除好友成功" });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  // 手动批量加好友：接收「分享链接解析出来的 uid + openid」，逐条发送好友申请。
  // 单次最多 20 条（前端分批提交并展示进度），不读写 share.txt，不影响自动邀请流程。
  app.post("/api/friends/apply-invites", requireFriendVip, async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    const body = req.body || {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return res.status(400).json({ ok: false, error: "没有可提交的邀请数据" });
    }
    if (rawItems.length > 20) {
      return res.status(400).json({ ok: false, error: "单次最多提交 20 条，请分批处理" });
    }

    const items = rawItems
      .map((item) => ({
        uid: String((item && item.uid) == null ? "" : item.uid).trim(),
        openid: String((item && (item.openid || item.openId)) || "").trim(),
        shareSource: item && item.shareSource != null
          ? item.shareSource
          : (item && item.share_source != null ? item.share_source : ""),
        // 等级筛选用：进对方农场需要卡片里的 share_key
        shareKey: String((item && (item.shareKey || item.share_key)) || "").trim(),
      }))
      .filter((item) => item.uid && item.openid);

    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: "解析结果为空：每条记录都需要 uid 和 openid" });
    }

    const delayMs = Number(body.delayMs);
    const minLevel = Number(body.minLevel);
    const maxLevel = Number(body.maxLevel);
    const dogBreeds = Array.isArray(body.dogBreeds)
      ? body.dogBreeds.map((breed) => String(breed || "").trim()).filter(Boolean)
      : [];
    try {
      const data = await provider.applyFriendInvites(accountId, items, {
        delayMs: Number.isFinite(delayMs) ? delayMs : undefined,
        minLevel: Number.isFinite(minLevel) ? minLevel : 0,
        maxLevel: Number.isFinite(maxLevel) ? maxLevel : 0,
        dogBreeds,
        allowUnknownLevel: body.allowUnknownLevel === true,
        // 默认开启：先在本地好友列表里比对，已是好友的不再发申请
        skipExistingFriends: body.skipExistingFriends !== false,
      });
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.get("/api/friend-blacklist", async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    const blacklist = store.getFriendBlacklist
      ? store.getFriendBlacklist(accountId)
      : [];
    const metaByGid = await getFriendMetaByGid(provider, accountId);
    res.json({
      ok: true,
      data: formatFriendBlacklist(blacklist, metaByGid),
    });
  });

  app.post("/api/friend-blacklist/toggle", async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    const gid = Number((req.body || {}).gid);
    if (!gid) {
      return res.status(400).json({ ok: false, error: "Missing gid" });
    }

    const blacklist = store.getFriendBlacklist
      ? store.getFriendBlacklist(accountId)
      : [];
    const nextBlacklist = blacklist.includes(gid)
      ? blacklist.filter((item) => item !== gid)
      : [...blacklist, gid];
    const saved = store.setFriendBlacklist
      ? store.setFriendBlacklist(accountId, nextBlacklist)
      : nextBlacklist;
    if (provider && typeof provider.broadcastConfig === "function") {
      provider.broadcastConfig(accountId);
    }

    const metaByGid = await getFriendMetaByGid(provider, accountId);
    res.json({
      ok: true,
      data: formatFriendBlacklist(saved, metaByGid),
    });
  });

  app.get("/api/friend-known-gids", (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      res.json({ ok: true, data: getKnownFriendGidsData(store, accountId) });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/friend-known-gids", (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if (body.knownFriendGids !== undefined && store.setKnownFriendGids) {
        store.setKnownFriendGids(accountId, body.knownFriendGids);
      }
      broadcastConfig(provider, accountId);
      res.json({ ok: true, data: getKnownFriendGidsData(store, accountId) });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/friend-known-gids/remove", (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    const gid = Number((req.body || {}).gid);
    if (!Number.isFinite(gid) || gid <= 0) {
      return res.status(400).json({ ok: false, error: "GID 无效" });
    }

    try {
      const knownGids = store.getKnownFriendGids
        ? store.getKnownFriendGids(accountId)
        : [];
      const nextKnownGids = Array.isArray(knownGids)
        ? knownGids.filter((item) => Number(item) !== gid)
        : [];
      if (store.setKnownFriendGids) {
        store.setKnownFriendGids(accountId, nextKnownGids);
      }
      broadcastConfig(provider, accountId);
      res.json({ ok: true, data: getKnownFriendGidsData(store, accountId) });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/friend-known-gids/batch-add", async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    const gids = (req.body || {}).gids;
    if (!Array.isArray(gids) || gids.length === 0) {
      return res.status(400).json({ ok: false, error: "GID 列表无效" });
    }

    try {
      const knownGids = store.getKnownFriendGids
        ? store.getKnownFriendGids(accountId)
        : [];
      const nextKnownGids = new Set(knownGids.map(Number));
      let addedCount = 0;
      for (const rawGid of gids) {
        const gid = Number(rawGid);
        if (!Number.isFinite(gid) || gid <= 0) continue;
        if (!nextKnownGids.has(gid)) {
          nextKnownGids.add(gid);
          addedCount++;
        }
      }

      if (store.setKnownFriendGids) {
        store.setKnownFriendGids(accountId, Array.from(nextKnownGids));
      }
      broadcastConfig(provider, accountId);
      res.json({
        ok: true,
        data: getKnownFriendGidsData(store, accountId),
        addedCount,
        message:
          addedCount > 0
            ? '已添加好友GID，请点击"刷新列表"获取好友信息，然后点击"获取狗信息"获取狗信息。处理中请勿频繁访问好友界面。'
            : "",
      });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/friend-known-gids/batch-remove", (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    const gids = (req.body || {}).gids;
    if (!Array.isArray(gids) || gids.length === 0) {
      return res.json({
        ok: true,
        data: getKnownFriendGidsData(store, accountId),
        removedCount: 0,
      });
    }

    try {
      const knownGids = store.getKnownFriendGids
        ? store.getKnownFriendGids(accountId)
        : [];
      const gidSet = new Set(
        gids.map(Number).filter((gid) => Number.isFinite(gid) && gid > 0),
      );
      const nextKnownGids = knownGids.filter(
        (gid) => !gidSet.has(Number(gid)),
      );
      const removedCount = knownGids.length - nextKnownGids.length;
      if (removedCount > 0 && store.setKnownFriendGids) {
        store.setKnownFriendGids(accountId, nextKnownGids);
      }
      res.json({
        ok: true,
        data: getKnownFriendGidsData(store, accountId),
        removedCount,
      });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  // ========== 好友号池 ==========
  // 号池记录所有导入过的加好友链接与申请状态，超过 24h 未通过标记为不可加
  app.get("/api/friends/pool", requireFriendVip, (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const friendPool = require("../services/friend-pool");
      const status = String((req.query && req.query.status) || "").toLowerCase();
      const { summary, entries } = friendPool.getPoolSnapshot(accountId);
      const list = status && status !== "all"
        ? entries.filter((item) => item.status === status)
        : entries;
      // 该账号当天是否已撞过好友申请上限：前端据此直接拦住「开始添加」
      const dailyLimit = friendPool.getDailyLimitState(accountId);
      res.json({ ok: true, data: { summary, entries: list, dailyLimit } });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  // 恢复某条为可申请（人工解除误判）
  app.post("/api/friends/pool/reset", requireFriendVip, (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    const uid = String((req.body || {}).uid || "").trim();
    if (!uid) {
      return res.status(400).json({ ok: false, error: "Missing uid" });
    }
    try {
      const friendPool = require("../services/friend-pool");
      const found = friendPool.resetEntry(accountId, uid);
      const { summary, entries } = friendPool.getPoolSnapshot(accountId);
      res.json({ ok: true, data: { found, summary, entries } });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  // 从号池删除一条（共享链接库，所有账号都不再使用这条）
  app.post("/api/friends/pool/remove", requireFriendVip, (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    const uid = String((req.body || {}).uid || "").trim();
    if (!uid) {
      return res.status(400).json({ ok: false, error: "Missing uid" });
    }
    try {
      const friendPool = require("../services/friend-pool");
      const found = friendPool.removeEntry(uid);
      const { summary, entries } = friendPool.getPoolSnapshot(accountId);
      res.json({ ok: true, data: { found, summary, entries } });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  // 读取号池条目的分享人昵称与农场等级（好友申请页用，账号维度）
  app.post("/api/friends/pool/fetch-levels", requireFriendVip, async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const friendPool = require("../services/friend-pool");
      const body = req.body || {};
      const uids = Array.isArray(body.uids)
        ? body.uids.map((uid) => String(uid || "").trim()).filter(Boolean)
        : [];
      const rawLimit = Number(body.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), 100)
        : 50;

      let items = friendPool
        .getPoolSnapshot(accountId)
        .entries.filter((entry) => Boolean(entry.shareKey));
      if (uids.length > 0) {
        const wanted = new Set(uids);
        items = items.filter((entry) => wanted.has(String(entry.uid)));
      }
      items = items.slice(0, limit);
      if (items.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "没有可读取等级的条目：需要 share_key（可从卡片 JSON 或完整链接导入）",
        });
      }
      if (!provider || typeof provider.fetchSharerLevels !== "function") {
        return res.status(503).json({ ok: false, error: "provider 不可用，无法读取等级" });
      }

      let data;
      try {
        data = await provider.fetchSharerLevels(
          accountId,
          items.map((entry) => ({
            uid: entry.uid,
            openid: entry.openid,
            shareKey: entry.shareKey,
            shareSource: entry.shareSource,
          })),
          { delayMs: Number(body.delayMs) || 300 },
        );
      } catch (error) {
        const message = (error && error.message) || String(error);
        // worker 没跑起来时 worker-manager 只抛「账号未运行」，补一句能照做的提示
        if (message.includes("账号未运行")) {
          return res.status(400).json({
            ok: false,
            error: "账号未运行：请先在「账号管理」里启动这个微信账号，再读取等级",
          });
        }
        throw error;
      }
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  // 筛选配置：等级区间 + 犬种（按账号保存，前端「好友申请」页的筛选卡片用）
  app.get("/api/friends/pool/filter", requireFriendVip, (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const friendPool = require("../services/friend-pool");
      res.json({
        ok: true,
        data: { filter: friendPool.getFilter(accountId), dogBreeds: friendPool.DOG_BREEDS },
      });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/friends/pool/filter", requireFriendVip, (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const friendPool = require("../services/friend-pool");
      const body = req.body || {};
      const filter = friendPool.setFilter(accountId, {
        minLevel: body.minLevel,
        maxLevel: body.maxLevel,
        dogBreeds: body.dogBreeds,
      });
      const stats = friendPool.computeFilterStats(accountId, filter, {
        allowUnknownLevel: body.allowUnknownLevel === true,
      });
      res.json({ ok: true, data: { filter, stats } });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  // 按筛选条件统计「当前还能加多少人」+ 各犬种数量（不落盘，只读）
  app.get("/api/friends/pool/stats", requireFriendVip, (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const friendPool = require("../services/friend-pool");
      const query = req.query || {};
      const breeds = String(query.dogBreeds || "")
        .split(",")
        .map((breed) => breed.trim())
        .filter(Boolean);
      const allowUnknownLevel = String(query.allowUnknownLevel || '') === '1'
        || String(query.allowUnknownLevel || '').toLowerCase() === 'true';
      const stats = friendPool.computeFilterStats(accountId, {
        minLevel: query.minLevel,
        maxLevel: query.maxLevel,
        dogBreeds: breeds,
      }, { allowUnknownLevel });
      res.json({ ok: true, data: stats });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  // 好友数趋势：返回最近的点（前端画折线），顺便记录一次当前好友数
  app.get("/api/friends/pool/trend", requireFriendVip, async (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const friendPool = require("../services/friend-pool");
      let friendCount = null;
      try {
        const reply = await provider.getAllFriends(accountId);
        const friends = Array.isArray(reply && reply.game_friends) ? reply.game_friends : [];
        friendCount = friends.length;
        friendPool.recordTrend(accountId, friendCount);
      } catch (_) {
        // 好友列表拉取失败不影响已有趋势点
      }
      res.json({ ok: true, data: { points: friendPool.getTrend(accountId), friendCount } });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  // 自动补读状态：页面展示「正在读取 / 今日已读 / 最近一次结果」
  // 本账号的申请记录（历史累计）：待通过 / 已同意 / 已拒绝
  app.get("/api/friends/pool/applications", requireFriendVip, (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const friendPool = require("../services/friend-pool");
      const limit = Number(req.query.limit) || 200;
      res.json({ ok: true, data: friendPool.getApplyRecords(accountId, { limit }) });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.get("/api/friends/pool/auto-read", requireFriendVip, (req, res) => {
    const accountId = getAccountOrRespond(req, res, access);
    if (!accountId) return;

    try {
      const autoRead = require("../services/friend-pool-autoread");
      res.json({
        ok: true,
        data: {
          ...autoRead.getAutoReadStatus(),
          accountId,
        },
      });
    } catch (error) {
      sendProviderError(res, error);
    }
  });
}

module.exports = { registerAdminFriendRoutes };

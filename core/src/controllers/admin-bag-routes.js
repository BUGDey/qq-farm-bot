const { getItemById, getAllPlants, getItemImageById, getFruitPrice, getFruitName } = require("../config/gameConfig");
const { toNum } = require("../utils/utils");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireAccessibleAccount(
  req,
  res,
  getAccountIdFromRequest,
  canAccessAccount,
  missingAccountError = "Missing x-account-id",
) {
  const accountId = getAccountIdFromRequest(req);
  if (!accountId) {
    const payload = { ok: false };
    if (missingAccountError)
      payload.error = missingAccountError;
    res.status(400).json(payload);
    return null;
  }

  if (!canAccessAccount(req, accountId)) {
    res.status(403).json({ ok: false, error: "无权访问此账号" });
    return null;
  }

  return accountId;
}

function getItemName(itemId) {
  return getItemById(itemId)?.name || `物品${itemId}`;
}

function getBagItemCountMap(bag) {
  const counts = new Map();
  for (const item of bag?.originalItems || []) {
    counts.set(toNum(item.id), toNum(item.count));
  }
  return counts;
}

function getNewItemsAfterUse(bagBefore, bagAfter, usedItemId) {
  const beforeCounts = getBagItemCountMap(bagBefore);
  const newItems = [];

  for (const item of bagAfter?.originalItems || []) {
    const itemId = toNum(item.id);
    if (itemId === usedItemId)
      continue;

    const countDelta = toNum(item.count) - (beforeCounts.get(itemId) || 0);
    if (countDelta > 0) {
      newItems.push({
        id: itemId,
        count: countDelta,
        name: getItemName(itemId),
      });
    }
  }

  return newItems;
}

function buildUseItemMessage(usedItemName, usedCount, newItems) {
  if (newItems.length === 0)
    return `使用 ${usedItemName} x${usedCount}`;

  const rewards = newItems.map((item) => `${item.name} x${item.count}`).join(", ");
  return `使用 ${usedItemName} x${usedCount}，获得: ${rewards}`;
}

async function sellMergedBagItems(provider, accountId, items) {
  const normalized = items.map((item) => ({
    id: toNum(item.id),
    count: Math.max(1, toNum(item.count) || 1),
    uid: toNum(item.uid),
  }));
  const idCounts = new Map();
  for (const item of normalized)
    idCounts.set(item.id, (idCounts.get(item.id) || 0) + 1);

  const uniqueItems = normalized.filter(item => idCounts.get(item.id) === 1);
  const stackedItems = normalized.filter(item => idCounts.get(item.id) > 1);
  const results = [];

  if (uniqueItems.length > 0)
    results.push(await provider.sellItems(accountId, uniqueItems));

  // 同一物品在背包中可能按 UID 分成多个实例；官方客户端逐个 UID 出售。
  for (const item of stackedItems) {
    results.push(await provider.sellItems(accountId, [item]));
    if (stackedItems.length > 1)
      await wait(100);
  }

  return results.length === 1 ? results[0] : results;
}

/**
 * 构建果实图鉴目录（纯静态配置，不依赖账号在线）。
 * 返回 [{ id, name, image, price, priceUnit, count: 0, inBag: false }]，按 ID 升序。
 */
function buildFruitCatalog() {
  const seen = new Set();
  const fruits = [];
  for (const plant of getAllPlants()) {
    const fruitId = toNum(plant && plant.fruit && plant.fruit.id);
    if (fruitId <= 0 || seen.has(fruitId)) continue;
    seen.add(fruitId);
    const info = getItemById(fruitId) || null;
    fruits.push({
      id: fruitId,
      name: info && info.name ? String(info.name) : `${getFruitName(fruitId)}果实`,
      image: getItemImageById(fruitId),
      price: getFruitPrice(fruitId),
      priceUnit: "金",
      count: 0,
      inBag: false,
    });
  }
  fruits.sort((a, b) => a.id - b.id);
  return fruits;
}

/** 与背包页（BagPanel.getItemCategory）口径一致：植物果实 category='fruit'，或物品类型 17/6（活动果实，如黄金狗尾草 1040516 无植物映射）。 */
function isBagFruitItem(item) {
  if (!item) return false;
  if (item.category === "fruit") return true;
  const type = Number(item.itemType) || 0;
  return type === 17 || type === 6;
}

/** 从背包详情中提取果实条目。 */
function extractBagFruits(bag) {
  const items = Array.isArray(bag && bag.items) ? bag.items : [];
  return items
    .filter(item => isBagFruitItem(item) && toNum(item.id) > 0 && toNum(item.count) > 0)
    .map(item => ({
      id: toNum(item.id),
      name: String(item.name || ""),
      image: String(item.image || ""),
      price: toNum(item.price),
      priceUnit: String(item.priceUnit || "金"),
      count: toNum(item.count),
      inBag: true,
    }));
}

function registerAdminBagRoutes({
  app,
  provider,
  store,
  emitRealtimeLog,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  app.get("/api/bag", async (req, res) => {
    const accountId = requireAccessibleAccount(req, res, getAccountIdFromRequest, canAccessAccount, null);
    if (!accountId)
      return;

    try {
      const bag = await provider.getBag(accountId);
      res.json({ ok: true, data: bag });
    }
    catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/bag/use", async (req, res) => {
    const accountId = requireAccessibleAccount(req, res, getAccountIdFromRequest, canAccessAccount);
    if (!accountId)
      return;

    try {
      const { itemId, count, uid } = req.body;
      if (!itemId)
        return res.status(400).json({ ok: false, error: "缺少 itemId" });

      const usedItemId = toNum(itemId);
      const usedCount = Math.max(1, toNum(count) || 1);
      const usedItemName = getItemName(usedItemId);
      const bagBefore = await provider.getBag(accountId);

      const useResult = await provider.useItem(accountId, usedItemId, usedCount, toNum(uid));
      const actualUsedCount = useResult?.resumed ? 0 : usedCount;
      const message = useResult?.firework
        ? (useResult.resumed ? '已点燃上次放置的烟花' : '已使用并点燃一枚烟花')
        : buildUseItemMessage(usedItemName, usedCount, []);
      await wait(500);

      const bagAfter = await provider.getBag(accountId);
      const newItems = getNewItemsAfterUse(bagBefore, bagAfter, usedItemId);

      emitRealtimeLog({
        accountId,
        time: new Date().toISOString().replace("T", " ").slice(0, 19),
        tag: "背包",
        msg: useResult?.firework ? message : buildUseItemMessage(usedItemName, usedCount, newItems),
        module: "warehouse",
        event: "use_item",
      });

      res.json({
        ok: true,
        data: {
          items: newItems,
          usedItemName,
          usedCount: actualUsedCount,
          message,
        },
      });
    }
    catch (error) {
      if (String(error.message).startsWith('烟花：'))
        return res.json({ ok: false, error: error.message });
      sendProviderError(res, error);
    }
  });

  app.post("/api/bag/sell", async (req, res) => {
    const accountId = requireAccessibleAccount(req, res, getAccountIdFromRequest, canAccessAccount);
    if (!accountId)
      return;

    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ ok: false, error: "缺少出售物品列表" });

      const result = await sellMergedBagItems(provider, accountId, items);
      res.json({ ok: true, data: result });
    }
    catch (error) {
      sendProviderError(res, error);
    }
  });

  // 果实列表：source=bag 仅背包果实；source=catalog 仅图鉴目录（纯配置，账号离线也可用）；
  // source=all（默认）图鉴目录合并背包数量，背包读取失败时降级为纯目录并带 bagError。
  app.get("/api/bag/fruits", async (req, res) => {
    const accountId = requireAccessibleAccount(req, res, getAccountIdFromRequest, canAccessAccount);
    if (!accountId)
      return;

    const source = String(req.query.source || "all");
    try {
      let bagFruits = [];
      let bagError = "";
      if (source !== "catalog") {
        try {
          bagFruits = extractBagFruits(await provider.getBag(accountId));
        }
        catch (error) {
          if (source === "bag") throw error;
          bagError = String((error && error.message) || error || "背包读取失败");
        }
      }

      let fruits;
      if (source === "bag") {
        fruits = bagFruits;
      }
      else {
        const byId = new Map(buildFruitCatalog().map(fruit => [fruit.id, fruit]));
        for (const bagFruit of bagFruits) {
          const existing = byId.get(bagFruit.id);
          if (existing) {
            existing.count = bagFruit.count;
            existing.inBag = true;
            if (!existing.image && bagFruit.image) existing.image = bagFruit.image;
            if (!existing.price && bagFruit.price) existing.price = bagFruit.price;
          }
          else {
            byId.set(bagFruit.id, bagFruit);
          }
        }
        fruits = Array.from(byId.values()).sort((a, b) => a.id - b.id);
      }

      res.json({ ok: true, data: { fruits, bagError } });
    }
    catch (error) {
      sendProviderError(res, error);
    }
  });

  app.get("/api/bag/seeds", async (req, res) => {
    const accountId = requireAccessibleAccount(req, res, getAccountIdFromRequest, canAccessAccount);
    if (!accountId)
      return;

    try {
      const seeds = await provider.getBagSeeds(accountId);
      const result = store.syncBagSeedPriority(accountId, seeds);
      if (result.changed && typeof provider.syncAccountConfig === "function")
        provider.syncAccountConfig(accountId);
      res.json({
        ok: true,
        data: {
          seeds: result.seeds,
          priority: result.priority,
          knownIds: result.knownIds,
        },
      });
    }
    catch (error) {
      sendProviderError(res, error);
    }
  });

  app.get("/api/daily-gifts", async (req, res) => {
    const accountId = requireAccessibleAccount(req, res, getAccountIdFromRequest, canAccessAccount, null);
    if (!accountId)
      return;

    try {
      const gifts = await provider.getDailyGifts(accountId);
      res.json({ ok: true, data: gifts });
    }
    catch (error) {
      sendProviderError(res, error);
    }
  });
}

module.exports = { registerAdminBagRoutes, sellMergedBagItems, buildFruitCatalog, extractBagFruits, isBagFruitItem };

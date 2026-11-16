/**
 * 牧场（栏舍动物）管理路由
 * 只读详情走 provider（带并发合并）；写操作直接透传 worker。
 * 详情在 HTTP 边界补上可读名称，前端不展示裸 ID / protobuf 内部结构。
 */
const { getItemById, getItemImageById } = require("../config/gameConfig");

/** 给详情补展示字段：动物名称、牧草是否充足。返回浅副本，不污染 provider 缓存对象。 */
function enrichRanchDetail(data) {
  if (!data || !Array.isArray(data.ranches)) return data;
  return {
    ...data,
    ranches: data.ranches.map((ranch) => {
      const grassBuf = typeof ranch.grass === "string" && ranch.grass.length
        ? Buffer.from(ranch.grass, "base64")
        : Buffer.alloc(0);
      return {
        ...ranch,
        grass_ok: grassBuf.length > 0,
        animals: (ranch.animals || []).map((animal) => {
          const info = getItemById(animal.animal_id);
          return {
            ...animal,
            animal_name: info?.name || `动物 #${animal.animal_id}`,
            // 图片走项目内置的本地素材（/game-config 静态目录），不依赖外部 CDN
            animal_image: getItemImageById(animal.animal_id) || "",
          };
        }),
      };
    }),
  };
}
function getAuthorizedAccountId(req, res, { getAccountIdFromRequest, canAccessAccount }) {
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

function registerAdminRanchRoutes({
  app,
  provider,
  adminLogger,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  const ctx = { getAccountIdFromRequest, canAccessAccount };

  // 栏舍详情（主态；hostGid 查询参数>0 为客态）
  app.get("/api/ranch/detail", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, ctx);
    if (!accountId) return;
    try {
      const hostGid = Number(req.query.host_gid) || 0;
      const data = enrichRanchDetail(await provider.getRanchDetail(accountId, hostGid));
      res.json({ ok: true, data });
    } catch (err) {
      adminLogger.error("获取牧场详情失败", { error: err.message, stack: err.stack });
      sendProviderError(res, err);
    }
  });

  // 使坏次数（只读）
  app.get("/api/ranch/op-times", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, ctx);
    if (!accountId) return;
    try {
      const data = await provider.getRanchOpTimes(accountId);
      res.json({ ok: true, data });
    } catch (err) {
      adminLogger.error("获取牧场使坏次数失败", { error: err.message });
      sendProviderError(res, err);
    }
  });

  // 写操作统一入口：action ∈ placeAnimal/triggerProduce/harvest/feed/stroke/cleanAll/addFeed
  app.post("/api/ranch/:action", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, ctx);
    if (!accountId) return;
    const action = String(req.params.action || "");
    const body = req.body || {};
    try {
      let data;
      switch (action) {
        case "placeAnimal":
          data = await provider.ranchPlaceAnimal(accountId, body.ranch_inst_id, body.animal_id, body.giant_cub_item_id);
          break;
        case "triggerProduce":
          data = await provider.ranchTriggerProduce(accountId, body.ranch_inst_id, body.slot_index);
          break;
        case "harvest":
          data = await provider.harvestRanch(accountId, body.mode);
          break;
        case "feed":
          data = await provider.feedAnimal(accountId, body.ranch_inst_id, body.animal_inst_id, body.count);
          break;
        case "stroke":
          data = await provider.strokeAnimal(accountId, body.host_gid, body.ranch_inst_id, body.slot_index);
          break;
        case "cleanAll":
          data = await provider.cleanAllRanch(accountId, body.host_gid);
          break;
        case "addFeed":
          data = await provider.addFeed(accountId, body.instance_id, body.add_count, body.use_gold, body.host_gid);
          break;
        default:
          return res.status(400).json({ ok: false, error: `未知的牧场操作: ${action}` });
      }
      res.json({ ok: true, data });
    } catch (err) {
      adminLogger.error("牧场操作失败", { action, error: err.message, stack: err.stack });
      sendProviderError(res, err);
    }
  });
}

module.exports = { registerAdminRanchRoutes };

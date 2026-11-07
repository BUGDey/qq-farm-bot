/**
 * 装扮（小屋 / 木牌 / 栅栏 / 围栏 / 盆栽 / 狗窝 / 仓库 / 街道 / 头像框 / 铭牌）
 *
 * 数据来源：
 *   - 装扮清单：gameConfig/ItemInfo.json
 *       type = 18            → 场景装扮（小屋、木牌、栅栏、围栏、盆栽、狗窝、仓库、街道）
 *       type = 10 且 21xx     → 头像框
 *       type = 10 且 4010xx   → 铭牌
 *   - 缩略图：gameConfig/seed_images_named/<id>_*.png
 *   - 已解锁 / 当前穿戴：skinpb.SkinService 的 SkinsOwned / SkinsEquipped
 *   - 头像框：avatarframepb.AvatarFrameService 的 AvatarFramesOwned（equipped 即当前使用）
 *
 * 装备接口：Equip { skin_id, slot_type }，slot_type 用服务端在 SkinsOwned 里给出的原值。
 * 背包与装扮商城只作为兜底来源（老版本、或接口不可用时仍能显示一部分）。
 */

const fs = require("fs");
const path = require("path");
const { getItemImageById, getSeedImageBySeedId } = require("../config/gameConfig");
const { sendMsgAsync } = require("../utils/network");
const { types } = require("../utils/proto");
const { toNum, toLong } = require("../utils/utils");
const { getBag } = require("./warehouse");

const DECORATION_TYPE = 18;
const ITEM_TYPE_TRINKET = 10;
/** 装扮商城：装扮一旦解锁就从背包消失，商城记录是背包之外的补充来源 */
const DECORATION_SHOP_ID = 4;
const SKIN_SERVICE = "gamepb.skinpb.SkinService";
const FRAME_SERVICE = "gamepb.avatarframepb.AvatarFrameService";

const CATEGORY_ORDER = [
  "house",
  "board",
  "barrier",
  "fence",
  "tower",
  "doghouse",
  "warehouse",
  "road",
  "head_bg",
  "nameplate",
];

const CATEGORY_LABELS = {
  house: "小屋",
  board: "木牌",
  barrier: "栅栏",
  fence: "围栏",
  tower: "盆栽",
  doghouse: "狗窝",
  warehouse: "仓库",
  road: "街道",
  head_bg: "头像框",
  nameplate: "铭牌",
};

/** 盆栽默认位：官方客户端里这一格显示「空」，不是可替换装扮 */
const EMPTY_SLOT_IDS = new Set([204001]);

/** 槽位顺序与客户端页签一致，默认装扮没有服务端 slot_type 时按它推断 */
const SLOT_TYPE_BY_CATEGORY = {
  house: 1,
  board: 2,
  barrier: 3,
  tower: 4,
  doghouse: 5,
  warehouse: 6,
  road: 7,
  fence: 8,
};

function defaultSlotType(category) {
  return SLOT_TYPE_BY_CATEGORY[category] || 0;
}

let catalogCache = null;

/** 装扮缩略图：优先物品图集，其次同名皮肤图 */
function decorationImage(itemId) {
  return getItemImageById(itemId) || getSeedImageBySeedId(itemId) || "";
}

function itemInfoPath() {
  return path.join(__dirname, "..", "gameConfig", "ItemInfo.json");
}

/** 从 icon_res 判断是不是装扮，并解析分类 */
function categoryFromIconRes(iconRes) {
  const raw = String(iconRes || "");
  // 1.16.3 起缩略图路径为 gui/texture/skinIcon/icon_skin_<分类>/spriteFrame
  const skinIcon = raw.match(/icon_skin_([a-z0-9_]+)/i);
  if (skinIcon) {
    const name = skinIcon[1].toLowerCase().replace(/(_\d+)+$/, "");
    if (name === "fence" || name === "barrier" || name === "road" || name === "warehouse"
      || name === "doghouse" || name === "house" || name === "board") {
      return name;
    }
    if (name.startsWith("tower") || name === "pot") return "tower";
  }
  const skin = raw.match(/img_(?:skin|nangua)_([a-z0-9_]+)/i);
  if (skin) {
    let name = skin[1].toLowerCase();
    if (name.endsWith("head_bg")) return "head_bg";
    name = name.replace(/(_\d+)+$/, "");
    if (CATEGORY_LABELS[name]) return name;
    if (name.startsWith("tower")) return "tower";
    return "";
  }
  if (/head_bg|avatar/i.test(raw)) return "head_bg";
  if (/nameplate/i.test(raw)) return "nameplate";
  return "";
}

/** icon_res 缺失时按 id 段兜底 */
function categoryById(itemId) {
  const id = toNum(itemId);
  if (id >= 401000 && id < 402000) return "nameplate";
  if (id >= 2100 && id < 2200) return "head_bg";
  const head = Math.floor(id / 1000);
  if (head === 201) return "house";
  if (head === 202) return "board";
  if (head === 203) return "barrier";
  if (head === 204) return "tower";
  if (head === 205) return "doghouse";
  if (head === 206) return "warehouse";
  if (head === 207) return "road";
  if (head === 208) return "fence";
  return "";
}

/** 占位头像框：名字就是「头像框1/2/3」，没有美术资源，服务端也从不返回这三个 id */
const PLACEHOLDER_SLOT_IDS = new Set([2101, 2102, 2103]);

/** 该行是否属于装扮面板里的条目 */
function isDecorationRow(row) {
  const id = toNum(row && row.id);
  if (!id || EMPTY_SLOT_IDS.has(id) || PLACEHOLDER_SLOT_IDS.has(id)) return false;
  const type = toNum(row.type);
  if (type === DECORATION_TYPE) return true;
  if (type !== ITEM_TYPE_TRINKET) return false;
  const category = categoryFromIconRes(row.icon_res) || categoryById(id);
  return category === "head_bg" || category === "nameplate";
}

function loadCatalog() {
  if (catalogCache) return catalogCache;
  let rows = [];
  try {
    const raw = JSON.parse(fs.readFileSync(itemInfoPath(), "utf8"));
    rows = Array.isArray(raw) ? raw : raw.items || raw.data || [];
  } catch (err) {
    console.warn("[装扮] 读取 ItemInfo.json 失败:", err.message);
    rows = [];
  }

  const items = [];
  for (const row of rows) {
    if (!isDecorationRow(row)) continue;
    const id = toNum(row.id);
    const category = categoryFromIconRes(row.icon_res) || categoryById(id) || "other";
    if (!CATEGORY_LABELS[category]) continue;
    items.push({
      id,
      name: String(row.name || `装扮${id}`),
      category,
      categoryLabel: CATEGORY_LABELS[category],
      image: decorationImage(id),
      desc: String(row.desc || ""),
      effectDesc: String(row.effectDesc || ""),
      rarity: toNum(row.rarity) || 0,
      rarityColor: String(row.rarity_color || ""),
    });
  }
  items.sort((a, b) => a.id - b.id);
  catalogCache = items;
  return items;
}

function bagItems(bag) {
  if (bag && bag.item_bag && Array.isArray(bag.item_bag.items)) return bag.item_bag.items;
  if (Array.isArray(bag && bag.items)) return bag.items;
  if (Array.isArray(bag && bag.originalItems)) return bag.originalItems;
  return [];
}

/**
 * 背包 → 已拥有表。
 * 装扮是「解锁制」，服务端可能把数量发成 0，所以存在即视为已拥有。
 */
function ownedMapFromBag(bag) {
  const map = new Map();
  for (const item of bagItems(bag)) {
    const id = toNum(item && item.id);
    if (id > 0) map.set(id, toNum(item && item.count));
  }
  return map;
}

/** 装扮商城回包 → 已解锁表（owned / unlocked / 已买满限购 三种都算已拥有） */
function ownedIdsFromShopReply(reply) {
  const map = new Map();
  for (const goods of (reply && reply.goods_list) || []) {
    const itemId = toNum(goods && goods.item_id);
    if (!itemId) continue;
    const limit = toNum(goods.limit_count);
    const bought = toNum(goods.bought_num);
    const owned = goods.owned === true
      || goods.unlocked === true
      || (limit > 0 && bought >= limit);
    if (!owned) continue;
    map.set(itemId, bought > 0 ? bought : 1);
  }
  return map;
}

/** 本进程内刚装备成功的装扮（服务端接口异常时仍能显示「当前使用」） */
const equippedByCategory = new Map();

function emptyPayload(type) {
  return type.encode(type.create({})).finish();
}

/**
 * 已解锁装扮：skin_id → { slotType, isNew }。
 * slot_type 由服务端给出，装备时原样回传，不需要我们猜分类编号。
 */
async function fetchOwnedSkins() {
  const { body } = await sendMsgAsync(SKIN_SERVICE, "SkinsOwned", emptyPayload(types.SkinsOwnedRequest));
  const reply = types.SkinsOwnedReply.decode(body);
  const map = new Map();
  for (const skin of reply.skins || []) {
    const id = toNum(skin.skin_id);
    if (id > 0) map.set(id, { slotType: toNum(skin.slot_type), isNew: skin.is_new === true });
  }
  return map;
}

/** 当前穿戴：skin_id → { slotType } */
async function fetchEquippedSkins() {
  const { body } = await sendMsgAsync(SKIN_SERVICE, "SkinsEquipped", emptyPayload(types.SkinsEquippedRequest));
  const reply = types.SkinsEquippedReply.decode(body);
  const map = new Map();
  for (const skin of reply.skins || []) {
    const id = toNum(skin.skin_id);
    if (id > 0) map.set(id, { slotType: toNum(skin.slot_type) });
  }
  return map;
}

/** 某一类挂件（头像框/铭牌/…）：frame_type 由服务端定义，1/2/3 各拉一次 */
async function fetchFramesOfType(frameType) {
  const body = types.AvatarFramesOwnedRequest.encode(
    types.AvatarFramesOwnedRequest.create({ frame_type: frameType })
  ).finish();
  const { body: replyBody } = await sendMsgAsync(FRAME_SERVICE, "AvatarFramesOwned", body);
  const reply = types.AvatarFramesOwnedReply.decode(replyBody);
  const rows = [];
  for (const frame of reply.frames || []) {
    rows.push({
      id: toNum(frame.frame_id),
      status: toNum(frame.status),
      equipped: toNum(frame.equipped) === 1,
      expireTime: toNum(frame.expire_time),
      type: frameType,
    });
  }
  return rows;
}

/** 头像框/铭牌：frame_id → { equipped, expireTime, status, type }（合并 1/2/3 三类） */
async function fetchOwnedFrames() {
  const map = new Map();
  for (const frameType of [1, 2]) {
    try {
      for (const row of await fetchFramesOfType(frameType)) {
        if (row.id > 0 && !map.has(row.id)) map.set(row.id, row);
      }
    } catch {
      // 某一类不支持就跳过，不影响其他类
    }
  }
  return map;
}

/** 诊断专用：把每种 frame_type 的回包原样换成 hex，用来核对字段号 */
async function probeFrameRaw() {
  const out = [];
  for (const frameType of [1, 2]) {
    try {
      const body = types.AvatarFramesOwnedRequest.encode(
        types.AvatarFramesOwnedRequest.create({ frame_type: frameType })
      ).finish();
      const { body: replyBody } = await sendMsgAsync(FRAME_SERVICE, "AvatarFramesOwned", body);
      const buf = Buffer.from(replyBody);
      out.push({ type: frameType, bytes: buf.length, hex: buf.subarray(0, 320).toString("hex") });
    } catch (err) {
      out.push({ type: frameType, error: err.message || String(err) });
    }
  }
  return out;
}

async function getDecorationsSnapshot(options = {}) {
  const catalog = loadCatalog();
  /** id → { count, source } */
  const owned = new Map();
  const equipped = new Set();
  const diagnostics = {
    skin: { owned: null, equipped: null, error: "" },
    frame: { owned: null, error: "", note: "", equippedIds: [] },
    shop: { unlocked: null, error: "" },
    bag: { size: null, error: "" },
  };

  const collect = async (label, task, onResult) => {
    try {
      const result = await task();
      onResult(result);
    } catch (err) {
      diagnostics[label].error = err.message || String(err);
      if (!options.allowLookupFailure) throw err;
    }
  };

  if (options.skins !== false) {
    await collect("skin", fetchOwnedSkins, (skins) => {
      diagnostics.skin.owned = skins.size;
      for (const [id, meta] of skins) owned.set(id, { count: 1, source: "skin", slotType: meta.slotType });
    });
    await collect("skin", fetchEquippedSkins, (map) => {
      diagnostics.skin.equipped = map.size;
      for (const id of map.keys()) equipped.add(id);
    });
  }

  if (options.frames !== false) {
    await collect("frame", fetchOwnedFrames, (frames) => {
      diagnostics.frame.owned = frames.size;
      const equippedIds = [];
      for (const [id, meta] of frames) {
        if (!owned.has(id)) owned.set(id, { count: 1, source: "frame" });
        // 服务端回包里「是否佩戴」这一位永远是 1，靠它判断不出当前用的是哪件，
        // 所以只能认我们自己换过的那一件（换成功时记在本地）。
        if (getEquippedFrame(meta.type) === id && catalog.some((item) => item.id === id)) equippedIds.push(id);
      }
      if (equippedIds.length > 0) {
        for (const id of equippedIds) equipped.add(id);
      } else {
        diagnostics.frame.note = "服务端不提供佩戴状态；这里只显示通过面板换上的那一件";
      }
    });
  }

  // 兜底：商城解锁记录（接口不可用、或老账号）
  if (options.shop !== false && owned.size === 0) {
    await collect("shop", async () => {
      const { getShopInfo } = require("./farm-api");
      return getShopInfo(DECORATION_SHOP_ID);
    }, (reply) => {
      const shopOwned = ownedIdsFromShopReply(reply);
      diagnostics.shop.unlocked = shopOwned.size;
      for (const [id, count] of shopOwned) {
        if (!owned.has(id)) owned.set(id, { count, source: "shop" });
      }
    });
  }

  // 兜底：背包（没解锁的装扮还在背包里）
  if (options.bag !== false) {
    await collect("bag", () => getBag(), (bag) => {
      diagnostics.bag.size = bagItems(bag).length;
      const bagOwned = ownedMapFromBag(bag);
      for (const [id, count] of bagOwned) {
        if (!owned.has(id)) owned.set(id, { count, source: "bag" });
      }
    });
  }

  const categories = CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    items: [],
  }));
  const byKey = new Map(categories.map((category) => [category.key, category]));

  let ownedTotal = 0;
  let equippedTotal = 0;
  for (const item of catalog) {
    const entry = owned.get(item.id);
    // 默认装扮对每个槽位都可用，服务端 SkinsOwned 不会把默认项列出来
    const isDefault = /^默认/.test(String(item.name || ""));
    const isOwned = Boolean(entry) || isDefault;
    const isEquipped = equipped.has(item.id) || equippedByCategory.get(item.category) === item.id;
    if (isOwned) ownedTotal += 1;
    if (isEquipped) equippedTotal += 1;
    const bucket = byKey.get(item.category);
    if (!bucket) continue;
    bucket.items.push({
      ...item,
      ownedCount: entry ? entry.count : 0,
      owned: isOwned,
      equipped: isEquipped,
      slotType: entry && entry.slotType != null ? entry.slotType : (isDefault ? defaultSlotType(item.category) : null),
      source: entry ? entry.source : (isDefault ? "default" : ""),
    });
  }

  return {
    fetchedAt: new Date().toISOString(),
    categories: categories.filter((category) => category.items.length > 0),
    total: catalog.length,
    ownedTotal,
    equippedTotal,
    skin: diagnostics.skin,
    frame: diagnostics.frame,
    shop: diagnostics.shop,
    bag: diagnostics.bag,
  };
}

function decorationError(message, code) {
  const error = new Error(message);
  if (code) error.code = code;
  return error;
}

/**
 * 更换头像框：avatarframepb.AvatarFrameService 的 UpdateEquip。
 *
 * 真实结构来自抓包解密：请求体是「旧 id → 新 id」两个 int64
 * （`08 f1 10 10 f3 10` = 2161 → 2163），回包是换完之后当前佩戴的那一套。
 * proto 里这两个字段当初按 frame_id(1)/frame_type(2) 命名，编号一致，直接复用。
 */
const equippedFrameByType = new Map();
const EQUIPPED_FILE = process.env.QQFARM_DECORATION_EQUIPPED_FILE
  || require("path").join(__dirname, "..", "..", "data", "decoration-equipped.json");
let equippedLoaded = false;

function loadEquippedFrames() {
  if (equippedLoaded) return equippedFrameByType;
  equippedLoaded = true;
  try {
    const raw = JSON.parse(require("fs").readFileSync(EQUIPPED_FILE, "utf8"));
    for (const [type, id] of Object.entries(raw || {})) {
      const value = toNum(id);
      if (value) equippedFrameByType.set(toNum(type), value);
    }
  } catch {
    // 没有文件就是没换过
  }
  return equippedFrameByType;
}

/** 服务端不给挂件佩戴状态，只能记我们换成功的那一件。 */
function getEquippedFrame(frameType) {
  const map = loadEquippedFrames();
  return toNum(map.get(toNum(frameType))) || 0;
}

function rememberEquippedFrame(frameType, frameId) {
  const map = loadEquippedFrames();
  map.set(toNum(frameType), toNum(frameId));
  try {
    require("fs").mkdirSync(require("path").dirname(EQUIPPED_FILE), { recursive: true });
    require("fs").writeFileSync(EQUIPPED_FILE, JSON.stringify(Object.fromEntries(map)), "utf8");
  } catch {
    // 写不进去只影响下次判断，不影响本次结果
  }
}

async function equipFrame(frameId, frameType = 1) {
  const id = toNum(frameId);
  const type = toNum(frameType) || 1;

  // 首选 Equip{frame_id}：抓包里头像框和铭牌（401005）都用这条，请求体就一个字段
  const body = types.AvatarFrameEquipRequest.encode(
    types.AvatarFrameEquipRequest.create({ frame_id: toLong(id) })
  ).finish();

  let replyBody;
  let via = "Equip";
  try {
    ({ body: replyBody } = await sendMsgAsync(FRAME_SERVICE, "Equip", body));
  } catch (err) {
    const text = String((err && err.message) || err);
    // 有些情况下服务端要求「先卸下再装」或者只接受 UpdateEquip，这里退一步再试
    const previous = toNum(equippedFrameByType.get(type)) || 0;
    try {
      const alt = types.UpdateEquipRequest.encode(
        types.UpdateEquipRequest.create({ frame_id: toLong(previous), frame_type: toLong(id) })
      ).finish();
      ({ body: replyBody } = await sendMsgAsync(FRAME_SERVICE, "UpdateEquip", alt));
      via = "UpdateEquip";
    } catch (err2) {
      throw decorationError(
        `服务端拒绝了这次挂件替换：Equip → ${text}；UpdateEquip → ${(err2 && err2.message) || err2}`,
        "DECORATION_EQUIP_FAILED"
      );
    }
  }

  const reply = types.AvatarFrameEquipReply.decode(replyBody);
  const replyFrames = (reply.frames || []).map((frame) => ({
    id: toNum(frame.frame_id),
    type: toNum(frame.status) || type,
    equipped: true,
  }));
  for (const frame of replyFrames) equippedFrameByType.set(frame.type, frame.id);

  // 换成功了就把「这个槽位现在戴的是谁」记下来：服务端不给佩戴状态，只能自己记
  rememberEquippedFrame(type, id);

  return {
    confirmed: replyFrames.length === 0 ? true : replyFrames.some((frame) => frame.id === id),
    via,
    frames: replyFrames.length > 0 ? replyFrames : [{ id, type, equipped: true }],
  };
}

  /**
 * 更换铭牌：与头像框同一个服务（AvatarFrameService/Equip），只是 frame_type = 2。
 * 抓包里换铭牌 401005 的请求体就是 `08 ed bc 18`，只带 frame_id。
 */
async function equipNameplate(decoration) {
  const result = await equipFrame(decoration.id, 2);
  return {
    itemId: decoration.id,
    name: decoration.name,
    category: decoration.category,
    categoryLabel: decoration.categoryLabel,
    slotType: null,
    equipped: result.frames,
  };
}
  /**
 * slot_type 必须是服务端在 SkinsOwned 里给出的值，所以先查一次已解锁清单。
 */
async function equipDecoration(itemId) {
  const id = toNum(itemId);
  if (!id) throw decorationError("缺少装扮 ID", "INVALID_ARGUMENT");

  const catalog = loadCatalog();
  const decoration = catalog.find((item) => item.id === id);
  if (!decoration) throw decorationError("未知的装扮", "DECORATION_NOT_FOUND");

  const isDefaultSlot = String(decoration.name || "").startsWith("默认");

  // 铭牌走 skinpb.Equip，但只带 skin_id（抓包里就是 `08 ed bc 18`，没有 slot_type）
  if (decoration.category === "nameplate") {
    const frames = await fetchOwnedFrames();
    if (!frames.has(id)) throw decorationError("这个铭牌不在你的已拥有清单里", "DECORATION_NOT_OWNED");
    return await equipNameplate(decoration);
  }

  // 头像框走 avatarframepb.UpdateEquip（旧 id → 新 id）
  if (decoration.category === "head_bg") {
    const frames = await fetchOwnedFrames();
    const frameMeta = frames.get(id);
    if (!frameMeta) throw decorationError("这个头像框不在你的已拥有清单里", "DECORATION_NOT_OWNED");
    const result = await equipFrame(id, frameMeta.type || 1);
    if (!result.confirmed) {
      const wearing = result.frames.filter((frame) => frame.equipped).map((frame) => frame.id);
      throw decorationError(
        `服务端没有确认这次头像框替换（服务端当前已装备：${wearing.join("、") || "无"}）`,
        "DECORATION_NOT_CONFIRMED"
      );
    }
    return {
      itemId: id,
      name: decoration.name,
      category: decoration.category,
      categoryLabel: decoration.categoryLabel,
      slotType: null,
      equipped: result.frames,
    };
  }

  const ownedSkins = await fetchOwnedSkins();
  const entry = ownedSkins.get(id);
  // 默认装扮不在 SkinsOwned 里（服务端只回已购买/已解锁的），但对每个槽位一定可用
  if (!entry && !isDefaultSlot) throw decorationError("还没有解锁这件装扮", "DECORATION_NOT_OWNED");

  const body = types.EquipRequest.encode(
    types.EquipRequest.create({
      skin_id: toLong(id),
      // 默认装扮没有服务端给的 slot_type，按槽位顺序推一个（house=1、board=2…）
      slot_type: toLong(entry ? entry.slotType || 0 : defaultSlotType(decoration.category)),
    })
  ).finish();

  let replyBody;
  try {
    ({ body: replyBody } = await sendMsgAsync(SKIN_SERVICE, "Equip", body));
  } catch (err) {
    const text = String((err && err.message) || err);
    if (text.includes("1036003")) {
      throw decorationError(
        isDefaultSlot
          ? "服务端不接受「默认」装扮：默认外观不是一件皮肤，接口无法切回。请在游戏里手动还原，或换一件已解锁的装扮。"
          : "服务端认为这件装扮还没解锁（code=1036003），请先在游戏里解锁",
        "DECORATION_NOT_OWNED"
      );
    }
    throw err;
  }
  const reply = types.EquipReply.decode(replyBody);
  const skins = (reply.skins || []).map((skin) => ({
    id: toNum(skin.skin_id),
    slotType: toNum(skin.slot_type),
  }));

  // 回包里带最新穿戴就直接采信；回包为空时再查一次 SkinsEquipped 复核（有些服务端只在推送里带状态）
  let applied = skins.some((skin) => skin.id === id);
  if (!applied) {
    try {
      const equippedNow = await fetchEquippedSkins();
      applied = equippedNow.has(id);
      if (!applied && equippedNow.size > 0) {
        for (const [equippedId, meta] of equippedNow) skins.push({ id: equippedId, slotType: meta.slotType });
      }
    } catch {
      // 复核失败不影响主流程，下面的判断会给出可读提示
    }
  }
  if (!applied) {
    const detail = skins.length > 0 ? `（服务端当前穿戴：${skins.map((skin) => skin.id).join("、")}）` : "（服务端回包为空）";
    throw decorationError(`服务端没有确认这次替换，请稍后重试${detail}`, "DECORATION_NOT_CONFIRMED");
  }

  equippedByCategory.set(decoration.category, id);
  return {
    itemId: id,
    name: decoration.name,
    category: decoration.category,
    categoryLabel: decoration.categoryLabel,
    slotType: entry.slotType,
    equipped: skins,
  };
}

/**
 * 诊断：把三路来源的原始 ID 原样吐出来，便于判断「服务端到底认哪些」。
 * 不改任何状态，只读。
 */
async function getDecorationDiagnostics() {
  const catalog = loadCatalog();
  const catalogIds = new Set(catalog.map((item) => item.id));
  const result = {
    catalogTotal: catalog.length,
    catalogSample: catalog.slice(0, 8).map((item) => `${item.id}:${item.name}`),
    skin: { owned: [], equipped: [], error: "" },
    frame: { owned: [], error: "" },
    shop: { unlocked: [], error: "" },
    bag: { ids: [], error: "" },
  };

  const safe = async (target, task, assign) => {
    try {
      assign(result[target], await task());
    } catch (err) {
      result[target].error = err.message || String(err);
    }
  };

  await safe("skin", fetchOwnedSkins, (target, map) => {
    target.owned = [...map.entries()].map(([id, meta]) => ({ id, slotType: meta.slotType, inCatalog: catalogIds.has(id) }));
  });
  await safe("skin", fetchEquippedSkins, (target, map) => {
    target.equipped = [...map.entries()].map(([id, meta]) => ({ id, slotType: meta.slotType, inCatalog: catalogIds.has(id) }));
  });
  await safe("frame", fetchOwnedFrames, (target, map) => {
    target.owned = [...map.entries()].map(([id, meta]) => ({
      id,
      type: meta.type,
      status: meta.status,
      equipped: meta.equipped,
      expire: meta.expireTime,
      inCatalog: catalogIds.has(id),
    }));
    // 按 frame_type 分开列，便于核对服务端到底把哪些 id 归到哪一类
    const byType = {};
    for (const meta of map.values()) {
      const key = String(meta.type);
      byType[key] = byType[key] || [];
      byType[key].push(meta.id);
    }
    target.byType = byType;
  });
  result.frame.raw = await probeFrameRaw();

  await safe("shop", async () => ownedIdsFromShopReply(await require("./farm-api").getShopInfo(DECORATION_SHOP_ID)), (target, map) => {
    target.unlocked = [...map.keys()].map((id) => ({ id, inCatalog: catalogIds.has(id) }));
  });
  await safe("bag", async () => ownedMapFromBag(await getBag()), (target, map) => {
    target.ids = [...map.entries()].map(([id, count]) => ({ id, count, inCatalog: catalogIds.has(id) }));
  });

  return result;
}

module.exports = {
  CATEGORY_LABELS,
  EMPTY_SLOT_IDS,
  loadCatalog,
  isDecorationRow,
  categoryFromIconRes,
  categoryById,
  ownedIdsFromShopReply,
  fetchOwnedSkins,
  fetchEquippedSkins,
  fetchOwnedFrames,
  getDecorationsSnapshot,
  getDecorationDiagnostics,
  equipDecoration,
  equipFrame,
};
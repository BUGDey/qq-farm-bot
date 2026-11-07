const test = require("node:test");
const assert = require("node:assert/strict");

const {
  loadCatalog,
  categoryFromIconRes,
  categoryById,
  ownedIdsFromShopReply,
  getDecorationsSnapshot,
} = require("../src/services/decoration");
const { registerAdminDecorationRoutes } = require("../src/controllers/admin-decoration-routes");

test("装扮清单：场景装扮 + 头像框 + 铭牌都被收录", () => {
  const catalog = loadCatalog();
  assert.ok(catalog.length >= 119, `装扮数量偏少: ${catalog.length}`);
  const ids = new Set(catalog.map((item) => item.id));
  for (const id of [201001, 202002, 203002, 2150, 2151, 2163, 401001, 401005]) {
    assert.ok(ids.has(id), `缺少装扮 ${id}`);
  }
  for (const item of catalog) {
    assert.ok(item.name, `装扮 ${item.id} 没有名称`);
    assert.ok(item.category, `装扮 ${item.id} 没有分类`);
  }
  // 官方客户端里 204001 是「空」位，不属于可替换装扮
  assert.equal(ids.has(204001), false);
  const frames = catalog.filter((item) => item.category === "head_bg");
  const plates = catalog.filter((item) => item.category === "nameplate");
  assert.ok(frames.length >= 20, `头像框偏少: ${frames.length}`);
  assert.ok(plates.length >= 5, `铭牌偏少: ${plates.length}`);
});

test("装扮缩略图：清单里的每一件都有素材", () => {
  const catalog = loadCatalog();
  // 2101/2102/2103 是「头像框1/2/3」占位项，没有美术资源，已从清单剔除
  const missing = catalog.filter((item) => !item.image).map((item) => item.id).sort((a, b) => a - b);
  assert.deepEqual(missing, []);
  const ids = new Set(catalog.map((item) => item.id));
  assert.equal(ids.has(2101), false);
});

test("分类解析：icon_res 优先，ID 前缀兜底", () => {
  assert.equal(categoryFromIconRes("gui/texture/skinDetail/img_skin_house_1/spriteFrame"), "house");
  assert.equal(categoryFromIconRes("gui/texture/skinDetail/img_skin_tower_1_1/spriteFrame"), "tower");
  assert.equal(categoryFromIconRes("gui/texture/skinDetail/img_nangua_head_bg/spriteFrame"), "head_bg");
  assert.equal(categoryFromIconRes("gui/texture/skinIcon/icon_skin_doghouse/spriteFrame"), "doghouse");
  assert.equal(categoryFromIconRes("gui/texture/skinIcon/icon_skin_warehouse/spriteFrame"), "warehouse");
  assert.equal(categoryFromIconRes("gui/texture/skinIcon/icon_skin_fence/spriteFrame"), "fence");
  assert.equal(categoryFromIconRes("gui/texture/nameplate/icon/icon_nameplate_saiji_1/spriteFrame"), "nameplate");
  assert.equal(categoryFromIconRes(""), "");
  assert.equal(categoryById(204002), "tower");
  assert.equal(categoryById(205002), "doghouse");
  assert.equal(categoryById(206002), "warehouse");
  assert.equal(categoryById(207002), "road");
  assert.equal(categoryById(208002), "fence");
  assert.equal(categoryById(2150), "head_bg");
  assert.equal(categoryById(401001), "nameplate");
});

test("装扮快照：所有来源都关掉时只有默认装扮算已拥有", async () => {
  const snapshot = await getDecorationsSnapshot({ bag: false, shop: false, skins: false, frames: false });
  assert.ok(snapshot.categories.length >= 6);
  assert.equal(snapshot.total, loadCatalog().length);
  // 默认装扮对每个槽位永远可用，服务端 SkinsOwned 不会列出它们
  const defaults = loadCatalog().filter((item) => /^默认/.test(item.name));
  assert.ok(defaults.length > 0);
  assert.equal(snapshot.ownedTotal, defaults.length);
  for (const category of snapshot.categories) {
    assert.ok(category.label);
    assert.ok(category.items.length > 0);
    for (const item of category.items) {
      if (/^默认/.test(item.name)) {
        assert.equal(item.owned, true);
        assert.equal(item.source, "default");
        continue;
      }
      assert.equal(item.owned, false);
      assert.equal(item.equipped, false);
    }
  }
});

test("装扮商城回包：owned / unlocked / 买满限购 都算已解锁", () => {
  const owned = ownedIdsFromShopReply({
    goods_list: [
      { item_id: 201001, owned: true },
      { item_id: 201002, unlocked: true },
      { item_id: 201003, limit_count: 1, bought_num: 1 },
      { item_id: 201004, limit_count: 3, bought_num: 1 },
      { item_id: 0, owned: true },
    ],
  });
  assert.deepEqual([...owned.keys()].sort((a, b) => a - b), [201001, 201002, 201003]);
});

test("路由：注册装扮列表、诊断与装备三个接口", () => {
  const registered = [];
  const app = {
    get: (path) => registered.push(`GET ${path}`),
    post: (path) => registered.push(`POST ${path}`),
  };
  registerAdminDecorationRoutes({
    app,
    provider: {},
    adminLogger: { error() {} },
    getAccountIdFromRequest: () => "",
    canAccessAccount: () => true,
    sendProviderError: () => {},
  });
  assert.deepEqual(registered, [
    "GET /api/decorations",
    "GET /api/decorations/diagnostics",
    "POST /api/decorations/equip",
  ]);
});

// ===== SkinService 接线 =====

const NETWORK_PATH = require.resolve("../src/utils/network");

/** 用假网络模块重新加载装扮服务，返回一个独立的实例 */
function freshDecoration(fake) {
  const original = require.cache[NETWORK_PATH];
  require.cache[NETWORK_PATH] = { id: NETWORK_PATH, filename: NETWORK_PATH, loaded: true, exports: fake };
  const decorationPath = require.resolve("../src/services/decoration");
  delete require.cache[decorationPath];
  const mod = require(decorationPath);
  if (original) require.cache[NETWORK_PATH] = original;
  else delete require.cache[NETWORK_PATH];
  return mod;
}

async function protoTypes() {
  const proto = require("../src/utils/proto");
  await proto.loadProto();
  return proto.types;
}

function fakeSkinNetwork(types, calls) {
  return {
    async sendMsgAsync(service, method, body) {
      calls.push({ service, method, size: body ? body.length : 0 });
      if (method === "SkinsOwned") {
        const reply = types.SkinsOwnedReply.encode(types.SkinsOwnedReply.create({
          skins: [
            { skin_id: 201001, slot_type: 1 },
            { skin_id: 201002, slot_type: 2, is_new: true },
          ],
        })).finish();
        return { body: reply };
      }
      if (method === "SkinsEquipped") {
        const reply = types.SkinsEquippedReply.encode(types.SkinsEquippedReply.create({
          skins: [{ skin_id: 201002, slot_type: 2 }],
        })).finish();
        return { body: reply };
      }
      if (method === "Equip") {
        const request = types.EquipRequest.decode(body);
        const reply = types.EquipReply.encode(types.EquipReply.create({
          skins: [{ skin_id: request.skin_id, slot_type: request.slot_type }],
        })).finish();
        return { body: reply };
      }
      throw new Error(`未预期的接口 ${service}/${method}`);
    },
  };
}

test("装扮快照：已解锁与当前穿戴都来自 SkinService", async () => {
  const types = await protoTypes();
  const calls = [];
  const decoration = freshDecoration(fakeSkinNetwork(types, calls));
  const snapshot = await decoration.getDecorationsSnapshot({ bag: false, shop: false, frames: false });

  assert.deepEqual(calls.map((c) => c.method), ["SkinsOwned", "SkinsEquipped"]);
  // SkinsOwned 的两件 + 默认装扮（每槽位一件，服务端不返回）；201001 既是默认小屋也在假回包里，去重
  const defaults = loadCatalog().filter((item) => /^默认/.test(item.name)).map((item) => item.id);
  assert.equal(snapshot.ownedTotal, new Set([...defaults, 201001, 201002]).size);
  assert.equal(snapshot.equippedTotal, 1);

  const items = snapshot.categories.flatMap((category) => category.items);
  const house = items.find((item) => item.id === 201001);
  const board = items.find((item) => item.id === 201002);
  assert.equal(house.owned, true);
  assert.equal(house.equipped, false);
  assert.equal(house.slotType, 1);
  assert.equal(board.owned, true);
  assert.equal(board.equipped, true);
  assert.equal(board.slotType, 2);
});

test("装扮替换：Equip 带回包确认，未解锁直接报错", async () => {
  const types = await protoTypes();
  const calls = [];
  const decoration = freshDecoration(fakeSkinNetwork(types, calls));

  const result = await decoration.equipDecoration(201002);
  assert.equal(result.itemId, 201002);
  assert.equal(result.slotType, 2);
  assert.equal(Number(calls.find((c) => c.method === "Equip").size) > 0, true);
  assert.deepEqual(calls.map((c) => c.method), ["SkinsOwned", "Equip"]);

  // 没解锁的装扮连 Equip 都不该发
  await assert.rejects(() => decoration.equipDecoration(201003), (err) => err.code === "DECORATION_NOT_OWNED");
});
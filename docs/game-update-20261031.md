# 游戏版本与资源对齐（2026-11-01 更新）

记录当前对齐的游戏版本、仓库里游戏资源的覆盖情况，以及每次官方更新后该怎么核对。
核对脚本：`core/scripts/audit-game-resources.js`。

## 一、当前对齐的版本

| 项 | 值 | 来源 |
| --- | --- | --- |
| 客户端版本 | `1.16.1.6_20261028` | 启动日志 `runtime 已加载系统配置` 里的 `clientVersion` |
| 平台 | `qq` | 同上 |
| 网关 | `wss://gate-obt.nqf.qq.com/prod/ws` | `core/src/config/config.js` |
| TSDK | QQ `v3.9.0.1793452320` / 微信 `v3.9.0.1793451777`（双端构建） | 见「[TSDK 运行约定](tsdk-runtime.md)」 |

配置表规模（启动日志会打印）：

- 植物主表 317 种（合并活动植物后 318）
- 物品表 1074 条
- 等级经验表 240 级
- 种子图 497 项、植物阶段图 248 种、装扮道具图 32 项、变异效果 18 种

## 二、覆盖度核对结果

```
$ node core/scripts/audit-game-resources.js
{
  "plants": 317,
  "normalPlants": 230,
  "noSeedIdPlants": 87,
  "missingSeedCount": 0,
  "missingPhaseCount": 2,
  "missingSeed": [],
  "missingPhase": [
    "Crop_883 小红花",
    "Crop_6030 月下美人"
  ]
}
```

解读：

- **种子图 100% 覆盖**（`missingSeedCount = 0`）：317 种植物里，230 种有 `seed_id` 的都有种子图；
  另外 87 种是「黄金·xxx」这类变体，配置里 `seed_id = 0`，本来就没有种子图。
- **阶段图缺 2 个**：小红花（`Crop_883`）、月下美人（`Crop_6030`），是 1.16 新增作物，
  官方仓库与客户端缓存里都还没有对应阶段图，属于「官方没给」而不是「我们漏抓」。
  要补只能等官方放图，不要用手画的占位图顶上，否则图鉴里会出现错误外观。
- 阶段图统计现在会同时看 manifest 与实际目录：上游经常只补图片不更新 `manifest.json`，
  这类作物由 `core/src/config/gameConfig.js` 的目录扫描兜底，不再显示「暂无阶段图」。

判定规则（与 `core/src/config/gameConfig.js` 一致）：

```js
// seed_id > 20000 的种子的阶段图目录是 Crop_{seed_id - 20000}
// 否则是 Plant_{plant.id}
const key = seedId > 20000 ? `Crop_${seedId - 20000}` : `Plant_${plant.id}`;
```

## 三、官方更新后怎么做

1. **先看版本号变没变**：启动日志里的 `clientVersion` 与本文档不一致时，说明官方更新了。
2. **核对资源**：跑 `node core/scripts/audit-game-resources.js`，对比 `missingSeedCount` / `missingPhaseCount`。
3. **同步配置表**：`node core/scripts/sync-config-tables.js`（只新增、不改存量，规则见
   「[配置存储、迁移与缓存](config-storage.md)」）。
4. **抽新图**：植物阶段图用 `pnpm -C core extract:plant-phases`；
   活动特效图（雨落成诗）用 `node core/scripts/extract-rain-poem-effects.js`。
5. **回归**：`node --test test/*.test.js`，再跑一次启动看植物/物品数量有没有异常跳变。
6. **更新本文档**：把新的版本号、数量、缺失清单写进去，并在「更新日志」里记一条。

## 四、注意事项

- 资源只从**官方缓存**取：`%APPDATA%\QQEX\miniapp\fs\<QQ号>\1112386029\usr\gamecaches`
  与官方源码目录 `%APPDATA%\QQEX\miniapp\temps\miniapp_src`。不要从第三方仓库拷图，
  版本不一致会导致名称/外观对不上。
- 缓存里的图片是哈希文件名（`native/<uuid>.<hash>.png`），要靠 `cacheList.json` 的 URL 映射回业务名，
  不要凭文件名猜。
- 新增的 `Plant.json` / `ItemInfo.json` 条目务必跑测试：有测试校验「活动作物等级不能变成 200」这类回归。
- 阶段图缺失不要紧，前端会退到种子图/占位；种子图缺失才是真的难看。

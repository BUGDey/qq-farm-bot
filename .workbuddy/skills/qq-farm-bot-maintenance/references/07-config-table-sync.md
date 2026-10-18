# 配置表增量同步（Plant.json / ItemInfo.json）与兜底推送

来源：2026-10-19 数据收录实战（提交 `b632eed`）。核心产出是仓库内脚本
`core/scripts/sync-config-tables.js`（已入库）与本文件记录的方法论。
配套脚本 `core/scripts/merge-upstream-iteminfo.mjs` 是早期一次性合并工具，
安全策略与本文件一致，但落盘策略是整体替换式，**新任务一律用 sync-config-tables.js**。

## 一、何时需要同步

面板/图鉴出现下列现象，说明仓库配置表落后于官方客户端：

| 现象 | 根因链 |
| --- | --- |
| 图鉴显示"果实1041435"等兜底字符 | `IllustratedItemCard.vue` 首字兜底 → `buildIllustratedItem` 的 `getItemById` 查不到 |
| 显示"物品xxxxx" | ID 不在 `ItemInfo.json` 的 `itemInfoMap` |
| 显示"植物xxxxxxx" | plant ID 不在 `Plant.json` 的 `plantMap` |
| 种子图/果实图空白 | `seedImageMap` 按 `{id}.png` 从 `seed_images_named/` 找图，缺文件 |

定位手段：从截图里的裸 ID 或兜底字符反查 → 确认是缺配置条目还是缺图片，或两者都缺。
官方数据来源：后台运行的 QQ 农场小程序源码目录 + CDN 配置表，**不需要抓包**。

## 二、官方配置表获取链

```text
源码目录 src/settings.*.json
  → assets.server + assets.bundleVers[bundle]
  → CDN config.<ver>.json
  → paths 里 config/ 开头的 asset（如 config/ItemInfo）
  → import/<uuid前2位>/<uuid>.<hash>.json
  → [5][0][2] 取行数组
```

`cdn-resource-finder.js` 已封装整条链（`bundleConfigUrl` / `parseConfigRows` /
`remoteBundleNames` / `tableNameFromAssetPath` / `findSettingsFile`）。

**已知坑（2026-10-19 修复）**：`remoteBundleNames` 曾把 `projectBundles` 也当远程包，
而 `projectBundles`（如 mcboot）是随包本地下发的，CDN 上没有对应 config，
`--list-tables` 会撞 mcboot 404。现在只认 `remoteBundles` 且要求
`bundleVers[bundle]` 有版本号，并排除 `resources/internal/main`。

定位官方源码目录（Windows/macOS）用技能包自带脚本，不要手写路径：

```bash
node .workbuddy/skills/qq-farm-bot-maintenance/scripts/find-client-source.js --caches
node core/scripts/sync-config-tables.js --source <目录>   # 显式指定来源
```

## 三、同步工具用法

```bash
node core/scripts/sync-config-tables.js                  # dry-run，只打印报告（默认）
node core/scripts/sync-config-tables.js --write          # 落盘（先写 .bak 备份）
node core/scripts/sync-config-tables.js --source <目录>  # 指定已解包的官方源码目录
node core/scripts/sync-config-tables.js --refresh        # 忽略 CDN 缓存重新拉取
```

dry-run 报告会列出每条计划插入的 ID 与锚点位置，**先人工核对锚点再 `--write`**。

## 四、合并安全策略（五条，违反会改变运行时行为）

1. **只新增本地缺失的条目，绝不改动存量条目的任何字段。**
   以官方表为基底整体替换会把活动作物等级从 1 改成 200，导致种植自动化拒绝种植活动作物
   （`getSeedLevel` / `land_level_need` 派生链被污染）。
2. **不新增 type=5（种子）与 type=6（果实）行。**
   种子让 `getSeedLevel` 从"返回 0 走兜底"变成"返回官方 level"，改变种植解锁判定；
   果实携带 level，会改变图鉴/仓库展示值。确需添加的（如只影响展示的黄金变体果实）
   必须人工评估后单独加，并在提交信息里说明理由。
3. **不新增 InvalidPlants.json 黑名单里的植物/种子**（已知异常白萝卜 2020002/29999）。
4. **不新增已被 EventPlants.json 覆盖的植物**（按植物 ID 或种子 ID 判断），
   避免 Plant.json 抢先匹配把 EventPlants 的 planting_priority 等信息屏蔽掉。
5. **落盘前多重校验**：既有条目逐字段不变（不变量）、新增条目不得撞本地 Plant.json
   种子 ID（派生守卫）、剔除新增条目后与原文逐字节一致（字节级保全）。

`gameConfig.js` 的消费方式是全部按 id 建 Map（`plantMap`/`seedToPlant`/`fruitToPlant`/
`itemInfoMap`/`seedItemMap`），**数组顺序对消费方无影响**——这是"可以定点插入而不重排"
的前提。

## 五、ItemInfo.json 真实文件形态（合并前必读）

不要假设它是规整的 id 升序数组。实测形态（2026-10-19，716 条目）：

- 647 条多行条目组成 id 升序主干；
- 69 条尾部紧凑单行块，混用两种分隔符风格（活动补丁产物）；
- 约 15 个"插错位置"条目：相邻逆序对中较大的一侧（历史补丁插入时未归位），
  **不是游离条目**——判断方法必须用相邻逆序（`ids[i] > ids[i+1]` 时标记 i），
  用全局 min 判断会把 691/716 全误判为游离；
- 8 条项目独有条目（20113/20265/20266/40113/40265/40266/1040207/1040265），
  合并时必须保留；
- 元素间隔：714×`",\n  "` + 1 处异常 `"\n  ,"`；
- 文件结构 = `[` + `\n  `(lead) + 元素… + `\n` + `]\n`，lead 极易被忽略。

**血泪教训**：第一次 `--write` 按 id 全量排序 + 2 空格重写，把 69 条紧凑条目展开、
15 处逆序归位，产生 22552 行 diff 灾难，只能从 `.bak` 恢复重做。
**正解是字节级定点插入**：保留原文件每一个字节，新条目以匹配邻居风格的独立块，
插到文件中"第一个 id 更大且不在逆序对里的元素"之前。
整体重排 + 重新缩进会制造上万行无意义 diff，与项目"不提交无意义 diff"约定相悖。

## 六、Plant.json 合并策略

本地 Plant.json 严格跟随官方表序（官方序断点仅 2 处），因此：

- 新条目按**官方表序**插到"最近的前序本地条目"之后，连续新增保持官方相对顺序；
- 从后往前 apply（按锚点位置倒序 splice），避免插入位移影响后续锚点；
- 整体按 2 空格缩进落盘（该文件本就是标准多行格式，重排无损）。

黄金变体安全性：均 `seed_id=0`、果实 id 独立，不污染 `seedToPlant`/`fruitToPlant`，
不影响种植自动化。

## 七、果实图标补齐

`seed_images_named/` 按 `{id}.png` 供 `seedImageMap` 消费。新图标取自官方
`model/v4 Crop_<n>_Seed` spriteFrame，可用 `inspect:cdn --path <Cocos路径>` 定位 URL。
与既有图标不一致时逐像素比对确认（2026-10-19 的 7 张与既有 41435.png 逐像素一致）。
图标文件名即契约，不得重命名。

## 八、验证清单（提交前）

1. `git diff --histogram` 查看数据 diff——默认 Myers 对结构雷同的插入会对齐失真
   （曾显示 10597 增 / 6873 删假象，实为 3725 增 / 0 删纯插入）。
   判断"旧序列是否为新序列子序列"可证明纯插入。
2. 三层校验由脚本内置（见第四节第 5 条），`--write` 自动执行并生成 `.bak`。
3. 运行时验证：`getItemById(<新ID>)` 与图标解析成功（可写临时脚本或测试）。
4. `node --test test/*.test.js`（core 基线 499 条）+ `pnpm -C web build`。
5. 提交信息注明：新增条目数、排除策略、diff 查看建议、验证结果。
6. 推送前跑 `check-deletions.sh`，推送后用 GitHub 连接器 `list_commits` 复核远端 HEAD。

## 九、git 通道完全不通时：Git Data API 复刻推送

`git push` 报 502/408 时先按 SKILL.md 第五节绕代理直连重试。
**若 git 通道彻底不通但 api.github.com 可达**（2026-10-19 实测：github.com 超时但
api 毫秒级），用 Git Data API 逐对象复刻本地提交：

```text
git credential fill 取缓存 token
→ GET refs/heads/main，校验父提交与本地一致
→ 逐 blob PUT（base64 content，逐个校验返回 sha 与本地 git hash-object 一致）
→ 用 base_tree 建 tree（校验与本地 tree sha 一致）
→ 建 commit（作者/提交者取本地 git log，message 原样带上）
→ PATCH refs/heads/main
→ 本地重建 commit 对象并 update-ref 对齐（见下）
```

两个坑：

1. **`execSync` 走 cmd.exe 会把 `HEAD^` 的 `^` 吃掉变成 `HEAD`**，误报"父提交不一致"。
   封装 `sh()` 必须显式 `shell: 'bash'`。
2. **API 建的 commit 本地不存在**，`update-ref` 报 nonexistent object。
   枚举消息尾部 × 时区变体（tail: `''`/`'\n'`/`'\n\n'` × tz: `+0000`/`+0800`），
   用 `git hash-object -t commit -w --literally` 试出与远端一致的 SHA，
   命中后写入并 `update-ref refs/heads/main` + `refs/remotes/origin/main` 一起对齐。
   2026-10-19 命中组合为 tz=+0800、tail=""。
   注意：远端会把作者邮箱规范化成 noreply、日期存储带时区，**本地 SHA 与远端
   必然不同，属正常**，以远端 HEAD 为验收标准。

工具脚本（未入库，按需重建）：`.workbuddy/api-push.mjs`（复刻提交）、
`.workbuddy/align-commit.mjs`（本地对象对齐）。

## 十、参考样本：2026-10-19 收录（b632eed）

- ItemInfo.json +123 条：type17×2（1041435 黄金·森野柿子、1042254 黄金·天山红枫）、
  type4×7、type11×29、type18×40、type23×9、type24×3、type28×2、type10×15 等；
- Plant.json +5 个黄金变体：1120516 狗尾草、1125995 芦苇、1121625 枸杞、
  1121072 寒兰、1126030 月下美人；
- seed_images_named/ +7 张：40525~40529、1041435、1042254；
- 排除策略示例：本次刻意排除了若干 type=5/6 行（种子/果实），黄金变体果实
  经人工评估"只影响展示、不涉及种子等级"后单独加入 Plant.json。

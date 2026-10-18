# 协议抓包、字段恢复与资源定位

来源：`docs/protocol-inspector.md`、`core/docs/wish-share-20260924-protocol.md`。
macOS 平台的对应方法已吸收进本文件，并补齐 Windows 路径。

## 一、抓包检查工具

`core/scripts/inspect-protocol-capture.js` 用于检查 QQ 农场 WebSocket 抓包，
支持浏览器导出的 HAR 文件和保存网关帧的 `.bin` 目录。

```bash
cd core
npm run inspect:protocol -- /完整路径/capture.har --pretty
npm run inspect:protocol -- /完整路径/frames --method Operate --audit --pretty
```

常用选项：

| 选项 | 作用 |
| --- | --- |
| `--service` `--method` `--direction` | 过滤消息 |
| `--shape` | 只观察 protobuf 字段编号、wire type、出现次数和字节长度 |
| `--audit` | 检查未知字段、wire type、通知类型和 RPC 类型；有问题时返回非零状态 |
| `--decrypt-requests` | 用仓库内 TSDK WASM 解密请求 body（默认不解密，也不会把加密内容误当 protobuf） |
| `--show-sensitive` | 显示已知敏感字段（默认脱敏） |

默认输出 JSON Lines：消息写标准输出，汇总和问题写标准错误；`--pretty` 输出单个格式化 JSON 对象。

**抓包仍可能在未知 protobuf 数字字段中包含 GID 等数据。分享或提交输出前必须人工复核；不要对
不可信抓包使用 `--show-sensitive`。**

### 常见运行状态

HAR 的服务端响应是可解的 protobuf，但请求体经客户端 TSDK 传输变换，**不可直接按 protobuf 解码**。
此时请求体证据应标记为 `encrypted-undecoded-capture`（`decoded: false`），
下列请求 hex 若被重构出来，其性质是 **official-encoder-reconstruction**，不是原始抓包明文。
**不要把"官方编码器重构"或"加密抓包"误报成 protobuf 明文抓包。**

## 二、CDN 配置表与图片调查工具

`core/scripts/find-cdn-resource.js` 适用于：

- 活动接口、背包、任务、商店或奖励中出现未知物品 ID、名称或图标。
- 需要核对官方配置表 `Plant`、`ItemInfo`、`MutantEffect`、`Goods`、`Task`、`TechTreeLine`。
- 已知 `icon`、`icon_res`、`asset_name` 或 Cocos 资源路径，要定位 bundle、UUID 和真实 CDN 图片 URL。
- 怀疑仓库内的物品/植物/效果配置落后于最新官方客户端。
  确认落后用 `core/scripts/sync-config-tables.js` 增量同步（只新增不改存量），
  完整策略与文件形态坑见 `references/07-config-table-sync.md`。

```bash
cd core
npm run inspect:cdn -- --list-tables
npm run inspect:cdn -- --table ItemInfo --id <物品ID>
npm run inspect:cdn -- --name <名称>            # 精确匹配优先
npm run inspect:cdn -- --path <Cocos资源路径>
npm run inspect:cdn -- --source <已解包目录>    # 显式指定来源
```

工具默认复用 `activity-update-scanner` 的规则，按 `tsdk/tsdk.wasm` 修改时间选择最新且完整的
QQ 农场源码目录。默认只查询并输出结构化结果和 CDN URL，**只有用户明确要求保存素材时才用
`--download <文件>`**。远程配置缓存写入系统临时目录，不得写回或修改 QQ 官方缓存。

### 该工具不能替代什么

- 植物阶段图、ASTC、Spine、图集纹理和裁切恢复 → 用 `npm run extract:plant-phases`。
- 活动协议、字段号、命令字和动作语义 → 仍需官方生成代码、HAR/WS、proto、Prefab 和服务端响应
  交叉确认；**不能仅凭配置表或图片名称推断协议行为**。
- **CDN 查询结果不能直接成为运行时远程依赖。** 需要在页面或核心逻辑使用的名称、ID、图片和植物
  数据必须进入统一配置、补充配置或项目静态资源，并补对应测试。
- 活动静态素材统一放 `web/public/activity/<活动 slug>/`。素材若由协议下发路径动态解析
  （后端存在 Cocos 资源路径到本地文件名的映射表），**本地文件名即契约，不得重命名或按体积裁剪**，
  否则运行时出现空图。仅前端硬编码引用的素材才可自由重命名。
- 素材映射表应记录每个文件的来源 URL 与 sha256，入库后校验文件存在且摘要匹配；素材随仓库提交，
  **不在构建期或运行期联网拉取**。

## 三、活动 Operate 协议静态恢复

遇到 `ActivityService.Operate` 字段不明、动态抓包没命中、账号已无可操作次数，或仓库 proto 与
客户端行为不一致时，用下面的流程从官方客户端静态恢复协议。

本流程已内置在本技能中，并补齐了 Windows 路径与本项目约定。
**仓库里的 `.agents/skills/qq-farm-activity-protocol-recovery` 已删除，实际执行以本文件为准。**

**不得猜测字段号。官方 QQ 容器目录只读；真实账号请求仍须用户在当前任务中明确授权。**

### 3.0 前置：先定位源码

```bash
node .workbuddy/skills/qq-farm-bot-maintenance/scripts/find-client-source.js --caches
```

记录 `selected.directory` 与 `tsdk.wasm` 的 mtime/size。平台路径与"选最新版"规则见
`references/06-client-source-locations.md`。**没有这一步，后面全是猜。**

### 3.1 完整流程（10 步）

1. 定位源码目录并记录 `tsdk/tsdk.wasm` 的修改时间；若用户直接给了目录，用
   `--source <目录>` 校验是否完整（`game.js` + `game.json` + `tsdk/tsdk.wasm` + `assets/`）。
2. **QQ 容器目录只读**：需要处理的文件先复制到系统临时目录，绝不在官方源码或运行资源缓存里
   生成文件。
3. 读选中的 `game.js`，定位主包、字节码/解释器加载器，以及生成的
   `chunks:///_virtual/activitypb.ts` 模块。在隔离的 Node `vm` 里注册所需的 `define` 工厂，
   只求值生成协议模块那部分 `System.register`，**不要启动 QQ 游戏、不要执行无关业务模块**。
4. 读取官方导出的 `OperateType`、`OperateRequest`、`OperateReply` 及动作相关 request/reply。
   `core/src/proto/activitypb.proto` 只作为比对目标，**不是未知字段的事实来源**。
5. 对每个候选属性，用官方消息类型的 `create` / `encode` 传一个**非默认 sentinel**，
   把第一个 protobuf tag 解成字段号与 wire type；嵌套消息逐个独立探测。
   当默认省略、枚举零值、packed 字段或标量类型有歧义时，换第二个 sentinel 再验一次。
6. 用官方编码器拼一个完整请求（确认后的活动 ID + 命令 + 一个已知节点/商品/物品参数），
   记录语义对象、组件 hex、完整请求 hex。**标注为「官方编码器重构」，不得称为抓包。**
7. 与可用 HAR/WS、`GetGroup`/`List` 回复、生成客户端代码、Prefab/配置数据交叉核对。
   加密流量记 `encrypted: true, decoded: false`；**密文不得当 protobuf 解析**。
8. 按下面 §3.3 的格式产出报告，证据按 §3.2 分级标注。
9. 需要落地实现时，更新本地 proto 与可复用 service 模型，**不要拼接一次性字节**；
   补固定 hex 回归测试（外层活动 ID + 命令 + 动作字段 + 全部嵌套参数），
   先跑定向测试再跑 `core` 全量。
10. **仅在用户当前任务明确授权后**，才发一条最小真实账号请求（动作仍可用时）。
    记录脱敏语义参数、请求 hex、响应码、前后刷新状态。成功判据是"服务端成功响应
    **且** 状态有可见推进"，二者缺一不算成功。

### 3.2 证据分级（写报告必须标注）

| 标签 | 含义 |
| --- | --- |
| `official-generated-code` | 官方生成代码直接读出的字段名/枚举 |
| `official-encoder-probe` | 用官方 `create`/`encode` + sentinel 探测出的字段号/wire type |
| `official-encoder-reconstruction` | 官方编码器拼出的请求 hex（**不是抓包明文**） |
| `historical-plaintext-capture` | 历史明文抓包（可解码） |
| `encrypted-undecoded-capture` | 加密抓包，未解码（`decoded: false`） |
| `inferred` | 推断，未证实——**不可直接写进代码** |

**严禁**把 `official-encoder-reconstruction` 或 `encrypted-undecoded-capture` 报成
"protobuf 明文抓包"。

### 3.3 报告格式

```markdown
## 结论
<动作 → OperateType / cmd / 请求字段 / 回复字段 的表格>

## 证据
| 字段 | 值 | 证据类型 | 来源（文件 + 行/模块） |

## 请求重构
- 语义对象：<...>
- 组件 hex：<...>
- 完整请求 hex：<...>
- 性质：official-encoder-reconstruction

## 交叉验证
- HAR/WS：<命中/未命中，原因>
- 服务端回复字段：<...>
- 配置表/Prefab：<...>

## 未覆盖与风险
- <未知字段、未观测到的枚举、需要真实账号验证的点>
```

### 3.4 停止条件（满足任一就停，报告缺证据，不要猜）

- 没有任何候选目录同时包含 `game.js`、`game.json`、`tsdk/tsdk.wasm`、`assets/`；
- 无法在不执行 QQ 业务代码的前提下隔离出生成协议模块；
- 候选字段无法用官方编码区分；
- 只有加密动态流量，且静态恢复尚未建立 schema；
- 需要真实账号验证但用户未在当前任务明确授权。

### 3.5 落地要求（本项目约定）

- 发现要落成可维护产物：`.proto` 定义、归一化 service 解析、脱敏检查输出、固定 hex 测试。
  **不要让 CDN 内容成为运行时依赖。**
- WASM 的发现/快照/比较/回退走 `references/02-tsdk-update.md`。
- 素材与文件名契约、sha256 校验见本节第二节（CDN 工具）的红线。


## 四、参考样本：秋祈良愿 / 快乐不独享（2026-09-24）

一个已完成静态恢复的完整样本，可作为后续活动的格式参照。

### 活动与时间

| 活动 | 组 ID | 子活动 ID | 客户端 uid | 官方时间窗（UTC+8） | 活动体 |
| --- | --- | ---: | ---: | --- | --- |
| 秋祈良愿 | 2026092400 | 2026092401 | `WishSignMainUI` | 09-24 00:00:00 至 10-07 23:59:59 | `ActivityData.wish_sign = 119` |
| 快乐不独享 | 2026092500 | 2026092501 | `HappySharePanel` | 09-24 00:00:00 至 10-12 23:59:59 | `ActivityData.share_reward = 120` |

### 操作与编码

字段号与 wire type 通过官方生成消息的 `create`/`encode` 非默认 sentinel 探测，
并由回复标签交叉验证（`official-generated-code`、`official-encoder-probe`、
`historical-plaintext-capture`）。

| 操作 | 官方 `OperateType` | `cmd` | 请求字段与子字段 | 回复字段 |
| --- | --- | ---: | --- | --- |
| 祈愿（选择感情） | `WISH_SIGN_DRAW` | 51 | `wish_sign_draw=151`，`choose_id=1`，值 2 | `wish_sign_draw=151` |
| 领取祈愿奖励 | `WISH_SIGN_CLAIM` | 52 | `wish_sign_claim=152`，`choose_id=1`，值 2 | `wish_sign_claim=152` |
| 每日领取 | `SHARE_REWARD_CLAIM_DAILY` | 73 | 仅活动 ID、命令（请求体长度 8） | `share_reward_claim_daily=157` |
| 分享快乐包 | `SHARE_REWARD_SHARE` | 69 | 仅活动 ID、命令（请求体长度 8） | `share_reward_share=153` |
| 领取全部可领奖档 | `SHARE_REWARD_CLAIM_MILESTONES` | 70 | 仅活动 ID、命令（请求体长度 8） | `share_reward_claim_milestones=154` |

关键结构：

- `WishSignDrawRsp` = `text_id=1, day_id=2, rewards=3`
- `WishSignClaimRsp.awards = 1`
- 选择后的 `WishSignPending` = `choose_id=1, text_id=2, day_id=3, rewards=4`
- 状态体 = `remaining_count=1, activity_day=2, pending=3`
- `ShareRewardSummary` = `score_item_id=1, current_score=2, daily=3, my_pool=4, milestones=5,
  daily_reward=6, first_share_reward=7, red_dots=8`
- `daily` = `claimed_count=1, first_share_awarded=2, daily_reward_claimed=3, claim_limit=4`
- 档位 = `tier_id=1, threshold=2, rewards=3, state=4`

档位 `state` 观测到 1 → 2 → 3（未达成 / 可领取 / 已领取），**不代表其他状态枚举已全部观测**。

敏感与边界：分享返回的 `ShareRewardArk` 含 `share_key`、`share_open_id` 等敏感信息，
**不能写日志或在活动状态接口下发**，本地只归一化本次增加的快乐值。
HAR 中有 `ShareService.CheckCanShare`、`ReportShare`，但**不能把 `ReportShare` 当作真正完成了
用户分享**。好友点击快乐包及 `SHARE_REWARD_RESOLVE=72` 不在该次抓包范围内。

### 烟花与物品

放烟花**不是** `ActivityService.Operate`：HAR 里是两次 `ItemService.Use`，响应 `used_items`
为 `{id:6001, count:1, uid:958}`。物品 `6001` 在官方 `ItemInfo` 中为「烟花·玉兔望月」，
使用时必须携带背包 UID（仓库现有 `useItem` 会从背包查 UID）。
**缺少独立的点燃烟花协议/位置参数，不实现自动点燃。**

官方 `ActivityWishSignChoose` 列出 1—6：财运、感情、前程、生活、农耕、人际。
奖励表 14 天含种子 26030（月下美人）和 20435（山丹丹）；官方 `Plant` 表的 `size` 都为空
（按单格处理），果实 ID 分别为 46030、40435。
活动只读页的每日奖励池来自客户端 `delayRes/ActivityWishSignReward` 的 14 条静态表，
存于 `core/src/gameConfig/WishSignRewards.json`；"明日奖励"按服务端 `activity_day + 1` 取表中
对应项，**超过第 14 日不展示**。

### 验证与未覆盖

`test/wish-share-activity.test.js` 固化五条官方编码重构，固定明文响应状态，测开始/结束边界。
HAR 中的动作成功**不构成**对项目新增操作的真实账号验证。

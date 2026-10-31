# 雨落成诗（天气瓶）活动协议与实现

活动 UID 是 `WeatherBottleUI`，一次性拉全活动状态，然后在同一套 `activity_id` 下分
商店 / 整蛊 / 收集 / 研究 / 任务五块。实现集中在 `core/src/services/activity.js`
的 `RAIN_POEM_*` 段，整蛊玩法单独拆到 `core/src/services/rain-poem-prank-service.js`。

## 一、常量

```js
// core/src/services/activity.js
RAIN_POEM_ACTIVITY_UID      = 'WeatherBottleUI';
RAIN_POEM_ACTIVITY_ID       = 2026070300;  // 主活动（天气瓶）
RAIN_POEM_SHOP_ACTIVITY_ID  = 2026070301;  // 兑换商店
RAIN_POEM_PRANK_ACTIVITY_ID = 2026070302;  // 整蛊
RAIN_POEM_COLLECTION_ACTIVITY_ID = 2026070303; // 收集
RAIN_POEM_RESEARCH_ACTIVITY_ID   = 2026070304; // 研究
RAIN_POEM_TASK_ACTIVITY_ID       = 2026070305; // 任务
RAIN_POEM_COLLECTION_CMD    = 9;   // 收集请求的 cmd
RAIN_POEM_RESEARCH_UNLOCK_CMD = 40; // 研究解锁的 cmd
RAIN_POEM_BOTTLE_ITEM_ID    = 5001; // 天气瓶
RAIN_POEM_SUMMON_ITEM_ID    = 5002; // 召唤瓶
RAIN_POEM_FROG_PRANK_ITEM_ID = 5005; // 青蛙瓶（整蛊）
```

整蛊服务里还有：

```js
// core/src/services/rain-poem-prank-service.js
RAIN_POEM_FROG_BOTTLE_ITEM_ID  = 5005;
RAIN_POEM_CLOUD_BOTTLE_ITEM_ID = 5006;
RAIN_POEM_PRANK_SOCIAL_TYPES = new Map([[5005, 3], [5006, 4]]);
// social_type 3 = 青蛙整蛊，4 = 乌云整蛊
```

## 二、接口

| 动作 | 函数 | 说明 |
| --- | --- | --- |
| 拉活动状态 | `getRainPoemActivity()` | 一次 `GetActivityInfo`，返回归一化后的各块数据 |
| 买天气瓶 | `buyRainPoemCollectionBottle()` | 收集商店换瓶（走 `SHOP_ACTIVITY_ID`） |
| 收集天气 | `collectRainPoemWeather()` | `cmd = 9`，按当天天气给瓶/碎片 |
| 使用召唤瓶 | `useRainPoemSummonBottle()` | 请求体由 `encodeRainPoemSummonUseRequest(gid, itemUid)` 生成 |
| 解锁研究 | `unlockRainPoemResearch()` | `cmd = 40`，按研究树顺序解锁 |
| 整蛊好友 | `rain-poem-prank-service.js` | 进入好友农场 → 算 `social_type` → 用瓶 → 离开 |

归一化函数：`normalizeRainPoemActivity(reply, nowSeconds)`、`normalizeRainPoemItem(item, fallbackId)`。
每日召唤用量落在 `getRainPoemSummonUsageFile()` 指向的数据文件里
（`getRainPoemSummonUsedToday()` / `incrementRainPoemSummonUsedToday()`），
`mergeRainPoemTaskUsage(activity, summonUsedToday)` 把它并回任务进度，避免任务面板数字对不上。

## 三、自动化开关

五个开关都在 `core/src/models/store.js` 的账号配置里，默认全关：

```js
rain_poem_bottle_buy: false,        // 自动买天气瓶
rain_poem_weather_collect: false,   // 自动收集天气
rain_poem_summon_use: false,        // 自动用召唤瓶
rain_poem_prank_use: false,         // 自动整蛊好友
rain_poem_research_unlock: false,   // 自动解锁研究
```

`RAIN_POEM_AUTOMATION_KEYS` 把这五个键归成一组，用于定时活动窗口判断
（活动未开窗时自动回落到 `false`，见「[网络并发模型](network-concurrency.md)」里的定时分组说明）。

## 四、整蛊注意事项

- 必须**先 `enterFriendFarm` 再发瓶**，否则服务端按「不在对方农场」拒绝；
- 失败要走 `handleFriendEnterError`，把进不去的 gid 记录掉，别在同一轮反复重试；
- 好友黑名单（`getFriendBlacklist()`）里的人不整蛊；
- 整蛊有每日次数上限，用 `randomDelay()` 拉开节奏，别连发。

## 五、特效资源

雨落成诗的天气特效是 ASTC 压缩贴图，官方缓存里是 `.astc`，抽出来要转 PNG：

```bash
node core/scripts/extract-rain-poem-effects.js
```

- 依赖 `core/data/tools/astcenc-5.5.0/bin/astcenc`（第一次跑要自己放好，脚本会提示）
- 输出目录 `web/public/game-config/effect_images/rain-poem`
- 脚本里的缓存根默认是 macOS 容器路径，Windows 上跑要改成
  `%APPDATA%\QQEX\miniapp\fs\<QQ号>\1112386029\usr\gamecaches`

## 六、排查

| 现象 | 检查点 |
| --- | --- |
| 活动面板全是 0 | `getRainPoemActivity()` 返回的 `activity_id` 是否为 `2026070300`，活动是否已开窗 |
| 收集没反应 | `cmd = 9` 是否带上当天 `activity_id`；当天是否已收集过 |
| 研究解锁报错 | 是否跳级解锁（必须按研究树顺序），`cmd = 40` 的 `research_id` 对不对 |
| 整蛊失败 | 是否先进了对方农场；`social_type` 是否与瓶子 itemId 匹配（5005→3、5006→4） |
| 特效图不显示 | 有没有跑 `extract-rain-poem-effects.js`；`web/public/game-config/effect_images/rain-poem` 是否有文件 |

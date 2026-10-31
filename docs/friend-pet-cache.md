# 好友宠物缓存与每日同步

好友链路有三类「缓存」：**已知 GID**（决定能拉谁）、**好友列表缓存**（减少请求）、
**宠物信息缓存**（狗/猫的状态）。三者的失效策略不一样，混用会导致「好友列表空」
或「宠物操作被服务端拒绝」。

## 一、已知 GID（known friend gids）

文件：`core/data/known_friend_gids*.json`（按账号分文件），读写走
`getKnownFriendGids()` / `setKnownFriendGids()`。

初次登录后 `bootstrapQqFriendGids()` 会从四个来源尝试补齐：

1. 旧接口 `SyncAll`（`open_ids = []`）/ `GetAll`
2. 好友申请 `getApplications()`
3. 访客记录 `getInteractRecords()`
4. 最后用 `GetGameFriends` 按已知 GID 分批校验（`QQ_FRIEND_LIST_BATCH_SIZE = 35`）

> 已知限制：`GetGameFriends` 必须带已知 gid 才返回数据，服务端只认「已经同步过的关系」。
> 所以第一次用某个 QQ 号时好友列表可能不全，需要靠访客/申请记录慢慢滚起来，
> 或者用抓包导入补齐（见 `core/src/capture/`）。这是协议能力边界，不是 bug。

`syncKnownFriendGidsFromFriends(friends)` 在每次拉到好友列表后回写并集；
`getEffectiveKnownQqFriendGids()` 返回当前可用于批量请求的集合；
`removeKnownFriendGid(gid)` 用于「对方删了我 / gid 失效」时剔除。

## 二、好友列表缓存

文件：`core/data/friend_list_cache*.json`，函数：
`readFriendListCache()` / `writeFriendListCache()` / `getFriendListCacheFile()` / `removeFriendFromCache()`。

- 正常情况直接用缓存渲染面板，`getAllFriends(forceRefresh = false)` 才按需刷新；
- **空结果或失败**的发现最多每 5 分钟重试一次（`friend-api.js` 里的注释与节流逻辑），
  避免「服务端抽风返回空」把面板刷成 0 好友并疯狂重试；
- 删除好友后要 `removeFriendFromCache(gid)`，否则面板还会显示幽灵好友。

## 三、宠物信息缓存

文件：`core/data/friend_dog_info*.json`，函数：
`readFriendDogInfoCache()` / `writeFriendDogInfoCache()` / `updateFriendDogInfoCache()`。

缓存里存的是「好友农场里的狗/宠物状态」（是否在岗、技能、可偷/可摸信息）。
刷新节奏由 `friend-dog-sync-pacing.js` 的 `classifyGatewayDefer()` 决定：
网关不健康时把这次同步判为「延后」，不写缓存也不推进游标，避免用过期数据做判断。

## 四、节奏与限流

```js
// core/src/services/friend-visit-pacing.js
DEFAULT_MAX_VISITS_PER_RUN = 12;              // 每轮最多访问 12 个好友
DEFAULT_COOLDOWN_MS      = 10 * 60 * 1000;    // 同一个好友 10 分钟内不重复访问
```

`selectFriendVisitBatch()` 按游标 + 冷却挑下一批，`resetFriendVisitPacing()` 清状态（换账号时用）。

操作次数上限在 `core/src/services/friend-operation-limits.js`：

- `PUT_BUG_OPERATION_ID` / `PUT_WEED_OPERATION_ID` / `GOLDEN_BUG_OPERATION_ID` 分别对应放虫、放草、金虫；
- `BAD_SHARED_LIMIT_ID = 1001`、`PUT_BUG_LIMIT_ID = 1002`、`BAD_DAILY_LIMIT = 50`；
- `canOperate()` / `canOperateBad()` / `getRemainingTimes()` 判断还能不能放；
- `autoDisableHelpByExpLimit()`：经验到上限后自动关掉「帮忙」开关，避免白跑；
- `checkDailyReset()` 每天 0 点重置计数。

## 五、免打扰与黑名单

- `inFriendQuietHours(now)`：读账号配置里的免打扰时段（`getFriendQuietHours()`），
  命中时不访问好友、不发整蛊；
- `getFriendBlacklist()` / `setFriendBlacklist()` / `addFriendToBlacklist()`：
  黑名单里的人不访问、不偷、不整蛊，也不进好友列表展示。

## 六、每日同步顺序

登录后 `runStartupSequence()` 会先跑每日例行，再挂好友主循环。好友相关的顺序：

1. `getAllFriends()`（必要时 `bootstrapQqFriendGids()`）
2. 访客同步（`syncKnownFriendGidsFromRecentVisitorsOnce`）
3. 好友农场巡查（`selectFriendVisitBatch` 挑 12 个）
4. 宠物状态同步（受 `classifyGatewayDefer` 控制）
5. 帮好友放虫/放草/浇水（受每日上限与经验上限控制）

整条链路受「[网络并发模型](network-concurrency.md)」的分班次闸门与自动任务互斥保护：
好友相关请求走 `friend` / `background` 班次，不会把心跳挤掉。

## 七、排查

| 现象 | 检查 |
| --- | --- |
| 好友列表一直空 | `core/data/known_friend_gids*.json` 是否有内容；`bootstrapQqFriendGids()` 日志里四个来源各返回多少 |
| 面板好友数比 QQ 少很多 | 正常（见第一节限制），用抓包导入补 |
| 好友访问重复/太频繁 | `friend_list_cache` 与 pacing 的 `recentVisits` 是否被清空 |
| 宠物状态不动 | `classifyGatewayDefer()` 是否一直判延后；网关健康度是否正常 |
| 放虫放草提示次数用完 | 看 `getRemainingTimes()` 与 `BAD_DAILY_LIMIT = 50` |

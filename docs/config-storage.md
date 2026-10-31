# 配置存储、迁移与缓存

这个项目有两套「配置」：**可写的数据**（用户、卡密、自动化开关、插件注册表……）和
**只读的游戏配置表**（植物、物品、等级……，都在 `core/src/gameConfig/`）。两者的存储位置、
迁移方式完全不同，改代码前先分清。

## 一、数据目录在哪

由 `core/src/config/runtime-paths.js` 决定：

```
getDataDir():
  1. 有环境变量 FARM_DATA_DIR → 用它（相对路径会被解析成绝对路径）
  2. pkg 打包成 exe  → exe 所在目录 /data
  3. 源码运行        → 仓库根目录 /data
```

`start.sh` 部署模式下会显式传 `FARM_DATA_DIR=core/data`，Docker 模式下映射到容器内 `./data`，
所以生产环境常见的是 `core/data/`，本地 `node client.js` 直接跑默认是仓库根 `data/`。

`ensureDataDir()` 会在启动早期创建目录；`getDataFile(name)` / `getDataDir()`
是所有模块拿数据路径的唯一入口，**不要在业务代码里硬编码 `../../data`**。

## 二、数据目录里有什么

| 文件 / 目录 | 内容 |
| --- | --- |
| `store.json` | 全局配置：自动化开关、账号级配置、间隔、静默时段、公告内容等 |
| `accounts.json` | 已添加的农场账号与登录态元信息 |
| `users.json` | 面板用户（含卡密用户的到期时间、账号额度、角色） |
| `cards.json` | 卡密库 |
| `card-claim.json` / `card-redemptions.json` | 卡密领取与核销记录 |
| `login-attempts.json` | 登录失败计数（限流用） |
| `login-logs.json` | 登录日志 |
| `known_friend_gids*` | 已知好友 GID（按账号） |
| `friend_list_cache*` | 好友列表缓存（避免每次访问都拉全量） |
| `friend_dog_info*` | 好友护院狗信息缓存 |
| `plugins/` | 插件注册表 `registry.json` 与 `installed/<id>/<version>/` 安装目录 |
| `logs/` | 运行日志（按小时分文件，保留 3 天） |

写入统一走 `core/src/services/json-db.js`（先写临时文件再原子替换），
避免进程被杀时留下半截 JSON。断电/异常退出后如果发现某个 JSON 损坏，
优先从备份恢复，不要手工「补半个括号」。

## 三、迁移与升级

- **升级代码不迁移数据**：表结构新增字段都带默认值，老数据读进来缺什么补什么，
  所以直接拉新代码重启即可，不需要跑迁移脚本。
- **换机器**：整个数据目录拷过去就行（`core/data` 或 `data`），注意 `.env` 里有管理员密码，一起拷。
- **从 Docker 切到 Node 模式**：把容器里的 `data/` 拷到仓库 `core/data/`，
  再确认 `FARM_DATA_DIR` 指向同一目录，否则会出现「账号都不见了」。
- **卡密与用户**：`users.json` 与 `cards.json` 必须成对迁移，只拷一个是核销不了的。

## 四、游戏配置表（只读）

都在 `core/src/gameConfig/`：

| 文件 / 目录 | 用途 |
| --- | --- |
| `Plant.json` | 植物主表（id、seed_id、name、grow_phases、季节……） |
| `ItemInfo.json` | 物品表（名称、图片、出售条件 `sell_cond`/`cond_sells`、分类等） |
| `EventPlants.json` | 活动植物增量（启动时与 `Plant.json` 合并） |
| `InvalidPlants.json` | 已知异常植物/种子黑名单（白萝卜 2020002 / 29999） |
| `RoleLevel.json` | 等级经验表（1–200 级） |
| `MutantEffect.json` | 变异效果表 |
| `SolarTerms.json` / `WishSignRewards.json` / `GrowthPlantingTasks.json` / `MallImageSupplement.json` | 节气、许愿签、成长任务、商城图片补充 |
| `seed_images_named/` | 种子图（`{seedId}_名称.png`、`Crop_X_Seed.png`） |
| `plant_images/` | 植物阶段图 + `manifest.json` |
| `effect_images/` | 活动特效图（雨落成诗等） |

插件（`core/plugins/*`）也可以提供素材：manifest 里 `gameConfig.provides = true` 时，
启动会把它的 `catalog/EventPlants.json`、`assets/seed_images_named/`、
`assets/plant_images/manifest.json` 合并进来（宿主优先、插件只补缺）。

## 五、同步官方配置表

`core/scripts/sync-config-tables.js` 从官方 CDN 增量同步 `Plant.json` / `ItemInfo.json`，
合并策略是硬约束，改脚本时不要破坏：

1. **只新增本地缺失的条目，绝不改动存量条目**——整体替换会改变既有条目的
   `level`/`name`/`sells`，把活动作物等级从 1 改成 200，导致自动化拒绝种植活动作物。
2. **不新增 `type=5`（种子）与 `type=6`（果实）行**——种子会让 `getSeedLevel` 从
   「返回 0 走 `land_level_need` 兜底」变成返回官方等级，改变解锁判定。
3. **不新增 `InvalidPlants.json` 黑名单里的植物/种子**。

同步完一定跑一遍 `core/scripts/audit-game-resources.js` 看覆盖率有没有回退，
再跑 `node --test test/*.test.js`（有测试会校验配置合并结果）。

## 六、缓存

- 好友列表、护院狗信息、已知 GID 都有本地缓存，命中时可以少打一路请求；
  清缓存的办法是删对应文件，程序下次会重新拉。
- 活动素材（CDN 图片）由 `core/src/services/activity-cdn-resolver.js` 按需解析，
  不在库里存副本。
- 前端构建产物 `web/dist` 不是缓存，是发布物；重新构建前先把旧目录挪走再构建。

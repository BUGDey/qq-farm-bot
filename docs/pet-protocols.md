# 个人页宠物协议

「宠物」在农场里有三层：**狗（看家/护院）**、**宠物图鉴（90001…）**、**宠物日记活动**。
三层各有自己的接口，混着调会被服务端拒（尤其换狗、喂食、领礼包）。

## 一、狗的 id 与食物

```js
// core/src/services/pets.js
const PET_IDS = [90001, 90002, 90003, 90011, 90021, 90031];
const BICHON_DOG_ID = 90031;                       // 比熊
const FOOD_DURATIONS = new Map([
  [90004, 86400],    // 1 天狗粮
  [90005, 259200],   // 3 天
  [90006, 432000],   // 5 天
]);
const MAX_PROTECT_SECONDS = 30 * 86400;            // 护院时长上限 30 天
```

食物是「按秒加时长」的，喂之前算一下当前剩余保护时间，超过 30 天就别喂了（服务端会拒）。

## 二、狗的操作

全部命令通过 `commandTail` 串行化（`serialize(operation)`）——**同一账号的宠物命令必须排队**，
并发发会出现「已派出/未派出」状态错乱。

| 操作 | 说明 |
| --- | --- |
| 查看 | `getPetOverview()`（`pets.js`）聚合狗状态、图鉴、可领礼包 |
| 领技能礼包 | `claimSkillGifts()`（`dog-skill-gifts.js`），物品 id `DOG_SKILL_GIFT_ITEM_ID = 101351` |
| 待领数量 | `getPendingGiftCount()` |
| 狗详情 | `getDogInfo()`（被 `pets.js` 与面板复用） |
| 喂食 | 用 `FOOD_DURATIONS` 里 90004/90005/90006 三种狗粮 |
| 派出去 / 收回 | 受 `MAX_PROTECT_SECONDS` 限制 |

前端面板：`web/src/views/Pet.vue`（约 27KB，狗的状态、喂食、技能礼包、图鉴入口都在这）。

## 三、宠物日记（活动）

`core/src/services/activity-pet-diary.js` 导出 `createPetDiaryService()`，
返回的对象里包含日记页所需的「今日状态 / 可领取 / 战斗」等操作；
战斗自动化在 `core/src/services/pet-diary-battle-automation.js`（该文件没有集中
`module.exports = {...}` 块，导出以文件末尾的逐个赋值为准，改之前先搜 `module.exports.`）。

活动开关在账号配置里（`pet_diary_*` 一组），活动未开窗时自动回落为 false。

## 四、后台接口

| 路由 | 用途 |
| --- | --- |
| `core/src/controllers/admin-pet-routes.js` | 宠物总览、喂食、派狗/收狗、领技能礼包 |
| `core/src/controllers/admin-pet-shop-routes.js` | 宠物商店（买狗粮/道具） |

后台写操作走 `MANUAL_WRITE_METHODS`（`claimDogSkillGifts`、`feedDog`、`activateDog`、
`deployDog`、`withdrawDog`），会被自动任务互斥锁串行化，避免和定时喂食撞车。

## 五、缓存

狗的状态缓存与好友侧共用 `friend_dog_info*.json`：

- 自己的狗：`getDogInfo()` 实时拉，面板会缓存到账号状态里；
- 好友的狗：`readFriendDogInfoCache()` / `updateFriendDogInfoCache()`，由
  `classifyGatewayDefer()` 决定这轮要不要刷新（网关不健康就延后）。

详见「[好友宠物缓存与每日同步](friend-pet-cache.md)」。

## 六、排查

| 现象 | 检查 |
| --- | --- |
| 喂食没效果 | 狗粮 id 是否为 90004/90005/90006；剩余护院时间是否已到 30 天上限 |
| 技能礼包领不到 | `getPendingGiftCount()` 是否为 0；礼包 id `101351` 是否在背包里已满 |
| 派狗报错 | 是否先 `getDogInfo()` 确认狗在家；并发调用是否绕过 `commandTail` |
| 宠物日记按钮全灰 | 活动是否开窗；账号配置里对应 `pet_diary_*` 开关是否关闭 |
| 面板显示旧状态 | 好友狗的缓存是否被 `classifyGatewayDefer()` 一直延后 |

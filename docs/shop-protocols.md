# 神秘商人、游戏商城与购买协议

三块内容，三个服务文件：`core/src/services/mall.js`（商城 / 化肥 / 免费福利）、
`core/src/services/mall-gift-auto-buy.js`（券礼包）、`core/src/services/mystery-shop.js`
（神秘商人），购买历史落在 `core/src/services/mystery-shop-history.js`。

## 一、货币

```js
// core/src/services/mystery-shop.js
const CURRENCY_NAMES = {
  1001: '金币',
  1002: '点券',
  1005: '金豆豆',
};
```

价格是 `{ currencyId, price }` 结构，`parseMallPriceValue(raw)` / `parseMallPriceInfo(raw)`
负责把它从 protobuf 的「一串变长字段」解出来（field 1 = currencyId，field 2 = price），
`isCurrencyAllowed(currencyId)` 判断当前账号能不能用这种货币买。

## 二、商城（mall.js）

| 函数 | 用途 |
| --- | --- |
| `getMallGoodsList()` / `getAllMallGoods()` | 拉商品列表（含分页），返回归一化商品 |
| `parseMallRewardItem` / `parseMallItemIds` | 解析商品内容物 |
| `parseMallPriceInfo` / `parseMallPriceValue` | 解析价格（货币 + 数值） |
| `parseMallLimitInfo` | 解析限购（`limit_type` + 已购数量） |
| `purchaseMallGoods(goodsId, count, ...)` | 下单 |
| `buyFreeGifts()` | 领每日免费福利 |
| `getFertilizerBuyDailyState()` / `getFreeGiftDailyState()` | 当日已买/已领状态（含「点券不足今天不再尝试」） |
| `autoBuyFertilizer` / `autoBuyOrganicFertilizer` / `checkAndBuyFertilizerByThreshold` / `checkAndBuyFertilizerBoth` | 化肥自动购买 |

固定商品 id：

```js
const ORGANIC_FERTILIZER_MALL_GOODS_ID = 1002; // 有机化肥
// 每日福利 goodsId=1001，抓包显示位于 slot_type=1
```

## 三、神秘商人（mystery-shop.js）

服务名 `gamepb.mysteryshoppb.MysteryShopService`，三个接口：

- `GetActiveMysteryNPC` → `getActiveMysteryShop()`
- `BuyMysteryShopGoods` → `buyMysteryShopGoods(goods...)`
- 放弃/离开 → `abandonMysteryShop()`

商人返回体由 `normalizeNPC(reply)` 归一化：`npcId`、`itemId`、`itemType`、`itemCount`、
`currencyId`、`currencyName`、`price`、`originalPrice`、`discount`、`purchased`。

自动购买由 `checkAndAutoBuyMysteryShop()` 驱动，检查周期

```js
const AUTO_BUY_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 商人可能在登录后才出现，十分钟一次只读查询
```

购买成功/放弃都会写进商人历史（`appendMysteryShopHistory`），面板上能回溯。

## 四、失败与限流

| 错误 | 处理 |
| --- | --- |
| `余额不足` / `点券不足` / `code=1000019` | 记「今天不再尝试买化肥」（`buyPausedNoGoldDateKey`），当天不再请求 |
| 限购已满 | `parseMallLimitInfo` 判定后跳过，不重复下单 |
| 商人已消失 | `getActiveMysteryShop()` 返回空，`abandonMysteryShop()` 清理状态 |
| 网关忙 | 抛 `GatewayBusyError`，本轮跳过（见「[网络并发模型](network-concurrency.md)」） |

## 五、后台接口

- `core/src/controllers/admin-mall-routes.js`：商城商品列表 / 手动购买 / 每日状态
- `core/src/controllers/admin-mystery-shop-routes.js`：当前商人、购买、放弃、历史
- `core/src/controllers/admin-shop-purchase-routes.js`：通用购买调试
- `core/src/controllers/admin-shop-debug-routes.js`：只读调试（不会真下单）

后台所有写操作都要求 `super_admin`，并走 `MANUAL_WRITE_METHODS` 里的方法名，
会被自动任务互斥锁串行化，避免和定时购买撞单。

## 六、充值

`core/src/services/pay.js` 只导出 `DEFAULT_RECHARGE_SOURCE`：发起充值时如果不指定来源，
就用这个默认值（与官方客户端的 `source` 字段一致）。充值本身走的是官方支付链路，
本仓库不代理支付，也不存任何支付凭据。

## 七、改动注意

- 商品内容物解析要兼容「一个 item 多条 count」的写法，`parseMallRewardItem` 里已有兜底；
- 限购判断必须用服务端返回的已购数量，不要自己累加本地计数；
- 买化肥的阈值来自账号配置（`fertilizer_buy_threshold` 一类），改默认值要同步改前端设置页说明；
- 商人购买属于写操作，务必包在 `withAutomationLock` 里（现已由 `MANUAL_WRITE_METHODS` 与
  `scheduler.tick` 两处覆盖）。

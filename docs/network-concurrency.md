# 网络并发模型

QQ 农场网关对**同一账号的并发请求**很敏感：短时间内打多路业务请求容易触发限流、
心跳漏拍，严重时会被判定异常。所以网络层不是「谁先调用谁先发」，而是分成几个班次排队。

涉及文件：

- `core/src/utils/request-priority.js`：班次定义与请求闸门（内存队列 + 调度）
- `core/src/utils/network.js`：网关连接、心跳、健康度判断、空闲闸门
- `core/src/services/automation-lock.js`：账号级自动任务互斥
- `core/src/core/worker.js`：定时任务、启动序列、写操作入口

## 一、五个班次

| 班次 | 在途上限 | 排队上限 | 谁在用 |
| --- | --- | --- | --- |
| `critical` | 2 | 8 | 心跳、ACE 挑战这类必须及时回应的请求 |
| `foreground` | 3 | 60 | 面板手动查看（仓库、好友列表等） |
| `farm` | 2 | 40 | 农场巡检、种植、收获 |
| `friend` | 2 | 30 | 好友访问、帮忙、偷菜 |
| `background` | 1 | 10 | 宠物同步、活动扫描、后台补数据 |

外加两道横向限制：

- **非前台合计上限**：同一时刻非 `background` 的在途请求不超过 `nonForegroundActiveCap`（默认 1），
  避免「农场 + 好友 + 面板」三路一起打。
- **critical 预留槽**：只要有 critical 在排队，非 critical 请求最多只能用到 `maxActive - 1`，
  保证心跳随时能插进去。

排队超过 `starvationMs`（默认 4000ms）的请求会被临时提升到 `foreground` 优先级，防止低优先级请求永远轮不到；
`background` 不参与提升，它本来就该让位。

## 二、后台空闲闸门

`background` 班次只在**完全空闲**时才发：

```js
isGatewayIdleForLowPriority() // core/src/utils/network.js
```

判定为不空闲的情形：未连接、心跳漏拍、有非 background 请求在途、有 background 请求正在发、
有请求卡住超过 5 秒。

需要等空闲的调用方用 `waitForGatewayIdle(maxWaitMs = 8000)`；等不到就抛 `GatewayBusyError`，
让调用方留到下一轮，而不是硬挤进去。判断这类错误用 `isGatewayBusyError(error)`。

## 三、网关健康度与退避

`isGatewayHealthyForBusiness()` 只看两件事：心跳是否漏拍、在途请求是否卡住超过
`GATEWAY_STALL_PENDING_MS`（5000ms）。

不健康时，巡田 / 好友巡检不硬跑，而是按指数退避重排：30s → 60s 封顶；
网关一恢复立即清零，并且只在「进入退避」和「恢复」各打一条日志，避免刷屏。

## 四、自动任务互斥

同一账号的自动任务用 `withAutomationLock(name, task, options)` 串行执行：

```js
const { withAutomationLock, AutomationBusyError, getAutomationLockStats } = require('./services/automation-lock');
```

- 按账号（`accountId` 或默认 key）排队，**可重入**：同一调用链里再次获取同一把锁只累加层级，不会自锁
- `lockTimeoutMs` 默认 120s（等锁超时），`taskTimeoutMs` 默认 180s（单任务执行上限，超时只记 warn 并释放锁）
- 等锁队列上限 `MAX_WAITING = 20`，超了直接抛 `AutomationBusyError`
- 拿到锁的会直接交接给下一个等待者，不经过定时器轮询

已接入的入口包括：每日例行、星空领取、神秘商人、`scheduler.tick` 巡检、
登录启动序列，以及面板的写操作（`MANUAL_WRITE_METHODS` 里的 30 个方法，
统一走 `manual.<method>` 且有 30s 等锁上限，忙碌时直接回 `errorType=automation_busy`）。

## 五、登录后的启动序列

以前是「每个功能各自开一个 setTimeout」，启动瞬间会有多路请求同时打出去。
现在 `runStartupSequence()` 串行执行：

```
每日例行（邮件 / 每日分享 / 月卡 / 免费礼包 / VIP）
  → 星空领取
  → 神秘商人
  → 放虫放草
```

每段都是 `await` + 独立 try/catch，中途掉线（`loginReady` 变 false）直接结束，不影响下一个账号。

## 六、相关测试

| 测试文件 | 覆盖点 |
| --- | --- |
| `core/test/request-priority.test.js` | 旧闸门行为（优先级、节流、默认参数）不回退 |
| `core/test/request-gate-lanes.test.js` | 分班次容量、critical 预留槽、防饿死提升、后台空闲、排队超时 |
| `core/test/automation-lock.test.js` | 同账号串行、不同账号并行、可重入、等锁超时、异常后释放 |

## 七、改动时的注意事项

- 新增业务请求时先想清楚属于哪个班次，不要一律用默认 `foreground`。
- 不要在班次闸门之外直接 `sendMsgAsync` 打多条业务请求，否则所有容量控制都会失效。
- 自动任务里做「读-改-写」组合操作时包一层 `withAutomationLock`，否则面板同时点一下就会冲突。
- 调整上限只改 `DEFAULT_CLASS_LIMITS`，不要在业务代码里散落魔法数字。

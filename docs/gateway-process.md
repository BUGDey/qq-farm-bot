# 连接网关：把「连接」和「业务」拆成两个进程

## 为什么

以前 `network.js` 和业务代码跑在同一个 worker 里。改一行逻辑 → 重启 worker → WebSocket 断 → 凭证作废 → 重新扫码。

拆开之后：

```
         ┌──────────────────────────┐
         │  网关进程（gateway）      │  只有它握着 WebSocket 和凭证
         │  core/src/runtime/       │
         │  gateway-process.js      │
         └───────────┬──────────────┘
                     │ 本机 socket（命名管道 / unix socket）
         ┌───────────┴──────────────┐
         │  worker（业务）           │  随便重启，连接不受影响
         └──────────────────────────┘
```

改代码 → 重启 worker → **连接还在、凭证没动、农场继续跑**。

只有网关进程重启才需要重新扫码——这是凭证机制的硬约束，绕不过去。

## 怎么开

默认**关闭**，用环境变量开启（写在 `.env` 或启动脚本里）：

```bash
FARM_NETWORK_MODE=gateway
```

- Windows：`start.bat` 读 `.env` 并注入面板子进程环境，写进去就生效。
- Linux/macOS：`export FARM_NETWORK_MODE=gateway` 后再启动。

关掉（默认）：一切照旧，`network.js` 直连游戏，行为和以前完全一致。

## 它怎么工作

| 文件 | 职责 |
|---|---|
| `core/src/runtime/gateway-protocol.js` | 行帧协议：JSON + base64 的 `body` |
| `core/src/runtime/gateway-stall.js` | 两级「假死」判定（见下） |
| `core/src/runtime/gateway-process.js` | 子进程：握连接、转发请求、广播下行帧 |
| `core/src/runtime/gateway-client.js` | worker 侧替身：冒充 `network` 对象 |
| `core/src/runtime/gateway-manager.js` | 生命周期：起停、socket 路径、孤儿清理 |

帧类型：

```
worker → gateway   connect / request / stop / ping
gateway → worker   ready / login / response / notify / event / pong / error
```

- worker 启动时发 `connect`；网关**已经登录过**就直接回 `reused`，不再走登录，所以重启 worker 不用重新抓码。
- 每次 `sendMsgAsync` 变成一帧 `request`，网关转发给游戏，回包再以 `response` 返回。
- 游戏主动下发的 `notify` 帧，网关广播给所有连着的 worker，worker 侧交给 `ingestFrame()` 用原有逻辑解码业务。
- 网关模式下 `network.js` 收到 `msgType === 3` 会**跳过业务处理**（只在 worker 里解一次），避免重复响应。

socket 路径：

- Windows：`\\.\pipe\qqfarm-gateway-<accountId>`
- 其他：`<tmpdir>/qqfarm-gateway-<accountId>.sock`

## 两级「假死」处理

游戏服务器偶发静默：连接看着是好的，请求发出去石沉大海。

**第一级：让路。** 连续 `2` 次业务请求超时 → 判定亚健康，暂停所有业务请求，只留心跳，把带宽让给心跳。任一次正常回包立刻解除。

**第二级：判死。** 亚健康状态下继续累计到 `7` 次超时 → 判定连接真坏，才走重连。

阈值不是拍脑袋定的——大部分「假死」其实是对方在装死，连接本身没坏。所以**判死要慢**：宁可多等一分钟，也别白扔一个凭证。

退避窗口是指数增长的：`30s → 60s → 120s → 180s`（封顶）。让路期间业务请求直接抛错：

```
网关亚健康退避中（连接静默），剩余 47s
```

心跳、登录、登出、重连、踢下线这类关键请求**不计入**统计，也**不受**让路限制——否则连自救的机会都没有。

## 已验证的部分

- `core/test/gateway-protocol.test.js`：编解码、分帧、socket 路径
- `core/test/gateway-stall.test.js`：2 次让路、7 次判死、关键请求不计数、退避上限
- `_ref/smoke-gateway.js`（本地冒烟）：真起子进程 → 握手 → ping/pong → 未知帧不崩

## 已知边界

- **网关重启 = 重新扫码**。凭证在网关进程内存里。
- 网关模式强制 worker 走 `fork`（需要独立进程），所以和 `threadMode` 不共存。
- 一个账号一个网关；同名账号的旧孤儿进程会在 `ensureGateway` 时按 socket 路径清理。
- 停账号会连带杀网关；单纯重启 worker 不会。
# TSDK/WASM 更新与 ACE 运行时

来源：`core/docs/tsdk-update-runbook.md` + `core/docs/tsdk-ace-runtime.md`。

## 适用范围与原则

- 仅分析自己设备上由 QQ 客户端正常下载和展开的官方运行文件。
- 全程复制源文件后分析，不直接修改 QQ 容器中的缓存。
- `tsdk.wasm` 和同目录 `game.js` 必须来自同一个包目录，**不能跨版本拼接**。
- 新文件先使用版本化名称加入项目；旧版至少保留到在线验收完成。
- SHA-256 相同表示没有二进制更新，不重复升级。
- imports、exports、数据段或初始化参数**任一**变化都视为需要适配，不能仅改哈希。
- HAR、日志和 `game.js` 可能含账号标识或 Token，不提交到仓库。

## 一、更新流程（macOS）

### 1. 定位官方展开目录

```bash
QQ_MINIAPP_SRC="$HOME/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/temps/miniapp_src"

find "$QQ_MINIAPP_SRC" -maxdepth 1 -type d -name '1112386029_3_*' -print

find "$QQ_MINIAPP_SRC" -path '*/1112386029_3_*/tsdk/tsdk.wasm' \
  -exec stat -f '%m %Sm %z %N' -t '%Y-%m-%d %H:%M:%S' {} \; | sort -nr
```

**按 `tsdk/tsdk.wasm` 的修改时间选择最新目录，不要只看目录名哈希。**
候选目录至少应包含 `game.js`、`game.json`、`tsdk/tsdk.wasm`、`assets/`。
Mac QQ 正常运行时通常已生成 `miniapp_src`，无需二次解包；不要默认套用微信 `.wxapkg` 工具。

### 2. 固化源文件到快照

```bash
TSDK_SOURCE="/完整路径/1112386029_3_xxx"
TSDK_SNAPSHOT="$(mktemp -d)"
cp "$TSDK_SOURCE/tsdk/tsdk.wasm" "$TSDK_SNAPSHOT/tsdk.wasm"
cp "$TSDK_SOURCE/game.js"        "$TSDK_SNAPSHOT/game.js"

shasum -a 256 "$TSDK_SNAPSHOT/tsdk.wasm"
stat -f '%z bytes, %Sm' -t '%Y-%m-%d %H:%M:%S' "$TSDK_SNAPSHOT/tsdk.wasm"
```

记录来源目录、获取日期和 SHA-256。

### 3. 自动结构与兼容性检查

```bash
cd core
npm run inspect:tsdk -- \
  --wasm "$TSDK_SNAPSHOT/tsdk.wasm" \
  --game-js "$TSDK_SNAPSHOT/game.js" \
  --baseline src/utils/tsdk-v3.9.0.1790160550.wasm
```

保存机器可读结果时追加 `--json`，**同时必须加 `--silent`**：

```bash
npm run --silent inspect:tsdk -- ... --json
```

否则 npm 的脚本启动横幅会混进标准输出，文件将不是合法 JSON。

脚本输出：文件大小和 SHA-256；imports 模块、名称和类型；exports 名称和类型；
所有 active data segments 的地址和长度；`decrypt_all_data` 中高频常量候选；
`game.js` 中的 TSDK 版本候选和关键加载标记；与当前基线的结构比较。

exports 兼容性按**公开名称和类型**判断；WASM 内部函数索引允许随编译结果变化，
不单独视为宿主 ABI 破坏。脚本只做静态读取，不实例化或执行候选 WASM。

### 4. 人工复核配套 game.js

```bash
rg -n -S \
  'tsdk/tsdk\.wasm|SdkInitEx|AnoUserLogin|AceManager|decrypt_all_data|1112386029|3167' \
  "$TSDK_SNAPSHOT/game.js"
```

至少确认：

| 项目 | 当前基线 |
| --- | --- |
| WASM 路径 | `tsdk/tsdk.wasm` |
| TSDK 初始化 | `SdkInitEx(3167, 0)` |
| 用户绑定 | `AnoUserLogin(0, openId)` |
| 小游戏 AppID | `1112386029` |
| 网关 Token | `AceManager.randomStr()` 语义 |
| imports | `a.a` 至 `a.v`，共 22 个函数 |
| 运行时表 | 与 `OFFICIAL_RUNTIME_TABLE` 相同 |

压缩混淆后的属性名可以变化；判断依据应是**调用语义、参数、字节内容和执行顺序**。

### 5. 差异分级与处理

| 结果 | 处理 |
| --- | --- |
| SHA-256 相同 | 无需更新 |
| 仅版本、哈希和代码体变化，结构相同 | 更新版本化 WASM、版本、哈希并测试 |
| 数据段变化 | 更新 `MERGED_DATA_SEGMENTS`，从 WASM data section 获取，**不猜地址** |
| 解密高频常量变化 | 反汇编确认 `MERGED_DATA_KEY`，不可沿用旧值 |
| imports 变化 | 更新 `createImports()`，逐项确认参数和返回值 |
| exports 变化 | 更新 `OFFICIAL_EXPORTS` 和 `REQUIRED_EXPORTS` |
| 运行时表变化 | 从同版本 `game.js` 提取并更新 |
| 初始化或生命周期变化 | 同步修改 `TsdkRuntime`、`AceService` 及测试 |

**结构不兼容时应停止替换默认文件**，先保留旧版运行路径，完成适配和离线测试。

### 6. 更新到项目

```bash
cp "$TSDK_SNAPSHOT/tsdk.wasm" "src/utils/tsdk-vX.Y.Z.wasm"
```

在 `src/utils/tsdk-runtime.js` 更新：`OFFICIAL_VERSION`、`OFFICIAL_SHA256`、默认 `wasmPath`，
以及（仅当变化时）`MERGED_DATA_SEGMENTS`、`MERGED_DATA_KEY`、`OFFICIAL_RUNTIME_TABLE`、
imports/exports 映射。

同时更新：`docs/tsdk-ace-runtime.md`、`test/tsdk-runtime.test.js`（接口或行为变化时）。

**不要覆盖 `tsdk-legacy.wasm`，不要在完成验收前删除上一个可运行的版本化 WASM。**

### 7. 离线验证门槛

```bash
cd core
node --check src/utils/tsdk-runtime.js
npx eslint src/utils/tsdk-runtime.js test/tsdk-runtime.test.js test/gateway-token.test.js
node --test test/tsdk-runtime.test.js test/gateway-token.test.js
npm test
```

必须验证：SHA-256 和必要导出校验；WASM 初始化和 `getResult()`；加解密往返；
Token 非空且连续调用不同；ACE heartbeat 产生二进制数据；多账号实例隔离；
错误版本被拒绝；destroy 后禁止继续调用。

**任何一项失败都不能切换默认 WASM。**

### 8. 在线验收

离线测试通过不代表服务端接受。使用专用测试账号分两阶段：

1. 连续运行至少 **5 分钟**，覆盖登录、自己农场、好友列表和一次好友操作。
2. 连续运行至少 **30 分钟**，覆盖 ACE 上报、TSDK heartbeat、重连和多次好友操作。

检查日志：没有 WASM 初始化、内存越界或 checksum mismatch；`AntiData` 请求持续成功且服务器响应
被回灌；WebSocket 无异常重连循环；Enter、AllLands、Farming 及好友操作持续有效；
停止账号或重连后旧 ACE 定时器已销毁。

在线验收结果写入更新记录，含测试日期、时长、覆盖操作和失败现象。

### 9. 回退

在线出现服务端拒绝或运行时异常时：

1. 将 `OFFICIAL_VERSION`、`OFFICIAL_SHA256` 和默认 `wasmPath` 恢复到上一个版本。
2. 若宿主映射也改过，一并恢复匹配版本的 imports、exports、数据段和运行时表。
3. 重跑完整离线测试。
4. 重新构建并重启部署，**不要让新旧宿主参数交叉使用**。

### 发布检查清单

- [ ] WASM 与 `game.js` 来自同一官方展开目录
- [ ] 记录版本、来源日期、大小和 SHA-256
- [ ] 执行 `inspect:tsdk` 并保存差异结论
- [ ] 复核初始化参数、运行时表、Token 和生命周期
- [ ] 使用版本化文件名加入新 WASM
- [ ] 更新运行时代码、调用约定和维护记录
- [ ] 定向测试通过
- [ ] 完整后端测试通过（基线 499 条全绿，只允许涨不允许跌）
- [ ] 5 分钟 + 30 分钟在线验收通过
- [ ] 保留上一可运行版本用于回退

## 二、当前运行时调用约定

基线版本 `v3.9.0.1790160550`，SHA-256
`2c9e377ecc9a4fd9019f12191b589d543a60d6654580eb3e237b35f1fa5b1cb7`，
来自 2026-09-24 的官方展开包，与当前宿主的 imports、exports、数据段和解密常量兼容。

### 初始化顺序

1. 校验 WASM SHA-256、导入数量和必要导出。
2. 实例化 22 个 `a.a` 至 `a.v` 宿主函数。
3. 使用官方 mergewasm 解密器和匹配版本的密钥解密 17 个数据段。
4. 调用 `__wasm_call_ctors`。
5. 按官方 `SdkInitEx(3167, 0)` 申请并写入 appKey，调用 `_init_runtime(3167, appKeyPtr)`，随后释放。
6. 登录请求开始使用 TSDK 请求体加密；网关 Token 使用官方 `AceManager.randomStr()` 格式。
7. 游戏登录成功后启动 ACE 生命周期和数据轮询。

默认 TSDK `gameId` 为 `3167`、`appKey` 为字符串 `"0"`；可用 `FARM_TSDK_GAME_ID`、
`FARM_TSDK_APP_KEY` 覆盖。**小程序应用 ID 和 TSDK 宿主 game ID 字符串均为 `1112386029`，
不要与 `SdkInitEx` 的 `3167` 混用。** `FARM_TSDK_ACE_ENABLED=false` 会显式关闭整条安全链路。

### 导出映射与内存

| API | WASM 导出 | 参数/返回 |
| --- | --- | --- |
| create buffer | `A` | `(length) -> ptr` |
| destroy buffer | `B` | `(ptr) -> void` |
| get result | `C` | `() -> 64-byte ptr`，WASM 所有 |
| init runtime | `G` | `(gameId, appKeyPtr) -> void` |
| heartbeat tick | `M` | `() -> void` |
| get data to server | `N` | `(lengthOutPtr) -> dataPtr`，WASM 所有 |
| send data from server | `O` | `(ptr, length) -> void` |
| generate token | `aa` | `(ptr, length) -> UTF-8 token ptr` |
| encrypt in place | `ba` | `(ptr, length) -> void` |
| decrypt in place | `ca` | `(ptr, length) -> void` |
| encrypt v2 | `da` | `(inPtr, inLen, outPtr, outCap) -> length` |
| decrypt v2 | `ea` | `(inPtr, inLen, outPtr, outCap) -> length` |

调用者分配的输入和 Token 返回指针均在复制后由 `_destroy_buffer` 释放；
`getResult` 和 `getDataToServer` 返回的 **WASM 所有内存不由 JavaScript 释放**。
所有复制前均检查指针、长度和当前 `memory.buffer` 边界。

### 导入映射速查

`a.a` assertion / `a.b` write file / `a.c` JS stack / `a.d` TSDK version / `a.e` ACEVM 完整性
（空结果降级并一次告警）/ `a.f` 陀螺仪（无传感器，一次告警）/ `a.g` read file /
`a.h` 时钟 / `a.i` user data path / `a.j` device info / `a.k` runtime table（59 字节表）/
`a.l` debug state / `a.m` app id / `a.n` game id string / `a.o` 函数完整性数组（空能力降级）/
`a.p` file stat / `a.q` server timestamp / `a.r` 内存增长失败 / `a.s` epoch ms /
`a.t` append file / `a.u` abort / `a.v` TQOS 上报。

### 网关与 ACE

业务体先由 `_encrypt_data` 原地加密。网关 `auth_token` **不使用** `_generate_token` 的
24 字符结果，而是复刻官方 `AceManager.randomStr()`：随机 64～127 个字母数字字符并追加一个 `=`。
`AnoUserLogin(0, openId)` 绑定账号后，`_get_encrypted_init_info` 产生的一次性初始化凭据会
优先用于下一条请求，之后恢复随机 Token —— 这与官方每次登录后首条 `AllLands` 的特殊长 Token 相符。

`AceService` 每 5 秒检查 `_get_data_to_server`，仅在非空时调用
`gamepb.acepb.AceService.AntiData`，服务器 `reply.data` 原样传给 `_send_data_from_server`；
同账号最多一个在途请求，失败按 2–30 秒有限退避。`_process_received_data` 每 5 秒执行，
`_send_heartbeat_tick` 每 25 秒；速度检测每 30 秒，状态上报与函数检查分别在 150 秒、180 秒触发。

每个 Worker 加载自己的 CommonJS 模块实例，因此运行时、内存、文件目录、请求、定时器和服务器回灌
均**按账号隔离**；重连、连接关闭和账号停止都会销毁旧实例。

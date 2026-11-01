# TSDK / ACE 运行约定

QQ 农场网关要用官方小程序里的 **TSDK**（WebAssembly）来生成/解密与 ACE 校验相关的数据。
仓库把这部分能力封装成两个模块，业务代码不直接碰 wasm。

- `core/src/utils/tsdk-runtime.js`：加载 wasm、校验 sha256、初始化实例、导出加解密接口
- `core/src/utils/crypto-wasm.js`：业务侧入口（`initWasm()` 等），内部代理到 `TsdkRuntime`

## 一、版本是写死的

```js
// core/src/utils/tsdk-runtime.js（按平台选构建）
const TSDK_BUILDS = {
    qq: { file: 'tsdk-v3.9.0.1793452320.wasm', version: 'v3.9.0.1793452320', sha256: '8ea1090b…' },
    wx: { file: 'tsdk-wx-v3.9.0.1793451777.wasm', version: 'v3.9.0.1793451777', sha256: '0b7e8717…' },
};
const MINI_PROGRAM_APP_IDS = { qq: '1112386029', wx: 'wx5306c5978fdb76e4' };
```

按 `CONFIG.platform`（`qq` / `wx`）选择对应 wasm，**加载时强制校验 sha256**，
对不上直接抛 `TSDK WASM checksum mismatch`，不会带着可疑 wasm 继续跑。

仓库里同时保留了几个历史版本（`tsdk-v3.8.2.wasm`、`tsdk-v3.8.6.wasm`、
`tsdk-v3.9.0.1788935757.wasm` 等）只用于对照排查，**默认不加载**。

> 红线：不要把不同版本的 `tsdk-runtime.js` 与 wasm 拼在一起用。
> 官方每次更新 TSDK，内部导出名、数据段布局都可能变，混用会直接崩在初始化阶段。

## 二、相关常量

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `TSDK_BUILDS.qq` | `v3.9.0.1793452320` | QQ 小程序当前 TSDK |
| `TSDK_BUILDS.wx` | `v3.9.0.1793451777` | 微信小程序当前 TSDK |
| `MINI_PROGRAM_APP_IDS.qq` | `1112386029` | 农场小程序 AppID（QQ） |
| `MINI_PROGRAM_APP_IDS.wx` | `wx5306c5978fdb76e4` | 农场小程序 AppID（微信） |
| `DEFAULT_GAME_ID` | `3167` | 游戏 ID |
| `DEFAULT_APP_KEY` | `0` | 官方客户端里就是 `0` |

## 三、初始化流程

1. 读 wasm 文件 → `sha256` 校验
2. `WebAssembly.instantiate(wasm, imports)` 建立实例（imports 里提供 `w`、`y` 等官方导出映射）
3. 只预解密元数据段 `[67371008, 404]`（`__mergewasm_shared____wasm_decrypt_strings`），
   再调 `decrypt_all_data()` 让 wasm 自己解密其余数据段，最后调导出 `x()` 触发构造
4. 日志打印 `ACE 初始化成功：v3.9.0.1793452320，耗时 N ms`
5. `getInfo()` 可拿到 `{ version, wasmSha256 }`，用于自检和排查

## 四、什么时候会用到

- 网关握手 / 心跳里的 ACE 挑战应答（`core/src/services/ace-service.js`）
- 需要伪造官方 Token 或解密请求体的场景（抓包脚本 `--decrypt-requests` 也复用它）

## 五、开关

```bash
FARM_TSDK_ACE_ENABLED=false
```

关掉后（`core/src/config.js` 读这个环境变量），网关请求不会使用伪造 Token，
网络层会明确报错「TSDK/ACE 已通过 FARM_TSDK_ACE_ENABLED=false 关闭」。
这个开关只用于对照排查，**不要在生产环境关掉**，否则登录/握手会失败。

## 六、TSDK 更新了怎么办

```bash
pnpm -C core inspect:tsdk
```

脚本会去官方 CDN 比对当前版本与 sha256，给出「是否需要更新」的结论。要更新的步骤：

1. 下载新 wasm 到 `core/src/utils/`，命名保持 `tsdk-<version>.wasm`
2. 更新 `tsdk-runtime.js` 里的 `OFFICIAL_VERSION` / `OFFICIAL_SHA256` 与默认 `wasmPath`
3. 清掉旧的 require 缓存跑一次完整登录，看 `ACE 初始化成功` 与心跳是否正常
4. 跑 `node --test test/*.test.js`，确认没有测试依赖旧版本号

## 七、常见报错

| 报错 | 原因 |
| --- | --- |
| `TSDK WASM checksum mismatch` | wasm 被改过 / 版本与 sha256 不匹配，重新下载官方文件 |
| `TSDK 尚未就绪` | 初始化还没完成就发了网关请求，等 `init()` 的 Promise |
| `TSDK/ACE 已通过 FARM_TSDK_ACE_ENABLED=false 关闭` | 环境变量被人为关掉，删掉该变量重启 |

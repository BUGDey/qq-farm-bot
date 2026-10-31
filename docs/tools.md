# 工具脚本

仓库里的辅助脚本分两类：**日常入口（`core/package.json` 的 npm script）** 和 **按需手动运行的独立脚本**。
所有脚本都是纯 CommonJS，直接用 `node` 跑，不需要 `tsx` / TypeScript 编译。

## 一、npm script 入口

在仓库根目录执行 `pnpm -C core <脚本名> -- <参数>`，或 `cd core && npm run <脚本名> -- <参数>`。

| 命令 | 脚本 | 用途 |
| --- | --- | --- |
| `inspect:protocol` | `core/scripts/inspect-protocol-capture.js` | 检查 HAR / `.bin` 帧目录里的网关协议帧（详见下文） |
| `inspect:activity-har` | `core/scripts/inspect-activity-har.js` | 从活动页 HAR 里提取活动相关请求 |
| `inspect:tsdk` | `core/scripts/inspect-tsdk-update.js` | 检查官方 TSDK 是否有新版本、校验 sha256 |
| `inspect:cdn` | `core/scripts/find-cdn-resource.js` | 按资源名在 CDN 上找对应文件 |
| `extract:plant-phases` | `core/scripts/extract-plant-phase-images.js` | 从游戏缓存里抽出植物阶段图 |
| `capture:start` | `core/capture-server.js` | 启动抓包代理（管理后台也可开关） |
| `test` | — | `node --test test/*.test.js`，当前基线 542 项 |
| `lint` | — | `eslint . --fix` |

## 二、协议抓包检查（`inspect:protocol`）

```bash
# HAR 抓包
pnpm -C core inspect:protocol -- /完整路径/capture.har --pretty

# 网关帧目录（.bin）
pnpm -C core inspect:protocol -- /完整路径/frames --method Operate --audit --pretty
```

常用选项：

- `--service` / `--method` / `--direction`：按 service、method 或 request/response/notify 过滤
- `--shape`：只输出 protobuf 的字段编号、wire type、出现次数、字节长度
- `--audit`：检查未知字段、wire type 不匹配、缺失类型；存在问题返回非零退出码（适合做兼容性检查）
- `--decrypt-requests`：用仓内 TSDK WASM 解密请求 body；默认不解密，也不会把加密内容误当 protobuf
- `--show-sensitive`：显示已知敏感字段（默认对 token / code / cookie / session / metadata 脱敏）
- `--pretty`：输出单个格式化 JSON（默认 JSON Lines）

**注意**：抓包可能在未知数字字段里带着 GID 等数据。分享或提交输出前必须人工复核，不要对不可信抓包使用 `--show-sensitive`。

## 三、`tools/` 里的两个包装入口

为了和常见的「解码 / 兼容性审计」两步走习惯对齐，`tools/` 下提供两个薄包装（内部仍调用 `inspect-protocol-capture.js`，不重复实现逻辑）：

```bash
# 解码指定抓包目录里的协议帧
node tools/decode-latest-protocols.js <capture-dir>

# 检查抓包 RPC 与本地 protobuf 定义的兼容性（等价于 --audit）
node tools/audit-capture-compatibility.js <capture-dir>
```

两个包装都会把参数原样透传，并把子进程的退出码返回，方便接 CI。

## 四、手动运行的脚本

| 脚本 | 用途 |
| --- | --- |
| `core/scripts/sync-config-tables.js` | 从官方 CDN 增量同步 `Plant.json` / `ItemInfo.json`（只新增、不改存量，见「[配置存储、迁移与缓存](config-storage.md)」） |
| `core/scripts/audit-game-resources.js` | 核对图鉴与资源覆盖度（种子图、阶段图、皮肤图），见「[游戏版本与资源对齐](game-update-20261031.md)」 |
| `core/scripts/extract-rain-poem-effects.js` | 从缓存抽出雨落成诗活动特效图（ASTC → PNG），见「[雨落成诗活动](weather-activity.md)」 |
| `core/scripts/init-env.js` | Windows 首次启动生成 `.env` 与随机管理员密码（`start.bat` 调用） |
| `core/scripts/reset-admin-password.js` | 重置管理员密码：`node scripts/reset-admin-password.js <新密码> [用户名]` |
| `core/scripts/inspect-tsdk-update.js` | 对比官方 TSDK 版本与 sha256，决定要不要换 wasm |
| `core/scripts/find-cdn-resource.js` | 按资源名反查 CDN 地址 |

## 五、写脚本的几条约定

- 抓包、日志、导出的中间文件不要提交进仓库；`core/data/` 与 `/data/` 已在 `.gitignore` 里。
- 脚本只读官方目录（`%APPDATA%\QQEX\miniapp\...`），不做写入或删除。
- 涉及协议字段的脚本，先 `--shape` 看结构，再改本地 proto，不要凭猜测补字段。

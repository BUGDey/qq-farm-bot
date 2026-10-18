# QQ 农场官方客户端源码与资源缓存定位（Windows / macOS 双平台）

路径均经本机（Windows 11，QQ NT）**实测确认**，macOS 分支按官方容器路径编写。

用途：升级 TSDK、恢复活动协议字段、查 CDN 配置表与图片、提取植物阶段图，第一步都是
找到"最新且完整的官方源码目录"和"资源缓存目录"。找错了版本，后面所有结论都作废。

## 一、平台路径对照表

| 项 | Windows | macOS |
| --- | --- | --- |
| 小游戏源码根 | `%APPDATA%\QQEX\miniapp\temps\miniapp_src` | `~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/temps/miniapp_src` |
| 源码版本目录 | `<根>\1112386029_3_<hash>\` | `<根>/1112386029_3_<hash>/` |
| 资源缓存根 | `%APPDATA%\QQEX\miniapp\fs` | `~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/fs` |
| 农场资源缓存 | `<缓存根>\<QQ号>\1112386029\usr\gamecaches\` | `<缓存根>/*/1112386029/usr/gamecaches/` |
| 缓存索引 | `gamecaches\cacheList.json`（URL ⇄ 本地文件映射） | 同左 |
| 常见 bundle | `mainscene/ extraRes/ plant/ delayRes/ audio/ petdog/` | 同左 |

关键差异：Windows 走 **`AppData\Roaming\QQEX`**，不是 macOS 的
`Library/Containers/com.tencent.qqexminiprogram/.../QQEX`，两者只是末段 `QQEX/miniapp/...` 相同。
**不要把 Windows 路径套 macOS 模板，也不要反过来。**

Windows 实测形态（目录名按本机环境替换）：

```text
%APPDATA%\QQEX\miniapp\temps\miniapp_src\1112386029_3_<hash>\
%APPDATA%\QQEX\miniapp\fs\<QQ号>\1112386029\usr\gamecaches\
```

`miniapp_src` 下可能同时存在多个 `1112386029_3_<hash>` 目录（历史版本），
`fs` 下每个 QQ 号一个缓存目录（多账号就有多份）。

## 二、一键定位（推荐）

```bash
# 仓库根目录执行，跨平台；输出 JSON（selected = 最新完整源码目录）
node .workbuddy/skills/qq-farm-bot-maintenance/scripts/find-client-source.js
node .workbuddy/skills/qq-farm-bot-maintenance/scripts/find-client-source.js --all      # 列出全部候选
node .workbuddy/skills/qq-farm-bot-maintenance/scripts/find-client-source.js --caches   # 同时列资源缓存
node .workbuddy/skills/qq-farm-bot-maintenance/scripts/find-client-source.js --source <目录>  # 校验指定目录
```

判定"完整"的四要素（缺一不可）：

```text
game.js
game.json
tsdk/tsdk.wasm
assets/
```

脚本退出码 2 = 没找到完整候选（QQ 没装 / 没玩过农场 / 缓存在别的盘）。

### 手工定位备选

**Windows（PowerShell）**

```powershell
$src = "$env:APPDATA\QQEX\miniapp\temps\miniapp_src"
Get-ChildItem "$src\1112386029_3_*\tsdk\tsdk.wasm" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 5 LastWriteTime, Length, FullName
```

**macOS（bash）**

```bash
QQ_MINIAPP_SRC="$HOME/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/temps/miniapp_src"
find "$QQ_MINIAPP_SRC" -path '*/1112386029_3_*/tsdk/tsdk.wasm' \
  -exec stat -f '%m %Sm %z %N' -t '%Y-%m-%d %H:%M:%S' {} \; | sort -nr
```

## 三、选版本的铁律

1. **按 `tsdk/tsdk.wasm` 的修改时间选最新**，不认 hash 目录名——每次农场更新 hash 都会变，
   某个 hash 目录永远不是"最新版"的代名词。
2. **不跨版本拼接**：`tsdk.wasm` 必须和同目录的 `game.js` 配套，混用会造成
   `checksum mismatch` / ACE 初始化失败 / 被服务端拒绝。
3. 选中后记录：目录绝对路径、`tsdk.wasm` 的 mtime 与 size、配套 `game.js` 路径，
   写进交付说明，便于回溯。

## 四、只读铁律

- QQ 容器目录**只读**。需要解包/处理的文件一律先 `cp` 到系统临时目录再操作。
- 远程配置缓存写系统临时目录，**绝不写回 QQ 源码目录或运行资源缓存**。
- 微信缓存不能用来判断 QQ 包是否存在（反之亦然）；两个客户端目录不通用。
- 官方源码、解包产物、cacheList、HAR、抓包帧都不进 Git。

## 五、仓库自带工具的平台坑（Windows 必读）

以下 core 脚本**默认按 macOS 路径**查找源码/缓存，在 Windows 上不会自动命中：

| 脚本 | 默认根 | Windows 上的正确用法 |
| --- | --- | --- |
| `core/scripts/find-cdn-resource.js`（`npm run inspect:cdn`） | macOS `miniapp_src` | 先跑 `find-client-source.js` 拿 `selected.directory`，再用 `--source <该目录>` |
| `core/scripts/extract-plant-phase-images.js`（`npm run extract:plant-phases`） | macOS `miniapp/fs` | 传 `--source <源码目录>`；资源缓存必要时手工指定 |
| `core/scripts/extract-rain-poem-effects.js` | macOS `miniapp/fs` | 同上 |
| `core/src/services/activity-update-scanner.js` | macOS `miniapp_src` | 传显式 source 参数 |

典型报错与含义：

- `未找到 QQ 农场 gamecaches` / `未找到 cacheList.json` → 不是农场没资源，多半是
  **平台路径不对**（Windows 走了 mac 模板）或该 QQ 号没下载过资源；换 `--source` 或换 QQ 号缓存目录重试。
- 迟早要改的话，正解是把这些脚本的默认根改成"按 `process.platform` 分发"，
  但那属于会引入合并冲突的改动，改前先确认合并策略。

## 六、拿到源码后做什么

按目标分流：

- 升级 WASM / ACE 报错 → `references/02-tsdk-update.md`
- 恢复 `ActivityService.Operate` 字段、命令字 → `references/03-protocol-recovery.md`（内含完整静态恢复流程）
- 查物品/作物/图片、提取植物阶段图 → `references/03-protocol-recovery.md` 第二节
  （`inspect:cdn` 与 `extract:plant-phases`）

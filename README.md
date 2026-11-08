<div align="center">

<img src="web/public/icon.png?v=2" width="96" alt="QQ Farm Bot 图标">

# QQ Farm Bot

🌱 一位会自己浇水、除草、收菜的 QQ 农场小帮手呀

[能做什么](#-能做什么) · [双端扫码](#-QQ微信扫码登录) · [开始种田](#-开始种田) · [Docker 部署](#-docker-部署) · [已部署更新](#-已部署环境更新) · [更新记录](docs/CHANGELOG.md) · [使用文档](#-使用文档) · [支持项目](#-支持项目)

</div>

> [!WARNING]
> 快乐种田，谨慎使用。本项目仅供学习和研究，自动化操作可能违反游戏服务条款，账号及其他相关风险由使用者自行承担。

> [!TIP]
> 欢迎 Fork 本项目并提交 PR。项目主要由个人利用业余时间维护，精力有限，功能更新、问题修复和兼容性适配难免有所遗漏。如果你发现 Bug、有新的想法，或有更好的实现方案，欢迎直接参与贡献，共同完善项目。

## 🌾 能做什么

- 👨‍🌾 **照看多座农场**：多个账号统一管理，也可以单独控制
- 💧 **打理日常农活**：农场、好友、任务、商城和活动自动化
- 🖥️ **随时看看田里**：Web 控制面板、实时日志和数据统计
- 🌻 **认识每株作物**：作物图鉴、土地状态和变异效果展示
- 🎉 **赶上限时活动**：支持“奶茶热销中”等活动，查看店铺经营、制作奶茶、雇佣员工与领取奖励，还有活动分析
- 📱 **轻松添加账号**：支持内置微信扫码、手机抓包登录和 QQ 好友同步
- 📦 **多种方式开工**：支持源码、Docker 和桌面二进制构建

> 🌱 想看看这片农场是怎么一步步长大的吗？前往[农场成长记录](docs/CHANGELOG.md)查看最新更新和完整历史。

## 🎉 最新更新 · v2.16.4

- 邀请奖励改为「绑定挂机账号后双方一起到账」：注册时只记一条待定，绑定后才发天数，注册空号拿不到任何时长
- 同一个挂机账号（QQ 号 / 微信 openid）只认一次：拿小号去绑别人已经用过的游戏号，邀请人和被邀请人都不再增加时长
- 账号标识取自 QQ 号或微信 openid，重新登录、换设备都不会变，本地 data 目录单独留档
- 邀请卡与注册页文案同步：明确「绑定后双方各得 N 天」以及「同一个游戏号只能算一次」


## 💬 微信扫码登录

微信玩家可直接在“添加账号 → 微信扫码”中完成登录。扫码链路已内置到 Bot 进程，通过应用宝 OAuth 获取微信会话，并使用内置 MMTLS 协议换取农场短时效 Code，无需额外部署 YYB-GO、第三方登录 API 或代理容器。

## 🧺 小推车里装了什么

| 模块 | 技术 |
| --- | --- |
| 后端 | Node.js、Express、Socket.IO、CommonJS |
| 前端 | Vue 3、Vite、TypeScript、Pinia、UnoCSS |
| 工程 | pnpm workspace、Docker |

管理面板默认住在 `3007` 端口。

### 关于仓库里的 `core/plugins`（体积说明）

`core/plugins/` 下的内置插件（素材包、奶茶店、节气）连同图片素材一起入库，约占仓库 66MB。这样做的原因是：
内置插件随代码一起发版、随仓库一起克隆，用户拿到部署包就能直接用，不需要额外下载素材或联网补资源；
插件的 `frontend/dist` 也在仓库里（`.gitignore` 里专门放行 `!core/plugins/*/frontend/dist/`），
避免「克隆下来插件面板打不开」。如果你只是改核心逻辑、不关心插件，克隆时可以用浅克隆减少下载量。

## 📦 发行版安装（免编译，推荐）

不想装 Git、pnpm，也不想自己构建前端？直接下载打包好的发行版就行，包在 [Releases](https://github.com/BUGDey/qq-farm-bot/releases) 页面。

每个版本提供 4 个包，功能完全一致，区别只有「前端是否已经构建好」：

| 包 | 平台 | 前端 | 适合谁 |
| --- | --- | --- | --- |
| `*-win-x64-full.zip` | Windows | 已构建 | 大多数人，解压双击 `start.bat` 就能跑 |
| `*-win-x64-source.zip` | Windows | 未构建 | 想自己改前端，首次启动自动构建 |
| `*-linux-x64-full.zip` | Linux | 已构建 | 服务器部署，`./start.sh` 一键装依赖并启动 |
| `*-linux-x64-source.zip` | Linux | 未构建 | 想自己改前端，首次启动自动构建 |

前置依赖只有 **Node.js 20+**（脚本发现没有 pnpm 会自动用 corepack 安装）。

- Windows 的「QQ 扫码版」走**本机 NapCat Shell**，不需要 Docker；
- Linux / macOS 的「QQ 登录版」仍用 Docker，`./start.sh 2` 会自动拉起 NapCat 容器。

### Windows

1. 下载 `qq-farm-bot-v<版本>-win-x64-full.zip`；
2. 解压到任意目录（路径尽量别带空格和中文）；
3. 双击 `start.bat`，出现菜单：

   ```
   1) 启动面板（本机 Node 模式，不需要 QQ）
   2) 启动 QQ 扫码版（本机 NapCat Shell）
   3) 查看状态
   4) 停止
   ```

4. 只跑面板：选 `1`，浏览器打开 <http://localhost:3007>，账号 `admin` + 窗口里打印的密码；
5. 要 QQ 扫码，只需装好 **Node.js 20+**：NapCat Shell 自带 QQNT 运行时，
   不占用、也不需要你本机安装 QQ，插件、Token、白名单全部自动配置；
6. 双击 `start.bat` 选 `2`：首次会自动下载 NapCat（约 120MB）并解压，
   然后自动装插件、写白名单与 Token，先起 NapCat 再起面板，最后打印两个地址；
7. 打开 <http://127.0.0.1:6099/webui> 用手机 QQ 扫码登录 NapCat，
   再到面板「账号管理 → 添加账号」选「QQ 扫码」；
8. 停止：双击 `stop.bat`，或在菜单里选 `4`（NapCat 与面板一起停）。

### Linux

在服务器上一条命令取最新版本、下载、解压并启动：

```bash
V=$(curl -fsSL https://api.github.com/repos/BUGDey/qq-farm-bot/releases/latest | sed -n 's/.*"tag_name" *: *"v\([^"]*\)".*/\1/p')
curl -fL -o qq-farm-bot.zip "https://github.com/BUGDey/qq-farm-bot/releases/download/v${V}/qq-farm-bot-v${V}-linux-x64-full.zip"
unzip -q qq-farm-bot.zip && cd "qq-farm-bot-v${V}-linux-x64-full"
chmod +x start.sh && ./start.sh
```

- 想装源码包：把文件名里的 `full` 换成 `source`；
- 完整包已内置前端产物：启动时**不会重新构建前端**（`./start.sh 1` 检测到 Docker 时，镜像构建也会直接复用包内 `web/dist`）；只有 `source` 包才会在首次启动时构建；
- 想钉住某个版本：把 `${V}` 直接换成版本号，例如 `2.9.2`；
- 跳过菜单直接启动：默认版 `./start.sh 1`，QQ 登录版 `./start.sh 2`；
- 日常运维：`./start.sh status|logs|restart|stop`；
- 机器上没有 `unzip`：用 `python3 -m zipfile -e qq-farm-bot.zip .` 解压。

### 管理员密码在哪看

首次启动会生成随机密码，写进项目根目录 `.env` 的 `FARM_ADMIN_PASSWORD`：

- Linux：`./start.sh` 启动时打印在终端，之后随时 `cat .env`；
- Windows：`start.bat` 启动时打印在窗口，之后用记事本打开 `.env`。

忘记密码就重置（先停服务）：

```bash
# Windows：双击 start.bat 选 5，或直接命令行
start.bat reset-admin

# Linux
./start.sh reset-admin
```

两者都会随机生成 16 位新密码、重置管理员账号并写回 `.env` 的 `FARM_ADMIN_PASSWORD`。
想自己指定密码（需至少 6 位、含大小写/数字/符号中的两种）：

```bash
start.bat --reset-admin 你的新密码        # Windows
cd core && node scripts/reset-admin-password.js 你的新密码   # 通用
```

> 每个 Release 的说明里也固定写了这段，不用回来翻 README。

## 🚜 开始种田

### 准备工具

- Node.js 20+
- pnpm 10+
- Git

### 把农场跑起来

```bash
git clone https://github.com/BUGDey/qq-farm-bot.git
cd qq-farm-bot

corepack enable
pnpm install
pnpm build:web
pnpm dev:core
```

看到服务启动后，打开 <http://localhost:3007>，你的农场控制室就准备好了。

想继续装修控制室？可以另外启动前端开发服务器：

```bash
pnpm dev:web
```

## 🚀 一键部署（Linux）

项目根目录的 `start.sh` 是统一入口，会自动装依赖、构建前端并启动服务：

```bash
git clone https://github.com/BUGDey/qq-farm-bot.git
cd qq-farm-bot
./start.sh
```

菜单提供两种模式：

| 选项 | 说明 |
| --- | --- |
| `1` 默认版 | 仅农场服务。有 Docker 走 Compose，否则 Node 直跑 |
| `2` QQ 登录版 | 额外启动 NapCat，自动配置 QQ 扫码登录（需要 Docker） |

也可跳过菜单：`./start.sh 1` / `./start.sh 2`；
运维：`./start.sh status|logs|restart|stop`；本地开发：`./start.sh dev`。

详细部署与运维见 `docs/部署说明.md`。

## 🐳 Docker 部署

> [!IMPORTANT]
> 手动使用 Compose 时，需要先在 `.env` 中设置 `FARM_ADMIN_PASSWORD`（管理员初始密码，必填）。
> 更省事的做法是直接 `./start.sh`，它会自动生成随机密码并写入 `.env`。

```bash
git clone https://github.com/BUGDey/qq-farm-bot.git
cd qq-farm-bot
cp .env.compose.example .env    # 然后编辑 .env，填入 FARM_ADMIN_PASSWORD
docker compose up -d --build
```

查看运行状态和日志：

```bash
docker compose ps
docker compose logs -f
```

更新代码后重新构建：

```bash
git pull
docker compose up -d --build
```

默认映射：

| 用途 | 端口或目录 |
| --- | --- |
| Web 管理面板 | `3007` |
| 抓包代理端口 | `18000` |
| 持久化数据 | 项目根目录下的 `data/` |

源码运行、Docker 和二进制发布版的抓包服务均默认开启，随应用启动嵌入服务，
并且只使用代理端口 `18000`。可在“系统配置 → Code/GID 抓取服务”中关闭；旧版配置首次升级时会自动开启，之后手动保存的关闭设置会保留。

如需指定抓包服务对外地址，可在仓库根目录创建 `.env`：

```dotenv
CAPTURE_ADVERTISE_IPS=192.168.1.100,100.64.0.2
```

## 🔄 已部署环境更新

适用于服务器上已经在跑、只想把代码更到新版的情况。用户、卡密、农场账号配置都在数据目录里，
**正常更新不会丢失**；但版本跨度较大或需要回滚时，务必先备份。

> [!WARNING]
> - Docker 模式的数据在 `./data`，Node 直跑的数据在 `core/data`，两种模式不共用。
>   切换模式时 `start.sh` 会提示是否迁移，不要手动复制数据目录。
> - Docker 模式下 `./start.sh restart` 只重启容器（**不会重新构建镜像**），
>   更新代码后必须 `docker compose up -d --build`，否则跑的还是旧代码。
> - Node 直跑模式下 `start.sh` 只在 `core/node_modules` 或 `web/dist` **缺失**时才安装依赖、构建前端，
>   更新代码后必须手动重新构建前端，否则页面仍是旧版本。

### 1. 备份（建议每次都做）

```bash
cd <部署目录>
TS=$(date +%Y%m%d-%H%M%S)
[ -d data ] && cp -a data "data.bak.$TS"
[ -d core/data ] && cp -a core/data "core-data.bak.$TS"
[ -f .env ] && cp .env ".env.bak.$TS"
```

### 2. 拉取新代码

当初用 `git clone` 部署的（推荐，后续更新最省事）：

```bash
cd <部署目录>
git pull
```

如果服务器上改过文件导致 `git pull` 失败：

```bash
git stash push -m "服务器本地改动"   # 先收起本地改动
git pull
git stash pop                      # 再放回来，按提示合并冲突
```

直接丢弃本地改动（确认不再需要时）：`git checkout -- <冲突文件>`

当初是手动上传 / 拷贝目录部署的：把新版里除数据目录和 `.env` 之外的内容覆盖过去即可，
**不要覆盖** `data/`（或 `core/data/`）和 `.env`，否则会清空用户、卡密与管理员密码。

### 3. 按运行模式更新并重启

Docker 模式（含 QQ 登录版）：

```bash
cd <部署目录>
docker compose up -d --build          # 重新构建镜像并启动
docker compose ps                     # 确认容器为 Up
docker compose logs -f --tail=100     # 看启动日志
```

Node 直跑 / systemd 模式：

```bash
cd <部署目录>
pnpm -C core install --prod --frozen-lockfile   # 依赖有更新时执行
pnpm -C web install --frozen-lockfile           # 依赖有更新时执行
pnpm -C web build                               # 必须重新构建前端
./start.sh restart
```

也可以直接 `./start.sh` 重新走一遍部署菜单（幂等，不会清数据）。

### 4. 更新后自检

```bash
./start.sh status      # 查看服务状态与访问地址
./start.sh logs        # 跟踪日志
```

打开管理面板确认：版本号/功能是否有变化、账号与卡密数据是否完整、农场账号是否仍在线。

### 5. 出问题怎么回滚

- Git 部署：回到上一个可用版本
  ```bash
  git log --oneline -5          # 找到更新前的 commit
  git checkout <旧commit>
  docker compose up -d --build  # Docker 模式
  # Node 模式：pnpm -C web build && ./start.sh restart
  ```
  确认正常后再 `git checkout main` 回到主线。
- 数据异常：停掉服务，把第 1 步的备份目录改回 `data`（或 `core/data`）即可。

## 🔑 登录方式

项目支持微信扫码、QQ/NapCat 扫码、手动填码和手机抓包等账号添加方式。

### QQ/NapCat 扫码

**Windows（本机 NapCat Shell，不用 Docker）**：双击 `start.bat` 选 `2`，只需装好 Node.js 20+，其余自动完成：

- 下载并解压 NapCat Shell 到 `data\napcat\`（含自带 QQNT 运行时，主源失败自动切镜像）；
- 复制 `napcat/plugins/qq-miniapp-openauth` 到 NapCat 的 `plugins/` 并在 `napcat.mjs` 白名单登记；
- 生成 `data\napcat\auth\token`，同时写进 NapCat 插件配置与 `.env`；
- 用 `NapCat.Shell.Windows.Node.zip` 自带的 `node.exe index.js` 起 QQNT 运行时，等 6099 就绪后再起面板。

**Linux / macOS（Docker）**：NapCat 默认不启动，低配置机器继续使用原来的启动命令即可：

```bash
docker compose up -d --build
```

需要 QQ 扫码登录时，最简单的方式是直接：

```bash
./start.sh 2
```

它会按 CPU 架构选好 NapCat 镜像、把设备名固定为 `qq-farm-bot`、建好并授权
`data/napcat` 目录、写入下面这些配置，然后启动两个容器。

手动配置则复制示例配置：

```bash
cp .env.compose.example .env
```

在 `.env` 中设置：

```dotenv
COMPOSE_PROFILES=napcat
NAPCAT_LOGIN_ENABLED=true
```

随后执行 `./compose.sh up -d --build` 即可由 Compose 启动农场和 NapCat 两个服务。
QQ 登录记录中的设备名称默认为 `qq-farm-bot`；`.env` 与环境变量都没有配置
`NAPCAT_DEVICE_NAME` 时，`compose.sh` 才会回退使用 macOS 或 Linux 宿主机名。构建 NapCat
派生镜像时自动安装 OpenAuth 插件，容器首次启动会生成内部随机 Token，并通过只读文件提供给农场
后端，不需要在环境变量中保存密钥。更新农场或插件代码后仍使用同一条命令，不需要手动运行安装
脚本。NapCat 的配置、内部 Token 和 QQ 登录数据保存在 `./data/napcat/`。
如需覆盖自动检测结果，可在 `.env` 中设置 `NAPCAT_DEVICE_NAME`；建议只使用英文字母、数字和
连字符，并在首次登录后保持不变。修改已有部署的名称后，需要重新创建 NapCat 容器才会生效。

默认基础镜像为 `mlikiowa/napcat-docker:v4.18.19`。官方镜像支持 `linux/amd64` 和
`linux/arm64`，覆盖常见的 x64 Linux、ARM Linux、Intel Mac 和 Apple Silicon Mac；macOS
通过 Docker Desktop 运行相应 Linux 架构镜像。官方没有 32 位 `linux/386` 镜像。可在 `.env`
中通过 `NAPCAT_IMAGE` 选择示例文件列出的其他多架构版本。

### 微信扫码

1. 进入“添加账号 → 微信扫码”。
2. 页面会自动生成二维码；也可以点击二维码空态或“获取/刷新二维码”。
3. 使用手机微信扫码，并在应用宝授权页确认。
4. 授权成功后账号会自动添加、开启 Code 刷新并启动。

微信扫码会话与当前面板用户绑定。若凭证已被微信撤销、长时间停机后过期或手机重新授权导致旧会话失效，需要重新扫码。

账号建立 WebSocket 连接后，Bot 会读取登录回包和心跳回包中的 `version_force` 或 `version_recommend`。检测到符合格式的完整版本（例如 `1.13.1.6_20260723`）时，会自动更新“系统配置 → 客户端版本”，后续连接直接使用该值。强制版本优先于推荐版本，日期部分来自服务端原始版本，不会按本机当天日期生成。

### 手机抓包

iPhone及安卓用户也可使用内置抓包登录服务自动获取登录 Code，并同步 QQ 平台好友。

抓包基本流程：

1. 确认“系统配置 → Code/GID 抓取服务”中的抓包登录已开启（默认开启）。
2. 进入“添加账号 → 抓包登录”，点击“开始抓取”。
3. 按页面提示安装并信任 CA 证书，设置手机 Wi-Fi 代理。
4. 完全关闭并重新打开 QQ 农场，等待面板获取 Code。
5. 完成后关闭手机 Wi-Fi 代理。

证书安装、局域网和 Tailscale 配置请查看[抓包登录服务手册](core/docs/capture-service.md)。

## 🔍 抓包协议分析

抓到 HAR 或网关帧目录后，用下面两条命令做解码与兼容性核对（脚本都在 `tools/` 下，
不需要额外装 tsx / typescript）：

```bash
# 解码指定抓包目录中的协议帧
node tools/decode-latest-protocols.js <capture-dir>

# 检查抓包 RPC 与本地 Protobuf 定义的兼容性
node tools/audit-capture-compatibility.js <capture-dir>
```

两个命令都支持 `inspect:protocol` 的全部选项（`--service` / `--method` / `--direction` /
`--shape` / `--audit` / `--decrypt-requests` / `--show-sensitive` / `--pretty`），
内部直接委派给 `core/scripts/inspect-protocol-capture.js`。
更多用法见 [工具脚本](docs/tools.md)。

## 🔌 连接网关（可选）

把「握连接」和「跑业务」拆成两个进程后，**改代码重启 worker 不会掉线，也不用重新扫码**——
连接和凭证都留在网关进程里。

```bash
# .env 或启动脚本里加一行即可开启，默认关闭
FARM_NETWORK_MODE=gateway
```

顺手还带了两级「假死」处理：连续 2 次请求没回音就先**让路**（停业务、只留心跳），
累计到 7 次才判死重连——判定故意做得慢，因为大部分「卡死」其实是连接还活着，
急着重连只会白扔一个凭证。

细节见 [连接网关：连接与业务分离](docs/gateway-process.md)。

## 🛠️ 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev:core` | 启动后端和已构建的管理面板 |
| `pnpm dev:web` | 启动前端开发服务器 |
| `pnpm build:web` | 构建前端 |
| `pnpm lint` | 检查前后端代码 |
| `pnpm -C core test` | 运行后端测试 |
| `pnpm package:release` | 构建各平台二进制文件 |

二进制构建产物位于 `core/dist/`。首次运行时，程序会在数据目录中生成账号、日志和缓存等文件。

## 🗺️ 农场地图

```text
qq-farm-bot/
├── core/                 # 后端、自动化引擎及协议实现
│   ├── docs/             # 登录、活动与 TSDK 维护文档
│   ├── src/              # 配置、接口、模型和业务服务
│   └── test/             # 后端测试
├── web/                  # Vue 管理面板
├── docs/images/          # README 图片资源
├── docker-compose.yml
└── package.json
```

## 📚 项目文档

专题说明统一收录在 [`docs/`](docs/)：

- [工具脚本](docs/tools.md)
- [连接网关：连接与业务分离](docs/gateway-process.md)
- [网络并发模型](docs/network-concurrency.md)
- [TSDK 运行约定](docs/tsdk-runtime.md)
- [配置存储、迁移与缓存](docs/config-storage.md)
- [游戏版本与资源对齐](docs/game-update-20261031.md)
- [雨落成诗活动协议与实现](docs/weather-activity.md)
- [神秘商人、游戏商城与购买协议](docs/shop-protocols.md)
- [好友宠物缓存与每日同步](docs/friend-pet-cache.md)
- [个人页宠物协议](docs/pet-protocols.md)

其他运行手册：

- [iPhone 抓包登录服务](core/docs/capture-service.md)
- [限时活动适配手册](core/docs/activity-update-runbook.md)
- [TSDK/WASM 更新手册](core/docs/tsdk-update-runbook.md)
- [TSDK/ACE 运行机制](core/docs/tsdk-ace-runtime.md)

## 🔒 数据与安全

`core/data/` 及 Docker 持久化目录可能包含账号、用户、登录日志、好友缓存和统计数据。请妥善备份，并避免提交到公开仓库。

以下内容不应提交：

- 运行时数据与账号信息
- `.env` 及其他密钥文件
- 日志、缓存和临时文件
- `node_modules/` 与构建产物

## 📌 免责声明
本项目仅供学习与研究用途。使用本工具可能违反游戏服务条款，由此产生的一切后果由使用者自行承担。

**盈利声明**
-  本项目为开源学习项目，任何形式的付费倒卖、源码售卖、付费代部署、收费授权、付费二开等行为均与作者无关。
- 作者自身以及从未授权任何第三方以任何形式向他人收费或牟利。若你通过付费渠道获取本项目，请知悉该费用与作者无关。
- 因倒卖、二次转售造成的损失、账号风险或纠纷，均与作者无关，请自行联系售卖者。

**风险说明**：
- 部署、使用本项目产生的任何封号、数据丢失、法律或其他后果，均由使用者自行承担，作者不作任何担保。

# QQ 农场智能助手 __TAG__

构建时间：__DATE__（北京时间）

## 下载哪个包

| 文件 | 平台 | 类型 | 说明 |
| --- | --- | --- | --- |
| `qq-farm-bot-v__VERSION__-win-x64-full.zip` | Windows | 完整部署包 | 已内置构建好的前端，解压后双击 `start.bat` |
| `qq-farm-bot-v__VERSION__-win-x64-source.zip` | Windows | 源码包 | 纯源码，`start.bat` 会在首次启动时构建前端（耗时更长） |
| `qq-farm-bot-v__VERSION__-linux-x64-full.zip` | Linux | 完整部署包 | 已内置构建好的前端，`./start.sh` 一键安装启动 |
| `qq-farm-bot-v__VERSION__-linux-x64-source.zip` | Linux | 源码包 | 纯源码，`./start.sh` 首次启动时构建前端 |

> 两个平台各两个包，功能完全一致，区别只有启动脚本和「前端是否已经构建好」。

## 启动方式

**Windows**：解压后进入目录，双击 `start.bat`（需要 Node.js 20 及以上；没有 pnpm 会自动用 corepack）。停止服务双击 `stop.bat`。

**Linux**：解压后进入目录，执行 `chmod +x start.sh && ./start.sh`，按提示选择「默认版」或「QQ 登录版」（后者需要 Docker）。

启动后浏览器打开 `http://<服务器IP>:3007`（本机是 http://localhost:3007 ）。

## 🔑 管理后台账号密码在哪里看

1. **账号**：默认 `admin`，可在项目根目录 `.env` 里用 `FARM_ADMIN_USERNAME` 修改。
2. **密码**：在**项目根目录的 `.env` 文件**里，看 `FARM_ADMIN_PASSWORD` 这一行。
3. 首次启动脚本会自动生成随机密码并写入 `.env`：
   - Linux：`./start.sh` 会把账号密码打印在终端里（绿色「初始管理员账号」方框），之后随时 `cat .env` 查看。
   - Windows：`start.bat` 首次运行会调用 `core\scripts\init-env.js` 生成 `.env` 并打印账号密码，之后用记事本打开 `.env` 查看。
4. **注意**：`.env` 里的密码只在**第一次创建管理员**时生效。如果 `core/data/users.json`（Docker 模式是 `./data/users.json`）里已经有 `admin`，请继续使用旧密码。
5. **忘记密码**（先停止服务）：

   Windows：
   ```
   cd core
   node scripts/reset-admin-password.js 新密码
   ```
   Linux：
   ```
   cd core && node scripts/reset-admin-password.js 新密码
   # 也可以直接：./start.sh reset-admin
   ```
   Docker：`docker compose run --rm --entrypoint node qq-farm-bot scripts/reset-admin-password.js 新密码`
6. 完全没有 `.env` 而直接跑 `pnpm -C core dev` 时，内置默认口令是 `admin123`（仅供本地调试，公网部署务必改掉）。

## 其他说明

- 运行数据（用户、卡密、账号配置）在 `core/data/`；Docker 模式在 `./data/`。升级时保留该目录即可。
- 压缩包里不含 `.env`、`node_modules`、`core/data`，可以覆盖解压升级而不丢数据。
- 更新内容见 [docs/CHANGELOG.md](https://github.com/BUGDey/qq-farm-bot/blob/main/docs/CHANGELOG.md)，面板登录页的「更新日志」也有完整历史记录。
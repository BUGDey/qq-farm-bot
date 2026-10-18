# 部署运维 + 多用户与卡密体系

来源：`docs/部署说明.md` + `docs/多用户与卡密系统.md`。

## 一、部署

部署入口只有一个：**项目根目录的 `start.sh`**。把项目整个目录放到服务器，执行它会弹出菜单，
选完自动装依赖、构建、启动。旧版 `deploy.sh` 已合并进 `start.sh`，保留它只是做转发兼容。

```bash
git clone <仓库地址> <部署目录>      # 或打包上传解压
cd <部署目录>
chmod +x start.sh
./start.sh
```

菜单：

```text
  1) 默认版      仅农场服务（占用少，推荐低配机器）
  2) QQ 登录版    额外启动 NapCat，支持面板内 QQ 扫码登录
  0) 退出
```

跳过菜单：`./start.sh 1`（等价 `default`）、`./start.sh 2`（等价 `qq`）。

要求：Linux（amd64 / arm64 均可）、Node.js 20+ 或 Docker 20+。
**想用 QQ 扫码登录就必须有 Docker**（NapCat 只能跑容器）。

### QQ 登录版自动做的事

| 项 | 说明 |
| --- | --- |
| `NAPCAT_LOGIN_ENABLED=true` | 打开面板里的 QQ 扫码登录入口 |
| `COMPOSE_PROFILES=napcat` | 让 compose 一并启动 NapCat 容器 |
| `NAPCAT_DEVICE_NAME` | 取宿主机 hostname |
| `NAPCAT_IMAGE` | `x86_64` → `v4.18.19`，`arm64` → `latest` |
| `NAPCAT_UID/GID=1000` + 目录属主 | 建 `data/napcat/{config,QQ,auth}` 并 chown |
| 等待就绪 | 轮询 `data/napcat/auth/token` |

扫码：面板 → 账号管理 → 添加账号 → 「QQ 扫码登录」→ 手机 QQ 扫码确认。
首次拉镜像通常 1-3 分钟。**NapCat WebUI 只监听 `127.0.0.1:6099`，不对公网放行是故意的**；
需要远程访问走 SSH 隧道 `ssh -L 6099:127.0.0.1:6099 root@服务器`。
切回默认版执行 `./start.sh 1` 会自动关掉 NapCat，不留孤儿容器配置。

### 端口与目录

放行 `3007/tcp`（firewalld / ufw / 云安全组）。

```text
<部署目录>
├── start.sh / deploy.sh / docker-compose.yml
├── .env                首次运行自动生成（含随机 admin 密码）
├── core/   web/   napcat/
└── data/               ★ 全部业务数据（Docker 模式）
    ├── users.json  cards.json  redemptions.json  accounts.json
    ├── napcat/     logs/
```

> Node 直跑模式数据在 `core/data`，Docker 模式在 `./data`；切换时 `start.sh` 会提示迁移。

### 常用运维命令

```bash
./start.sh status | logs | restart | stop | dev
docker compose logs -f --tail=200
systemctl restart qq-farm-bot        # Node + systemd 模式
journalctl -u qq-farm-bot -f
```

**改了 `.env` 后必须 `./start.sh restart`。**

更新到新版本（保留数据）：

```bash
cp -r data data.bak.$(date +%F)
./start.sh stop
git pull                            # data/ 不要动
./start.sh                          # 再选一次原来的模式
```

### 生产环境建议

- Nginx 反向代理 + HTTPS，`client_max_body_size 20m`，WebSocket 需 `Upgrade`/`Connection` 头，
  `proxy_read_timeout 300s`。
- 上线前必改：`.env` 的 `FARM_ADMIN_PASSWORD`、面板里改 admin 密码、
  `FARM_ALLOW_REGISTER=false`、`NAPCAT_WEBUI_HOST=127.0.0.1`（默认已是，别改成 0.0.0.0）。
- 定时备份：`0 3 * * * cd <部署目录> && tar -czf <备份目录>/farm-$(date +\%F).tar.gz data`，
  保留 7 天。

### 部署常见问题

| 问题 | 处理 |
| --- | --- |
| 选 2 却提示必须装 Docker | NapCat 无法用 Node 直跑；`curl -fsSL https://get.docker.com \| sh` 或改用模式 1 |
| NapCat 一直不就绪 | `./start.sh status` + `docker compose logs napcat --tail=100`；换 `mlikiowa/napcat-docker:latest`；ARM 别写死 `v4.18.19`；手动改过目录则 `chown -R 1000:1000 data/napcat` |
| 以前免登录现在要登录 | 正常。多用户体系启用后 `/api/auto-login` 返回 403；要回单机免登录设 `FARM_USER_SYSTEM_ENABLED=false` |
| 忘了 admin 密码 | 见下方"重置密码"。注意 `.env` 里的密码**只对首次启动生效** |
| 迁移旧数据后用新密码登录不上 | `data/users.json` 里已有 admin 则以库里哈希为准；用旧密码或重置 |
| 登录提示"剩余尝试次数" | 防爆破锁定（5 次/15 分钟），重置后立即可登，否则等 15 分钟 |
| Docker 构建报 pnpm/网络错误 | `core/Dockerfile` 镜像源是 `docker.1ms.run/library/node:20-alpine`（国内加速）；境外机器把三处 FROM 改成 `node:20-alpine` |
| ARM 机器能跑吗 | 能。Node 多架构镜像 + NapCat arm64 + `start.sh` 自动选镜像 |

重置密码：

```bash
# Docker 模式
docker compose stop
docker compose run --rm --entrypoint node qq-farm-bot scripts/reset-admin-password.js '<新密码>'
docker compose start

# Node 模式
cd core && FARM_DATA_DIR=$PWD/data node scripts/reset-admin-password.js '<新密码>' admin

# 重置普通用户
node scripts/reset-admin-password.js 新密码 用户名
```

确认多用户体系是否生效：

```bash
curl -s http://127.0.0.1:3007/api/login -H 'content-type: application/json' \
  -d '{"username":"admin","password":"错误密码"}'    # 应返回 401
curl http://127.0.0.1:3007/api/auto-login -X POST    # 应返回 403
```

## 二、多用户与卡密体系

> 基于 `xxxscarlxrd404/qq-farm-bot` 实现，用户/卡密模型参考 `Aoluis1005/qq-farm-bot`。
> 原有自动挂机逻辑（runtime / services / provider）**未做任何改动**，本套体系只叠加在
> 管理面板的认证、授权与农场账号归属层之上。

### 能力矩阵

注册登录（必须绑定一张加时卡，卡密面值决定初始有效期）、到期限制、卡密系统
（生成/发放/核销/禁用/作废/删除，区分加时卡与额度卡）、多用户账号隔离、
管理员后台、三层权限隔离。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `core/src/config/user-system.js` | 全部配置项与枚举 |
| `core/src/models/user-store.js` | 数据层（重写） |
| `admin-auth-routes.js` | 登录/注册/续费/改密/找回密码/卡密预览 |
| `admin-session-manager.js` | 会话复查（禁用/过期/超时 → 强制登出） |
| `admin-account-access.js` | 账号归属（`owner` 优先，兼容 `username`） |
| `admin-user-routes.js` / `admin-card-routes.js` / `admin-login-log-routes.js` | 新增的三组管理接口 |
| `web/src/stores/user.ts` / `views/Login.vue` / `AdminPanel.vue` / `Renewal.vue` | 前端 |

### 数据存储（JSON 文件 + 原子写）

落在 `data/`（可用 `FARM_DATA_DIR` 重定向），写入走 `services/json-db.js` 的
临时文件 + rename原子写。

- `users.json` —— 用户表。密码 `PBKDF2-SHA512, 100000 iter, 64B`，格式 `<salt>:<hash>`，永不明文。
  角色 `user | admin | super_admin`。`accountLimit` 为可添加农场账号数，**`-1` = 不限**（管理员恒为 -1）。
  `subscription`（对外同时以 `card` 别名输出以兼容旧字段）含 `expiresAt`（null = 永久/未激活）、
  `isPermanent`、`enabled`（false = 封禁）、`source`、`activatedAt`、`totalAddedMs`。
- `cards.json` —— 卡密表。`type`：`time` 加时卡 / `quota` 额度卡；
  code 为 4 组 × 4 位，字母表**剔除 0/O/1/I**；
  `enabled` + `revoked` 派生出 `status`：`unused | used | disabled | revoked`。
- `card-redemptions.json` —— 核销流水，含 before/after 快照。
- `login-attempts.json`、`login-logs.json`、`card-claim.json`。
- `accounts.json` —— 原结构不变，新增 `owner`；`store.json` 不变。

### 有效期计算（关键业务规则）

统一由 `computeNextExpiry(currentSubscription, duration, now)` 决定：

1. **永久优先**：本次是永久卡，或账号已是永久 → `expiresAt = null, isPermanent = true`，
   后续任何加时都不改变。
2. **未过期**：在剩余有效期上**顺延** → `expiresAt = 原expiresAt + durationMs`。
3. **已过期 / 首次激活**：从当前时间重新起算 → `expiresAt = now + durationMs`。

管理员 `isPermanent = true`（内置管理员永不失效）。
额度卡**不影响**有效期，只做 `accountLimit += value`（`-1` 保持不变）。

### 卡密核销

`redeemCard(username, code, { operator, allowQuota, allowTime })` 原子流程：
校验存在 → 未作废 → 未禁用 → 未使用 → 类型匹配（注册只允许加时卡）→
改用户 → 卡密落锁（`usedBy`/`usedAt`/`status=used`）→ 写流水 → 落盘。

**作废（revoke）只标记 `revoked + enabled=false`，不会回滚已发生的有效期/额度变更**，
并写一条 `action=revoke` 流水；作废后该卡不可再核销。

### 权限与数据隔离（三层，缺一不可）

1. **网关层**（`admin.js`）：`/api/*` 默认要求 `x-admin-token`；白名单放行 `/login`、`/register`、
   `/card/info/*`、`/public/*`、`/card-claim/*`、`/health`。
2. **会话层**：`requireAdminToken` 每次请求复查 → 无 token(401) / 已禁用(403) / 已过期(403) /
   会话超时(403)，命中即作废 token 并断开 WebSocket。管理员与超管豁免有效期检查。
   另有 5 分钟一次的 `cleanupInvalidAdminSessions`。
3. **数据层**：`requireAdminRole`、`requireSuperAdminRole`、`getAdminUserMutationError`
   （阻止普通管理员改动其他管理员账号，超管不受限）。

**角色变更规则**（`POST /api/admin/users/:username/edit`，仅当角色真的变化时校验）：

| 场景 | 结果 |
| --- | --- |
| 改自己的角色 | 400「不能修改自己的角色，以免把自己锁在门外」（前端禁用该下拉框） |
| 授予 `super_admin` | 仅超管可操作，否则 403 |
| 调整**其他管理员**的角色 | 仅超管可操作，否则 403 |
| 普通用户 ↔ `admin` | 管理员即可，成功后额度自动置为不限 |

> **危险操作确认**：删除、作废、改有效期、代续费等破坏性接口，请求体需带 `confirmed: true`，
> 否则返回 400 + `requiredConfirmation`。

### 登录安全

| 规则 | 默认值 | 环境变量 |
| --- | --- | --- |
| 同一账号连续失败 5 次锁定 15 分钟 | 5 / 15 | `FARM_MAX_LOGIN_ATTEMPTS` / `FARM_LOCKOUT_MINUTES` |
| 同一 IP 1 分钟内失败 10 次锁定 10 分钟 | 10 / 10 | `FARM_IP_MAX_ATTEMPTS` / `FARM_IP_LOCKOUT_MINUTES` |
| 密码强度 | ≥6 位、含两类字符、非弱口令 | — |
| 会话有效期 | 7 天（普通用户） | `FARM_SESSION_TTL_MS`（0 = 不过期） |

### 常用环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `FARM_USER_SYSTEM_ENABLED` | `true` | 关闭后退化为单机模式 |
| `FARM_ALLOW_REGISTER` | `true` | 是否开放自助注册 |
| `FARM_ALLOW_PUBLIC_RENEW` | `true` | 是否开放免登录续费 |
| `FARM_ALLOW_PUBLIC_RESET_PASSWORD` | `true` | 是否开放卡密找回密码 |
| `FARM_CARD_CLAIM_ENABLED` | `false` | 卡密自助领取开关 |
| `FARM_DEFAULT_ACCOUNT_LIMIT` | `1` | 新用户默认农场账号数 |
| `FARM_ADMIN_USERNAME` / `FARM_ADMIN_PASSWORD` | `admin` / `admin123` | 内置管理员，**部署后务必改** |
| `FARM_BOOTSTRAP_ADMIN_AS_SUPER` | `true` | **不要改成 false**，否则没人能改角色 |
| `FARM_SUPER_ADMIN_USERNAME` / `_PASSWORD` | 空 | 额外超管（走环境变量，不落库） |
| `FARM_LOGIN_LOG_LIMIT` | 5000 | 登录日志保留条数 |
| `FARM_DATA_DIR` | `<项目>/data` | 数据目录 |
| `ADMIN_PORT` | 3007 | 面板端口 |

### 测试

```bash
cd core
node --test test/user-store.test.js
node --test test/user-store.test.js test/admin-multi-user.test.js   # 43 条
```

覆盖：引导管理员、3 天卡注册、额度卡禁止注册、卡密一次性、未过期顺延、已过期重新起算、
永久卡、额度累加、额度校验、作废、登录锁定、过期判定、核销流水、改有效期、
清理过期用户（不删管理员）、改密码。

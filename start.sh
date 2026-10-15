#!/usr/bin/env bash
#
# QQ 农场智能助手 —— Linux 一键部署 / 启动脚本
#
# 用法：
#   ./start.sh              # 交互菜单（默认版 / QQ 登录版）
#   ./start.sh 1            # 默认版：仅农场服务
#   ./start.sh 2            # QQ 登录版：额外启动 NapCat，支持面板内 QQ 扫码登录
#   ./start.sh dev          # 本地开发模式（pnpm dev，前台运行）
#
#   ./start.sh stop         # 停止服务
#   ./start.sh restart      # 重启服务
#   ./start.sh logs         # 查看日志
#   ./start.sh status       # 查看状态
#
# 说明：默认版即原先 deploy.sh 直接执行的效果（有 Docker 走 Compose，否则 Node 直跑）。
#      QQ 登录版依赖 NapCat 容器，必须使用 Docker。
#
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

PORT="${ADMIN_PORT:-3007}"
NAPCAT_PORT="${NAPCAT_WEBUI_PORT:-6099}"
# NapCat 设备名（QQ 登录记录里显示的名字），固定为 qq-farm-bot，可在 .env 中覆盖
DEFAULT_NAPCAT_DEVICE_NAME="${NAPCAT_DEVICE_NAME:-qq-farm-bot}"

C_CYAN='\033[36m'; C_GREEN='\033[32m'; C_YELLOW='\033[33m'; C_RED='\033[31m'; C_BOLD='\033[1m'; C_OFF='\033[0m'
log()  { printf "${C_CYAN}[INFO]${C_OFF} %s\n" "$*"; }
ok()   { printf "${C_GREEN}[ OK ]${C_OFF} %s\n" "$*"; }
warn() { printf "${C_YELLOW}[WARN]${C_OFF} %s\n" "$*"; }
err()  { printf "${C_RED}[ERR ]${C_OFF} %s\n" "$*" >&2; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

# 打印提示语。注意：必须单独调用，不能放在 $(...) 里，否则提示语会被当作返回值捕获
prompt() {
  printf '%s' "$1"
}

# 读取用户输入，回车用默认值；非交互（管道/定时任务）直接返回默认值，避免卡住
# 返回值只含输入内容本身，提示语请用 prompt 单独打印
ask() {
  local default="$1" ans=""
  if [ -t 0 ]; then
    read -r ans || ans=""
  fi
  ans="${ans//[[:space:]]/}"    # 容忍粘贴带来的空格 / CR
  printf '%s' "${ans:-$default}"
}

DOCKER_COMPOSE=()

# ==================== 环境检测 ====================

detect_docker() {
  if ! has_cmd docker; then
    return 1
  fi
  if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE=(docker compose)
  elif has_cmd docker-compose; then
    DOCKER_COMPOSE=(docker-compose)
  else
    err "检测到 docker 但没有 compose 插件，请先安装 docker compose plugin"
    return 1
  fi
  if ! docker info >/dev/null 2>&1; then
    err "Docker 守护进程不可用（权限不足？请把当前用户加入 docker 组，或用 sudo 执行）"
    return 1
  fi
  return 0
}

random_password() {
  if has_cmd openssl; then
    openssl rand -base64 18 | tr -d '/+=' | head -c 16
  else
    head -c 128 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 16
  fi
  echo
}

port_in_use() {
  if has_cmd lsof; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  elif has_cmd ss; then
    ss -ltn 2>/dev/null | grep -q ":$1 "
  else
    return 1
  fi
}

# ==================== .env 处理 ====================

set_env_var() {
  local key="$1" val="$2"
  touch .env
  if grep -qE "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  elif grep -qE "^#[[:space:]]*${key}=" .env; then
    sed -i "s|^#[[:space:]]*${key}=.*|${key}=${val}|" .env
  else
    printf '\n%s=%s\n' "$key" "$val" >> .env
  fi
}

prepare_env() {
  FRESH_ENV=0
  if [ -f .env ]; then
    log "已存在 .env，保留现有配置"
    return
  fi
  FRESH_ENV=1
  ADMIN_INIT_PWD="$(random_password)"
  cat > .env <<EOF
# 由 start.sh 自动生成于 $(date '+%F %T')
# 修改后需重启服务生效：./start.sh restart

# ---- 多用户账号与卡密体系 ----
FARM_USER_SYSTEM_ENABLED=true
FARM_ADMIN_USERNAME=admin
FARM_ADMIN_PASSWORD=${ADMIN_INIT_PWD}
FARM_ALLOW_REGISTER=true
FARM_ALLOW_PUBLIC_RENEW=true
FARM_ALLOW_PUBLIC_RESET_PASSWORD=true
FARM_DEFAULT_ACCOUNT_LIMIT=1
# 内置管理员默认拥有超级管理员权限；关闭后必须另行配置超管
FARM_BOOTSTRAP_ADMIN_AS_SUPER=true
# 超级管理员（可选，取消注释并填写后启用，权限高于普通管理员）
# FARM_SUPER_ADMIN_USERNAME=superadmin
# FARM_SUPER_ADMIN_PASSWORD=ChangeMe@2026

# ---- NapCat（QQ 扫码登录）----
# 默认关闭。执行 ./start.sh 2 会自动改为 true 并启用 napcat 容器
NAPCAT_LOGIN_ENABLED=false
NAPCAT_IMAGE=mlikiowa/napcat-docker:v4.18.19
# QQ 登录记录里显示的设备名（只用字母/数字/连字符；修改后需重建 NapCat 容器才生效）
NAPCAT_DEVICE_NAME=${DEFAULT_NAPCAT_DEVICE_NAME}
EOF
  ok "已生成 .env"
}

# 部署结束后打印登录凭据提示。
# 关键：.env 里的 FARM_ADMIN_PASSWORD 只在 users.json 尚无 admin 时生效；
# 迁移/复用旧数据时旧密码仍然有效，必须提醒，否则会出现「用新密码登录不上」。
print_admin_credentials() {
  local users_file="$1"
  local admin_name
  admin_name="$(grep -E '^FARM_ADMIN_USERNAME=' .env 2>/dev/null | head -1 | cut -d= -f2-)"
  admin_name="${admin_name:-admin}"

  if [ -f "$users_file" ] && grep -qE "\"username\"[[:space:]]*:[[:space:]]*\"${admin_name}\"" "$users_file" 2>/dev/null; then
    warn "检测到已存在的 ${admin_name} 账号（${users_file}）"
    warn "本次生成的初始密码【不会】生效，请使用旧密码登录（.env 密码只在首次创建时生效）"
    warn "忘记旧密码时，重置后重启："
    if [ "${DEPLOY_MODE:-}" = "docker" ]; then
      warn "  docker compose stop qq-farm-bot"
      warn "  docker compose run --rm --entrypoint node qq-farm-bot scripts/reset-admin-password.js '新密码'"
      warn "  docker compose start"
    else
      warn "  cd core && FARM_DATA_DIR=${APP_DIR}/core/data node scripts/reset-admin-password.js '新密码'"
      warn "  然后: systemctl restart qq-farm-bot（或 ./start.sh stop && ./start.sh 1）"
    fi
    return
  fi

  if [ "$FRESH_ENV" = "1" ]; then
    printf "${C_GREEN}================ 初始管理员账号 ================${C_OFF}\n"
    printf "  用户名: ${C_GREEN}%s${C_OFF}\n" "$admin_name"
    printf "  密  码: ${C_GREEN}%s${C_OFF}\n" "$ADMIN_INIT_PWD"
    printf "${C_GREEN}================================================${C_OFF}\n"
    printf "${C_YELLOW}请登录后立即在管理后台修改密码！${C_OFF}\n"
  else
    log "登录凭据使用现有 .env 的 FARM_ADMIN_PASSWORD（若面板里改过密码则以改后为准）"
  fi
}

# ==================== NapCat（QQ 扫码登录）配置 ====================

detect_napcat_image() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) echo "mlikiowa/napcat-docker:v4.18.19" ;;
    aarch64|arm64) echo "mlikiowa/napcat-docker:latest" ;;
    *) echo "mlikiowa/napcat-docker:latest" ;;
  esac
}

enable_napcat() {
  log "配置 NapCat（QQ 扫码登录）..."

  # 设备名固定为 "qq-farm-bot"（QQ 登录记录里显示的那个名字）。
  # 只有当用户手动在 .env 里改过（既不是项目名也不是旧版自动取的主机名）时才保留用户的值。
  local device_name="${DEFAULT_NAPCAT_DEVICE_NAME}"
  local current host_name
  current="$(grep -E '^NAPCAT_DEVICE_NAME=' .env 2>/dev/null | head -1 | cut -d= -f2-)"
  host_name="$( { hostname -s 2>/dev/null || hostname 2>/dev/null || true; } 2>/dev/null )"
  if [ -n "$current" ] && [ "$current" != "${DEFAULT_NAPCAT_DEVICE_NAME}" ] && [ -n "$host_name" ] && [ "$current" != "$host_name" ]; then
    device_name="$current"
    log "保留你在 .env 中自定义的设备名: ${device_name}"
  fi
  set_env_var "NAPCAT_LOGIN_ENABLED" "true"
  set_env_var "NAPCAT_DEVICE_NAME" "${device_name}"
  set_env_var "NAPCAT_IMAGE" "$(detect_napcat_image)"
  set_env_var "NAPCAT_UID" "1000"
  set_env_var "NAPCAT_GID" "1000"

  # 让 compose 默认带上 napcat profile，后续 stop/logs/status 也能看到该服务
  set_env_var "COMPOSE_PROFILES" "napcat"

  ok "NapCat 已启用（设备名: ${device_name}，镜像: $(detect_napcat_image)）"
}

# 切回默认版时把 NapCat 关掉，避免 profile 残留在 .env 里
disable_napcat() {
  [ -f .env ] || return 0
  if grep -qE '^COMPOSE_PROFILES=.*napcat' .env; then
    log "默认版不启动 NapCat，正在关闭（需要 QQ 扫码登录时执行 ./start.sh 2）"
    sed -i '/^COMPOSE_PROFILES=/d' .env
    set_env_var "NAPCAT_LOGIN_ENABLED" "false"
  fi
}

prepare_napcat_dirs() {
  mkdir -p "${APP_DIR}/data/napcat/config" "${APP_DIR}/data/napcat/QQ" "${APP_DIR}/data/napcat/auth"
  mkdir -p "${APP_DIR}/data/logs"
  # NapCat 容器以 NAPCAT_UID/NAPCAT_GID 运行，root 建出来的目录它写不进去
  if [ "$(id -u)" -eq 0 ]; then
    chown -R "${NAPCAT_UID_SEL:-1000}:${NAPCAT_GID_SEL:-1000}" "${APP_DIR}/data/napcat" 2>/dev/null || true
  fi
  ok "NapCat 数据目录已就绪: ${APP_DIR}/data/napcat"
}

wait_napcat_ready() {
  local token_file="${APP_DIR}/data/napcat/auth/token"
  log "等待 NapCat 启动（首次需拉取镜像，通常 1-3 分钟）..."
  local i
  for i in $(seq 1 60); do
    if [ -s "$token_file" ]; then
      ok "NapCat 已就绪"
      return 0
    fi
    if [ $((i % 6)) -eq 0 ]; then
      log "  仍在等待...（已等待 $((i * 5)) 秒）"
    fi
    sleep 5
  done
  warn "NapCat 超过 5 分钟仍未就绪，请检查容器状态与日志："
  warn "  ./start.sh status"
  warn "  ${DOCKER_COMPOSE[*]} logs napcat --tail=100"
  warn "常见原因：镜像拉取失败（网络）、架构不匹配（ARM 需 NAPCAT_IMAGE=mlikiowa/napcat-docker:latest）"
  return 0
}

# Node 模式的历史数据在 core/data，Docker 模式挂载 ./data，切换时提醒迁移
maybe_migrate_data() {
  if [ -d "${APP_DIR}/core/data" ] && [ ! -d "${APP_DIR}/data" ]; then
    warn "检测到 Node 模式的数据目录 core/data，而 Docker 模式使用 ./data"
    prompt "是否迁移到 ./data 供 Docker 使用？(y/N) "
    local ans
    ans="$(ask "N")"
    if [[ "$ans" =~ ^[Yy]$ ]]; then
      mv "${APP_DIR}/core/data" "${APP_DIR}/data"
      ok "已迁移 core/data -> data"
    else
      warn "未迁移：Docker 将使用空的 ./data（用户/卡密数据会是空的）"
    fi
  fi
}

# ==================== Docker 模式 ====================

deploy_docker() {
  local with_napcat="${1:-false}"
  DEPLOY_MODE=docker
  detect_docker || { err "未检测到可用的 Docker，请改用: $0 1"; exit 1; }
  prepare_env

  if [ "$with_napcat" = "true" ]; then
    enable_napcat
    maybe_migrate_data
    prepare_napcat_dirs
    if port_in_use "$NAPCAT_PORT"; then
      warn "端口 ${NAPCAT_PORT} 已被占用，NapCat WebUI 可能无法启动"
    fi
  else
    disable_napcat
    mkdir -p "${APP_DIR}/data/logs"
  fi

  log "构建并启动容器（首次构建约需 3-10 分钟）..."
  "${DOCKER_COMPOSE[@]}" up -d --build

  if [ "$with_napcat" = "true" ]; then
    wait_napcat_ready
  fi

  print_admin_credentials "${APP_DIR}/data/users.json"
  print_summary "$with_napcat"
}

# ==================== Node 模式 ====================

check_node() {
  if ! has_cmd node; then
    err "未检测到 Node.js，请先安装 Node.js 20+ (https://nodejs.org)"
    exit 1
  fi
  local ver
  ver="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [ "$ver" -lt 20 ]; then
    err "Node.js 版本过低（当前 $(node -v)），需要 20 及以上"
    exit 1
  fi
  ok "Node.js $(node -v)"
}

install_pnpm() {
  if has_cmd pnpm; then PNPM=(pnpm); return; fi
  if has_cmd corepack; then
    log "启用 corepack pnpm..."
    corepack enable >/dev/null 2>&1 || true
    if has_cmd pnpm; then PNPM=(pnpm); return; fi
  fi
  log "安装 pnpm..."
  npm install -g pnpm@10 >/dev/null 2>&1
  PNPM=(pnpm)
}

PNPM=()

install_systemd_service() {
  local unit=/etc/systemd/system/qq-farm-bot.service
  if ! has_cmd systemctl || [ ! -d /etc/systemd/system ]; then
    return 1
  fi
  if [ "$(id -u)" -ne 0 ]; then
    warn "非 root 用户，跳过 systemd 服务安装（将使用 nohup 后台启动）"
    return 1
  fi
  log "安装 systemd 服务..."
  cat > "$unit" <<EOF
[Unit]
Description=QQ Farm Bot (Admin Panel)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}/core
Environment=NODE_ENV=production
Environment=ADMIN_PORT=${PORT}
Environment=FARM_DATA_DIR=${APP_DIR}/core/data
Environment=TZ=Asia/Shanghai
EnvironmentFile=-${APP_DIR}/.env
ExecStart=$(command -v node) ${APP_DIR}/core/client.js
Restart=always
RestartSec=5
StandardOutput=append:${APP_DIR}/core/data/logs/bot.log
StandardError=append:${APP_DIR}/core/data/logs/bot.log

[Install]
WantedBy=multi-user.target
EOF
  mkdir -p "${APP_DIR}/core/data/logs"
  systemctl daemon-reload
  systemctl enable qq-farm-bot >/dev/null 2>&1
  systemctl restart qq-farm-bot
  ok "systemd 服务已安装并启动"
  log "查看日志: journalctl -u qq-farm-bot -f"
  log "重启服务: systemctl restart qq-farm-bot"
  return 0
}

start_by_nohup() {
  mkdir -p "${APP_DIR}/core/data/logs"
  if port_in_use "$PORT"; then
    ok "服务已在运行，端口 ${PORT}"
    return
  fi
  log "后台启动服务..."
  cd "${APP_DIR}/core"
  # 载入 .env（set -a 使所有赋值自动 export）
  set -a
  # shellcheck disable=SC1091
  [ -f "${APP_DIR}/.env" ] && . "${APP_DIR}/.env"
  set +a
  export ADMIN_PORT="${PORT}"
  export FARM_DATA_DIR="${APP_DIR}/core/data"
  export TZ=Asia/Shanghai NODE_ENV=production
  nohup node client.js >> "${APP_DIR}/core/data/logs/bot.log" 2>&1 &
  sleep 3
  cd "$APP_DIR"
  ok "已启动，日志：${APP_DIR}/core/data/logs/bot.log"
  log "停止：./start.sh stop"
}

deploy_node() {
  DEPLOY_MODE=node
  check_node
  prepare_env
  install_pnpm

  if [ ! -d core/node_modules ]; then
    log "安装后端依赖..."
    "${PNPM[@]}" -C core install --prod --frozen-lockfile
  else
    log "后端依赖已存在，跳过安装"
  fi

  if [ ! -f web/dist/index.html ]; then
    log "构建前端（需要安装前端依赖，耗时较长）..."
    "${PNPM[@]}" -C web install --frozen-lockfile
    "${PNPM[@]}" -C web build
  else
    ok "前端产物已存在，跳过构建"
  fi

  if ! install_systemd_service; then
    start_by_nohup
  fi

  print_admin_credentials "${APP_DIR}/core/data/users.json"
  print_summary "false"
}

# ==================== 本地开发模式 ====================

run_dev() {
  if command -v corepack >/dev/null 2>&1; then
    PNPM=(corepack pnpm)
  elif has_cmd pnpm; then
    PNPM=(pnpm)
  else
    err "未找到 pnpm 或 corepack，请先安装 Node.js 20+。"
    exit 1
  fi
  if port_in_use "$PORT"; then
    log "QQ 农场已在运行，端口：$PORT"
    log "面板：http://localhost:$PORT"
    exit 0
  fi
  if [[ ! -d core/node_modules || ! -d web/node_modules ]]; then
    log "正在安装项目依赖..."
    "${PNPM[@]}" install -r
  fi
  if [[ ! -f web/dist/index.html ]]; then
    log "正在构建前端..."
    "${PNPM[@]}" -C web build
  fi
  log "正在启动 QQ 农场（开发模式）..."
  log "面板：http://localhost:$PORT"
  exec env ADMIN_PORT="$PORT" "${PNPM[@]}" -C core dev
}

# ==================== 输出汇总 ====================

print_summary() {
  local with_napcat="$1"
  # hostname -I 在部分精简系统上不存在，不能让它在 set -e 下把脚本带崩
  local ip=""
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [ -z "$ip" ]; then
    ip="<服务器IP>"
  fi

  printf '\n'
  ok "部署完成"
  log "面板地址: http://${ip}:${PORT}"
  if [ "$with_napcat" = "true" ]; then
    printf '\n'
    printf "${C_BOLD}QQ 扫码登录用法：${C_OFF}\n"
    log "  面板 → 账号管理 → 添加账号 → 选择「QQ 扫码登录」→ 手机 QQ 扫描二维码"
    log "  NapCat WebUI: http://127.0.0.1:${NAPCAT_PORT}（仅本机可访问，需 SSH 隧道转发才能远程打开）"
    log "  首次扫码前请耐心等待 NapCat 容器完全启动（约 1-3 分钟）"
  fi
  log "查看日志: ./start.sh logs"
  log "停止服务: ./start.sh stop"
}

# ==================== 运维命令 ====================

compose_running() {
  detect_docker 2>/dev/null || return 1
  "${DOCKER_COMPOSE[@]}" ps -q 2>/dev/null | grep -q .
}

cmd_stop() {
  if compose_running; then
    "${DOCKER_COMPOSE[@]}" down
    ok "Docker 服务已停止"
  elif has_cmd systemctl && systemctl is-active qq-farm-bot >/dev/null 2>&1; then
    systemctl stop qq-farm-bot
    ok "systemd 服务已停止"
  else
    pkill -f "node .*client.js" 2>/dev/null && ok "进程已停止" || warn "未找到运行中的进程"
  fi
}

cmd_restart() {
  if compose_running; then
    "${DOCKER_COMPOSE[@]}" restart
    ok "Docker 服务已重启"
  elif has_cmd systemctl && systemctl is-active qq-farm-bot >/dev/null 2>&1; then
    systemctl restart qq-farm-bot
    ok "systemd 服务已重启"
  else
    cmd_stop
    log "重新启动..."
    if detect_docker 2>/dev/null && grep -qE '^COMPOSE_PROFILES=.*napcat' .env 2>/dev/null; then
      deploy_docker "true"
    elif detect_docker 2>/dev/null; then
      deploy_docker "false"
    else
      deploy_node
    fi
  fi
}

cmd_logs() {
  if compose_running; then
    "${DOCKER_COMPOSE[@]}" logs -f --tail=200
  elif has_cmd systemctl && systemctl is-active qq-farm-bot >/dev/null 2>&1; then
    journalctl -u qq-farm-bot -f --output=cat
  elif [ -f "${APP_DIR}/core/data/logs/bot.log" ]; then
    tail -f "${APP_DIR}/core/data/logs/bot.log"
  else
    warn "未找到日志文件"
  fi
}

cmd_status() {
  log "应用目录: ${APP_DIR}"
  if detect_docker 2>/dev/null; then
    "${DOCKER_COMPOSE[@]}" ps 2>/dev/null || true
  fi
  if has_cmd systemctl && systemctl is-active qq-farm-bot >/dev/null 2>&1; then
    systemctl status qq-farm-bot --no-pager | head -8
  fi
  if grep -qE '^NAPCAT_LOGIN_ENABLED=(1|true|yes|on)' .env 2>/dev/null; then
    if [ -s "${APP_DIR}/data/napcat/auth/token" ]; then
      ok "NapCat QQ 扫码登录：已启用且已就绪"
    else
      warn "NapCat QQ 扫码登录：已启用但尚未就绪（可能仍在启动）"
    fi
  else
    log "NapCat QQ 扫码登录：未启用（执行 ./start.sh 2 可开启）"
  fi
  if port_in_use "$PORT"; then
    ok "端口 ${PORT} 正在监听"
  else
    warn "端口 ${PORT} 未监听，服务可能未启动"
  fi
}

# ==================== 菜单 ====================

show_menu() {
  local tries=0
  while [ $tries -lt 3 ]; do
    tries=$((tries + 1))
    printf '\n'
    printf "${C_BOLD}QQ 农场智能助手 —— 请选择启动方式${C_OFF}\n"
    printf '\n'
    printf "  ${C_GREEN}1)${C_OFF} 默认版      仅农场服务（占用少，推荐低配机器）\n"
    printf "  ${C_GREEN}2)${C_OFF} QQ 登录版    额外启动 NapCat，支持面板内 ${C_BOLD}QQ 扫码登录${C_OFF}\n"
    printf "  ${C_GREEN}0)${C_OFF} 退出\n"
    printf "  ${C_YELLOW}提示：直接回车 = 默认版${C_OFF}\n"
    printf '\n'
    prompt "请输入序号: "
    local choice
    choice="$(ask "1")"
    printf '\n'
    case "$choice" in
      1|default|d) run_default; return ;;
      2|qq|napcat|n) run_with_qq; return ;;
      0|q|quit) log "已取消"; exit 0 ;;
      *) warn "无效选择: $choice（请输入 1、2 或 0）" ;;
    esac
  done
  err "连续 3 次输入无效，退出。你也可以直接执行 ./start.sh 1 或 ./start.sh 2"
  exit 1
}

# 默认版：有 Docker 用 Docker，否则 Node 直跑（等价原 deploy.sh 直接执行）
run_default() {
  log "启动模式：默认版（仅农场服务）"
  if detect_docker 2>/dev/null; then
    log "检测到 Docker，使用 Docker Compose 部署"
    deploy_docker "false"
  else
    warn "未检测到 Docker，使用 Node 直接运行部署"
    deploy_node
  fi
}

# QQ 登录版：必须 Docker（NapCat 只能容器化运行）
run_with_qq() {
  log "启动模式：QQ 登录版（农场服务 + NapCat 扫码登录）"
  if ! detect_docker 2>/dev/null; then
    err "QQ 登录版依赖 NapCat 容器，必须安装 Docker。"
    err "请先安装 Docker（https://docs.docker.com/engine/install/），或改用默认版：./start.sh 1"
    prompt "是否改用默认版继续？(y/N) "
    local ans
    ans="$(ask "N")"
    if [[ "$ans" =~ ^[Yy]$ ]]; then
      run_default
      return
    fi
    exit 1
  fi
  deploy_docker "true"
}

# ==================== 入口 ====================

ACTION="${1:-menu}"

case "$ACTION" in
  menu|"")      show_menu ;;
  1|default)    run_default ;;
  2|qq|napcat)  run_with_qq ;;
  dev)          run_dev ;;
  stop)         cmd_stop ;;
  restart)      cmd_restart ;;
  logs)         cmd_logs ;;
  status)       cmd_status ;;
  -h|--help|help)
    cat <<'EOF'
用法: ./start.sh [命令]

  菜单/启动
    (无参数)        交互菜单：1 默认版 / 2 QQ 登录版
    1 | default     默认版：仅农场服务（有 Docker 用 Compose，否则 Node 直跑）
    2 | qq          QQ 登录版：额外启动 NapCat，支持面板内 QQ 扫码登录（需要 Docker）
    dev             本地开发模式（pnpm dev，前台运行）

  运维
    stop            停止服务
    restart         重启服务
    logs            查看日志
    status          查看状态

  环境变量：ADMIN_PORT(默认3007)  NAPCAT_WEBUI_PORT(默认6099)
EOF
    ;;
  *)
    err "未知参数: $ACTION"
    echo "用法: $0 [菜单|1|2|dev|stop|restart|logs|status]"
    exit 1
    ;;
esac

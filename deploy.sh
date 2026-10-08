#!/usr/bin/env bash
#
# 兼容层：部署入口已统一到 ./start.sh（新增默认版 / QQ 登录版菜单）。
# 本脚本仅做转发，保留以避免旧文档与旧习惯失效。
#
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "[INFO] deploy.sh 已合并进 start.sh，正在转发..."
exec ./start.sh "$@"

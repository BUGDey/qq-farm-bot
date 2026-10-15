#!/bin/sh
set -eu

# 设备名默认固定为 qq-farm-bot；仅当环境变量和 .env 都没配置时，才回退到宿主机名。
# 注意：不要在 .env 已配置时强行 export，否则会覆盖 .env 里的值。
if [ -z "${NAPCAT_DEVICE_NAME:-}" ] && ! grep -qE '^[[:space:]]*NAPCAT_DEVICE_NAME=' .env 2>/dev/null; then
  if command -v scutil >/dev/null 2>&1; then
    NAPCAT_DEVICE_NAME="$(scutil --get LocalHostName 2>/dev/null || hostname -s 2>/dev/null || hostname)"
  else
    NAPCAT_DEVICE_NAME="$(hostname -s 2>/dev/null || hostname)"
  fi
  export NAPCAT_DEVICE_NAME
fi

exec docker compose "$@"

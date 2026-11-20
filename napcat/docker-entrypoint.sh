#!/usr/bin/env bash
set -euo pipefail

cd /app
token_file=/app/napcat-auth/token
mkdir -p "$(dirname "$token_file")"
if [[ ! -s "$token_file" ]]; then
  umask 077
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > "$token_file"
fi
NAPCAT_TOKEN=$(tr -d '\r\n' < "$token_file")
export WEBUI_TOKEN="$NAPCAT_TOKEN"

if [[ ! -f /app/napcat/napcat.mjs ]]; then
  unzip -q /app/NapCat.Shell.zip -d /app/NapCat.Shell
  cp -rf /app/NapCat.Shell/* /app/napcat/
  rm -rf /app/NapCat.Shell
fi

rm -rf /app/napcat/plugins/qq-miniapp-openauth
mkdir -p /app/napcat/plugins
cp -a /opt/qq-farm-bot/qq-miniapp-openauth /app/napcat/plugins/

if ! grep -Fq '"qq-miniapp-openauth"' /app/napcat/napcat.mjs; then
  grep -Fq '"napcat-plugin-qce"' /app/napcat/napcat.mjs || {
    echo "NapCat plugin whitelist marker not found; selected image is incompatible" >&2
    exit 1
  }
  sed -i '0,/"napcat-plugin-qce"/s//"napcat-plugin-qce",\n  "qq-miniapp-openauth"/' /app/napcat/napcat.mjs
fi

plugin_config=/app/napcat/config/plugins/qq-miniapp-openauth/config.json
mkdir -p "$(dirname "$plugin_config")"

jq -n --arg token "$NAPCAT_TOKEN" '{token: $token}' > "$plugin_config.tmp"
mv "$plugin_config.tmp" "$plugin_config"
chmod 600 "$plugin_config"

plugins_config=/app/napcat/config/plugins.json
if [[ -s "$plugins_config" ]] && jq empty "$plugins_config" 2>/dev/null; then
  jq '. + {"qq-miniapp-openauth": true}' "$plugins_config" > "$plugins_config.tmp"
else
  jq -n '{"qq-miniapp-openauth": true}' > "$plugins_config.tmp"
fi
mv "$plugins_config.tmp" "$plugins_config"

maintenance_dir=${NAPCAT_MAINTENANCE_DIR:-}
if [[ -z "$maintenance_dir" ]]; then
  exec bash /app/entrypoint.sh "$@"
fi

# Snapshot the request before startup: a request arriving during boot must not be acknowledged by this instance.
mkdir -p "$maintenance_dir"
request_file="$maintenance_dir/restart-request"
read_nonce() {
  local nonce
  nonce=$(cat "$request_file" 2>/dev/null) || return 0
  [[ "$nonce" =~ ^[a-f0-9]{48}$ ]] && printf '%s' "$nonce"
  return 0
}
startup_nonce=$(read_nonce)
started_at=$(date +%s)000
ack_tmp=$(mktemp "$maintenance_dir/restart-ack.XXXXXXXX")
printf '{"nonce":"%s","startedAt":%s}\n' "$startup_nonce" "$started_at" > "$ack_tmp"
chmod 644 "$ack_tmp"
mv -f "$ack_tmp" "$maintenance_dir/restart-ack.json"

owner_pid=$$
bash /app/entrypoint.sh "$@" &
napcat_pid=$!
watch_pid=''
stop_napcat() {
  if [[ -n "$watch_pid" ]]; then kill "$watch_pid" 2>/dev/null || true; fi
  kill -TERM "$napcat_pid" 2>/dev/null || true
  # Exiting PID 1 tears down the whole container, including any descendants.
  exit "$1"
}
trap 'stop_napcat 0' TERM INT
trap 'stop_napcat 75' USR1
(
  while sleep 1; do
    nonce=$(read_nonce)
    if [[ -n "$nonce" && "$nonce" != "$startup_nonce" ]]; then
      kill -USR1 "$owner_pid"
      break
    fi
  done
) &
watch_pid=$!
status=0
wait "$napcat_pid" || status=$?
kill "$watch_pid" 2>/dev/null || true
exit "$status"

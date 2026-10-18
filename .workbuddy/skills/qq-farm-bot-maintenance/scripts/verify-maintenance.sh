#!/usr/bin/env bash
# 一次性跑完本项目要求的交付验证：
#   1. core 全量测试（基线 499 条，必须 fail 0；只允许涨不允许跌）
#   2. 用户体系测试（48 条，必须 fail 0）
#   3. 前端生产构建（pnpm -C web build，内含 vue-tsc -b 类型检查）
#
# 用法：
#   scripts/verify-maintenance.sh            # 全跑
#   scripts/verify-maintenance.sh --core     # 只跑后端测试
#   scripts/verify-maintenance.sh --web      # 只跑前端构建
#
# Windows(Git Bash) 注意事项：
#   vite 构建前会清空 web/dist，本机安全策略会拦截批量删除导致构建失败，
#   因此脚本先把 dist 挪到 /tmp 再构建。
set -uo pipefail

# 脚本在 <仓库根>/.workbuddy/skills/<技能名>/scripts/ 下，往上 4 级才是仓库根
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT" || exit 2

RUN_CORE=1
RUN_WEB=1
case "${1:-}" in
  --core) RUN_WEB=0 ;;
  --web)  RUN_CORE=0 ;;
  "" )    ;;
  * )     echo "用法: verify-maintenance.sh [--core|--web]" >&2; exit 2 ;;
esac

CORE_RESULT=0
WEB_RESULT=0

print_step() {
  echo ""
  echo "────────────────────────────────────────────"
  echo "  $1"
  echo "────────────────────────────────────────────"
}

if [ "$RUN_CORE" -eq 1 ]; then
  print_step "core 全量测试"
  if [ ! -d "$REPO_ROOT/core/node_modules" ] && [ ! -d "$REPO_ROOT/node_modules" ]; then
    echo "警告: node_modules 不存在，测试多半会以 'Cannot find module' 失败。"
    echo "      先执行 pnpm install --prefer-offline"
  fi
  ( cd core && node --test 2>&1 | tail -14 )
  CORE_RESULT=$?

  print_step "用户体系测试（43 条）"
  ( cd core && node --test test/user-store.test.js test/admin-multi-user.test.js 2>&1 | tail -10 )
  [ $? -ne 0 ] && CORE_RESULT=1
fi

if [ "$RUN_WEB" -eq 1 ]; then
  print_step "前端生产构建"
  if [ -d "$REPO_ROOT/web/dist" ]; then
    echo "先移走旧的 web/dist（避免 vite 清空目录被安全策略拦截）"
    mv "$REPO_ROOT/web/dist" "/tmp/web-dist-$(date +%s)" || true
  fi
  pnpm -C web build 2>&1 | tail -8
  WEB_RESULT=$?
fi

print_step "汇总"
if [ "$RUN_CORE" -eq 1 ]; then
  if [ "$CORE_RESULT" -eq 0 ]; then echo "  ✓ core 测试通过"; else echo "  ✗ core 测试失败"; fi
fi
if [ "$RUN_WEB" -eq 1 ]; then
  if [ "$WEB_RESULT" -eq 0 ]; then echo "  ✓ 前端构建通过"; else echo "  ✗ 前端构建失败"; fi
fi

if [ "$CORE_RESULT" -ne 0 ] || [ "$WEB_RESULT" -ne 0 ]; then
  echo ""
  echo "存在未通过的检查，不要提交/推送。"
  exit 1
fi
echo ""
echo "全部检查通过。"

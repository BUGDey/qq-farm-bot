#!/usr/bin/env bash
# 列出两个提交之间被删除的文件，用于合并 / cherry-pick / 导入外部源码前
# 逐个确认删除是有意为之。
#
# 背景：2026-10-15 用「合成基线 + 三方合并」导入外部 UI zip 时，
# zip 里没有的文件相对于基线表现为"删除"，而 ours 侧没碰过它们，
# merge 连冲突都不报就把 11 个文件静默删掉了（4 个 core/docs 手册、
# .agents 技能包、Sidebar.vue）。这种单边删除 git 不会提醒。
#
# 用法：
#   scripts/check-deletions.sh <基线SHA> [目标SHA]      # 目标省略则用 HEAD
#   scripts/check-deletions.sh 9982736 094d0f7
#
# 退出码：
#   0  没有删除，或已显式确认（CHECK_DELETIONS_ACCEPT=1）
#   1  存在删除（需要人工逐个核查）
#   2  参数错误
set -uo pipefail

# 脚本在 <仓库根>/.workbuddy/skills/<技能名>/scripts/ 下，往上 4 级才是仓库根
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT" || exit 2

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "用法: check-deletions.sh <基线SHA> [目标SHA]" >&2
  exit 2
fi

BASE="$1"
TARGET="${2:-HEAD}"

for ref in "$BASE" "$TARGET"; do
  if ! git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
    echo "错误: '$ref' 不是有效的提交" >&2
    exit 2
  fi
done

BASE_SHORT="$(git rev-parse --short "$BASE")"
TARGET_SHORT="$(git rev-parse --short "$TARGET")"

mapfile -t DELETED < <(git diff --diff-filter=D --name-only "$BASE" "$TARGET")
MODIFIED_COUNT="$(git diff --diff-filter=M --name-only "$BASE" "$TARGET" | wc -l | tr -d ' ')"
ADDED_COUNT="$(git diff --diff-filter=A --name-only "$BASE" "$TARGET" | wc -l | tr -d ' ')"

echo "=== 变更概览: $BASE_SHORT .. $TARGET_SHORT ==="
echo "  新增 $ADDED_COUNT  修改 $MODIFIED_COUNT  删除 ${#DELETED[@]}"

if [ ${#DELETED[@]} -eq 0 ]; then
  echo "没有文件被删除。"
  exit 0
fi

echo ""
echo "=== 被删除的文件（必须逐个确认是有意为之）==="
printf '  %s\n' "${DELETED[@]}"

echo ""
echo "=== 分组提示 ==="
# 按目录归类，便于判断是"整块目录没了"（危险）还是"单点文件"（通常正常）
printf '%s\n' "${DELETED[@]}" | awk -F/ '{
  if (NF == 1) print "  <根目录>"
  else if (NF == 2) print "  " $1 "/"
  else print "  " $1 "/" $2 "/"
}' | sort | uniq -c | sort -rn

echo ""
echo "恢复方法（从基线提交取回原内容）："
printf '  git checkout %s -- <以上文件>\n' "$BASE"
echo ""
echo "注意: core/docs/ 被 .gitignore 忽略，加回需要 git add -f"

if [ "${CHECK_DELETIONS_ACCEPT:-0}" = "1" ]; then
  echo ""
  echo "[已跳过] CHECK_DELETIONS_ACCEPT=1 —— 假定删除均已确认。"
  exit 0
fi

echo ""
echo "结果: 存在 ${#DELETED[@]} 个删除尚未确认。"
exit 1

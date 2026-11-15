#!/usr/bin/env node
/**
 * 把 GitHub Releases 的说明文字镜像到 Gitee Releases。
 *
 * 为什么只同步说明、不同步附件：
 *   Gitee 社区版对发行版附件有硬限制——单个附件 ≤ 100MB、每仓库附件总量 ≤ 1G。
 *   本项目每个安装包 216~286MB，一版四个包约 1GB，无法上传到 Gitee。
 *   因此 Gitee 侧只建「有版本记录 + 说明文字 + 指向 GitHub 下载」的发行版，
 *   真正的安装包仍然从 GitHub Releases 下载。
 *
 * 用法：
 *   GITEE_TOKEN=xxx node tools/sync-gitee-releases.js            # 同步全部
 *   GITEE_TOKEN=xxx node tools/sync-gitee-releases.js --latest   # 只同步最新一版
 *   GITEE_TOKEN=xxx node tools/sync-gitee-releases.js --dry-run  # 只打印不提交
 *
 * 依赖：gh（已登录 GitHub）、Node.js 18+（自带 fetch）
 */

const { execFileSync } = require('node:child_process');

const GH_REPO = 'BUGDey/qq-farm-bot';
const GITEE_REPO = 'bugdey/qq-farm-bot';
const GITEE_API = 'https://gitee.com/api/v5';
const TOKEN = process.env.GITEE_TOKEN;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_LATEST = args.includes('--latest');

if (!TOKEN && !DRY_RUN) {
  console.error('缺少 GITEE_TOKEN 环境变量。到 https://gitee.com/profile/personal_access_tokens 生成（勾选 projects）后重试。');
  process.exit(1);
}

/** 把 GitHub 的发布说明改写成 Gitee 版本：顶部插入「安装包在哪下载」的说明。 */
function rewriteBody(rel) {
  const tag = rel.tag_name;
  const download = `https://github.com/${GH_REPO}/releases/tag/${tag}`;
  const header = [
    `> [!IMPORTANT]`,
    `> **安装包在 GitHub Releases 下载**：[${tag}](${download})`,
    `>`,
    `> Gitee 对发行版附件有硬限制（单个附件 ≤ 100MB、每仓库附件总量 ≤ 1G），`,
    `> 本项目的安装包每个 216~286MB，一版四个包合计约 1GB，无法上传到这里。`,
    `> 这里是代码镜像仓库，分支与标签和 GitHub 完全一致，可以直接 \`git clone\`。`,
    `>`,
    `> 国内网络访问 GitHub 慢的话，可以先把仓库 clone 下来自行构建：`,
    `> \`\`\`bash`,
    `> git clone https://gitee.com/${GITEE_REPO}.git`,
    `> cd qq-farm-bot && ./start.sh`,
    `> \`\`\``,
    ``,
    '---',
    ``,
  ].join('\n');
  return header + rel.body;
}

function ghReleases() {
  const out = execFileSync(
    'gh',
    ['api', `repos/${GH_REPO}/releases?per_page=100`, '--paginate'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out);
}

async function giteeFetch(path, init) {
  const res = await fetch(`${GITEE_API}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON 响应，原样返回文本 */
  }
  return { status: res.status, json, text };
}

async function existingReleases() {
  const { status, json } = await giteeFetch(
    `/repos/${GITEE_REPO}/releases?access_token=${TOKEN}&per_page=100`
  );
  if (status !== 200) throw new Error(`读取 Gitee 发行版失败：${status}`);
  return json || [];
}

async function createRelease(rel, body) {
  const params = new URLSearchParams({
    access_token: TOKEN,
    tag_name: rel.tag_name,
    name: rel.name || rel.tag_name,
    body,
    target_commitish: 'main',
    prerelease: String(Boolean(rel.prerelease)),
  });
  const { status, json, text } = await giteeFetch(`/repos/${GITEE_REPO}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (status >= 200 && status < 300) return json;
  throw new Error(`创建 ${rel.tag_name} 失败：${status} ${text.slice(0, 200)}`);
}

async function updateRelease(id, rel, body) {
  const params = new URLSearchParams({
    access_token: TOKEN,
    tag_name: rel.tag_name,
    name: rel.name || rel.tag_name,
    body,
    prerelease: String(Boolean(rel.prerelease)),
  });
  const { status, text } = await giteeFetch(`/repos/${GITEE_REPO}/releases/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (status >= 200 && status < 300) return true;
  throw new Error(`更新 ${rel.tag_name} 失败：${status} ${text.slice(0, 200)}`);
}

async function main() {
  let rels = ghReleases().filter((r) => !r.draft);
  // 按发布时间从旧到新，保证 Gitee 上的时间顺序与 GitHub 一致
  rels.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
  if (ONLY_LATEST) rels = rels.slice(-1);

  console.log(`GitHub 上有 ${rels.length} 个发行版待同步到 Gitee`);

  const existing = DRY_RUN ? [] : await existingReleases();
  const byTag = new Map(existing.map((r) => [r.tag_name, r]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const rel of rels) {
    const body = rewriteBody(rel);
    const hit = byTag.get(rel.tag_name);

    if (DRY_RUN) {
      console.log(`[dry-run] ${rel.tag_name}${hit ? '（已存在，将更新）' : '（新建）'} body=${body.length} 字符`);
      continue;
    }

    try {
      if (hit) {
        await updateRelease(hit.id, rel, body);
        updated += 1;
        console.log(`更新 ${rel.tag_name}`);
      } else {
        await createRelease(rel, body);
        created += 1;
        console.log(`新建 ${rel.tag_name}`);
      }
    } catch (err) {
      skipped += 1;
      console.error(`跳过 ${rel.tag_name}：${err.message}`);
    }
    // 轻微限速，避免触发 Gitee 接口频率限制
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!DRY_RUN) {
    console.log(`\n完成：新建 ${created}，更新 ${updated}，失败 ${skipped}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

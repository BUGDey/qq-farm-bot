'use strict';
/**
 * .env 读写小工具（保留注释与顺序，只改动指定 KEY 的行）
 *
 * 为什么单独抽出来：Windows 首次启动要往 .env 里补 NAPCAT_* 开关，
 * 而 .env 里有用户手写的注释和其它配置，不能被整份重写。
 */

const fs = require('node:fs');

/** 读取文件内容，不存在时返回空串 */
function readEnvText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** 取某个 KEY 的值（找不到返回 ''） */
function getEnvValue(text, key) {
  const re = new RegExp(`^${key}=(.*)$`, 'm');
  const matched = String(text || '').match(re);
  return matched ? matched[1].trim() : '';
}

/**
 * 把若干 KEY=VALUE 写进文本，返回新文本。
 * - 已存在同名行 → 原位替换（保留行位置）
 * - 不存在 → 追加到末尾
 * pairs 里的值若为 null/undefined 则跳过（表示"不改"）
 */
function applyEnvValues(text, pairs) {
  const lines = String(text || '').split(/\r?\n/);
  const pending = new Map();
  for (const [key, value] of Object.entries(pairs || {})) {
    if (value === null || value === undefined) continue;
    pending.set(key, String(value));
  }

  for (let i = 0; i < lines.length; i += 1) {
    const matched = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!matched) continue;
    const key = matched[1];
    if (!pending.has(key)) continue;
    lines[i] = `${key}=${pending.get(key)}`;
    pending.delete(key);
  }

  // 末尾多余空行先去掉，追加后再补一个换行，保持文件以换行结尾
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  return `${lines.join('\n')}\n`;
}

/** 读文本 → 应用改动 → 写回；返回实际写入的 pairs */
function setEnvValues(file, pairs) {
  const before = readEnvText(file);
  const after = applyEnvValues(before, pairs);
  fs.writeFileSync(file, after, 'utf8');
  return pairs;
}

module.exports = { readEnvText, getEnvValue, applyEnvValues, setEnvValues };

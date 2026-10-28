/**
 * 插件 zip 包的安全解压。
 *
 * 上传的 zip 来自管理员，但仍按不可信输入处理：解压前逐条目校验路径
 * （拒绝绝对路径、盘符、.. 穿越与符号链接），并限制条目数与总解压体积，
 * 防止 zip 炸弹；在预检全部通过后再写盘，避免失败时留下半截目录。
 */

const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const MAX_ENTRIES = 5000;
// 解压后总大小上限（素材目录约 32MB，留出余量）
const MAX_TOTAL_BYTES = 160 * 1024 * 1024;
const MAX_ZIP_BYTES = 120 * 1024 * 1024;
const WINDOWS_DRIVE_PATTERN = /^[a-z]:/i;
const UNC_PATTERN = /^\\\\/;
const BACKSLASH_PATTERN = /\\/g;

function isWindowsDrivePath(entryName) {
    return WINDOWS_DRIVE_PATTERN.test(entryName) || UNC_PATTERN.test(entryName);
}

/**
 * 校验 zip 条目路径在目标目录内，返回归一化后的相对路径；目录条目返回 null；非法则抛错。
 */
function safeRelativePath(entryName) {
    const normalized = String(entryName || '').replace(BACKSLASH_PATTERN, '/');
    if (!normalized || normalized.endsWith('/')) return null;
    if (normalized.startsWith('/') || isWindowsDrivePath(normalized)) {
        throw new Error(`zip 内存在绝对路径条目：${normalized}`);
    }
    const parts = normalized.split('/').filter(part => part.length > 0);
    if (parts.some(part => part === '..' || part === '.')) {
        throw new Error(`zip 内存在路径穿越条目：${normalized}`);
    }
    return parts.join('/');
}

/**
 * 校验并解压 zip 到 destDir。成功返回 { files: 相对路径数组, manifest }。
 */
function extractPluginZip(zipBuffer, destDir) {
    if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
        throw new Error('上传内容为空');
    }
    if (zipBuffer.length > MAX_ZIP_BYTES) {
        throw new Error(`zip 包超过大小上限（${Math.round(MAX_ZIP_BYTES / 1024 / 1024)}MB）`);
    }
    let zip;
    try {
        zip = new AdmZip(zipBuffer);
    } catch (error) {
        throw new Error(`无法读取 zip 包：${error.message}`);
    }
    const entries = zip.getEntries();
    if (!entries.length || entries.length > MAX_ENTRIES) {
        throw new Error(`zip 条目数非法（${entries.length}，上限 ${MAX_ENTRIES}）`);
    }
    let totalBytes = 0;
    const extracted = [];
    let manifestRaw = null;
    for (const entry of entries) {
        if (entry.isSymbolicLink) {
            throw new Error(`zip 内不允许符号链接：${entry.entryName}`);
        }
        const relative = safeRelativePath(entry.entryName);
        if (!relative) continue;
        const content = entry.getData();
        totalBytes += content.length;
        if (totalBytes > MAX_TOTAL_BYTES) {
            throw new Error('zip 解压后总大小超过上限');
        }
        const target = path.resolve(destDir, relative);
        if (!target.startsWith(path.resolve(destDir) + path.sep)) {
            throw new Error(`zip 条目越界：${entry.entryName}`);
        }
        if (relative === 'manifest.json') {
            let text = content.toString('utf8');
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
            manifestRaw = text;
        }
        extracted.push([relative, content]);
    }
    if (!manifestRaw) throw new Error('zip 根目录缺少 manifest.json');
    let manifest;
    try {
        manifest = JSON.parse(manifestRaw);
    } catch (error) {
        throw new Error(`manifest.json 不是合法 JSON：${error.message}`);
    }
    // 预检通过后再真正写盘：先清空目标目录，防止旧版本残留文件混入
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    for (const [relative, content] of extracted) {
        const target = path.join(destDir, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
    return { files: extracted.map(([relative]) => relative), manifest };
}

module.exports = { extractPluginZip, safeRelativePath, MAX_ZIP_BYTES };

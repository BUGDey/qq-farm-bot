/**
 * 奶茶插件打包脚本：把 manifest/backend/frontend 构建产物/assets 组装为可上传 zip。
 *
 * 用法（需先在 frontend/ 里 npm install && npm run build）：
 *   node pack.js            # 输出 dist/milk-tea-<version>.zip
 *
 * zip 内布局（manifest 为唯一契约）：
 *   manifest.json
 *   backend/**
 *   frontend/plugin.mjs
 *   frontend/plugin.css
 *   assets/**（含 assets-map.json）
 */

const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const pluginRoot = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'manifest.json'), 'utf8'));

const frontendDist = path.join(pluginRoot, 'frontend', 'dist');
// manifest 里的前端路径是 zip 内路径；实际构建产物在 frontend/dist/ 下
const frontendSource = file => path.join(frontendDist, path.basename(String(file)));
for (const file of [manifest.frontend.entry, manifest.frontend.css]) {
    if (!fs.existsSync(frontendSource(file))) {
        throw new Error(`缺少 ${file}：请先在 frontend/ 执行 npm install && npm run build`);
    }
}

const zip = new AdmZip();
zip.addLocalFile(path.join(pluginRoot, 'manifest.json'), '');
const addDir = (dir, zipPath) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        const relative = zipPath ? `${zipPath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) addDir(absolute, relative);
        else zip.addLocalFile(absolute, zipPath);
    }
};
addDir(path.join(pluginRoot, 'backend'), 'backend');
for (const file of [manifest.frontend.entry, manifest.frontend.css]) {
    zip.addLocalFile(frontendSource(file), 'frontend');
}
const assetsDir = path.join(pluginRoot, 'assets');
if (fs.existsSync(assetsDir)) addDir(assetsDir, 'assets');

const outDir = path.join(pluginRoot, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${manifest.id}-${manifest.version}.zip`);
fs.rmSync(outFile, { force: true });
zip.writeZip(outFile);
const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
console.log(`已打包 ${path.relative(process.cwd(), outFile)}（${sizeMb} MB）`);

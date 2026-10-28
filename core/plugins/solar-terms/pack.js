/**
 * 节令小札插件打包脚本：manifest/backend/frontend 构建产物组装为可上传 zip。
 * 用法：先在 frontend/ 执行 npm install && npm run build，再 node pack.js
 */
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const pluginRoot = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'manifest.json'), 'utf8'));

const frontendDist = path.join(pluginRoot, 'frontend', 'dist');
const frontendSource = file => path.join(frontendDist, path.basename(String(file)));
for (const file of [manifest.frontend.entry, manifest.frontend.css]) {
    if (!file) continue;
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
    if (!file) continue;
    zip.addLocalFile(frontendSource(file), 'frontend');
}

const outDir = path.join(pluginRoot, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${manifest.id}-${manifest.version}.zip`);
fs.rmSync(outFile, { force: true });
zip.writeZip(outFile);
const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
console.log(`已打包 ${path.relative(process.cwd(), outFile)}（${sizeMb} MB）`);

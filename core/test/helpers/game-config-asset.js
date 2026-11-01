const fs = require('node:fs');
const path = require('node:path');

/**
 * `/game-config/...` 的资源可能来自宿主目录（core/src/gameConfig），
 * 也可能来自素材插件（core/plugins/<id>/assets），静态路由会依次回退，
 * 因此测试判断「文件存在」时必须检查全部来源，否则插件接管素材后测试会误报。
 */
function gameConfigAssetRoots() {
  const coreRoot = path.join(__dirname, '..', '..');
  const roots = [path.join(coreRoot, 'src', 'gameConfig')];
  const pluginsDir = path.join(coreRoot, 'plugins');
  if (fs.existsSync(pluginsDir)) {
    for (const id of fs.readdirSync(pluginsDir).sort()) {
      const assets = path.join(pluginsDir, id, 'assets');
      if (fs.existsSync(assets)) roots.push(assets);
    }
  }
  return roots;
}

function resolveGameConfigAsset(imageUrl) {
  const relative = String(imageUrl || '').replace(/^\/game-config\//, '');
  if (!relative) return '';
  let decoded = relative;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    decoded = relative;
  }
  for (const root of gameConfigAssetRoots()) {
    const file = path.join(root, decoded);
    if (fs.existsSync(file)) return file;
  }
  return '';
}

module.exports = { gameConfigAssetRoots, resolveGameConfigAsset };

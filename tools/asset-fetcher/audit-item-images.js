#!/usr/bin/env node
/**
 * 审计「数据里登记了、界面上却没图」的条目。
 *
 * 比「图没下载」更容易翻车的是：图画好了、也放进目录了，但**映射表没登记**，
 * 于是界面上依然是裂的。这里直接调真实的 gameConfig，而不是自己猜路径。
 *
 * 用法：
 *   node tools/asset-fetcher/audit-item-images.js
 *   node tools/asset-fetcher/audit-item-images.js --check
 */
'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CORE = path.join(ROOT, 'core', 'src');

const config = require(path.join(CORE, 'config', 'gameConfig'));
const decoration = require(path.join(CORE, 'services', 'decoration'));

const args = new Set(process.argv.slice(2));
const check = args.has('--check');

function imageOf(item) {
    try {
        return config.getItemImageById(String(item.id)) || '';
    } catch (err) {
        return '';
    }
}

(async () => {
    const snapshot = await decoration.getDecorationsSnapshot({ bag: false, shop: false, skins: false, frames: false });
    const catalog = (snapshot.categories || []).flatMap((group) => group.items || []);

    const missing = catalog.filter((item) => !imageOf(item));

    const items = require(path.join(CORE, 'gameConfig', 'ItemInfo.json'));
    const rows = Array.isArray(items) ? items : Object.values(items);
    const decoRows = rows.filter((row) => Number(row.type) === 18 || Number(row.type) === 10);

    const EXCLUDED = new Set([
        ...(decoration.EMPTY_SLOT_IDS || []),
        ...(decoration.PLACEHOLDER_SLOT_IDS || []),
    ].map(String));

    const notInCatalog = decoRows
        .filter((row) => !EXCLUDED.has(String(row.id)))
        .filter((row) => !catalog.some((item) => String(item.id) === String(row.id)));

    console.log('装扮清单: %d 件 | 缺图: %d | 数据里是装扮却没进清单: %d', catalog.length, missing.length, notInCatalog.length);

    if (missing.length) {
        console.log('\n=== 缺图（界面会显示占位图标）===');
        for (const item of missing.slice(0, 40)) {
            console.log('  %s  %s  (%s)', item.id, item.name, item.category);
        }
        if (missing.length > 40) console.log('  … 其余 %d 件', missing.length - 40);
    }

    if (notInCatalog.length) {
        console.log('\n=== 未登记进清单（分类规则没覆盖到）===');
        for (const row of notInCatalog.slice(0, 40)) {
            console.log('  %s  %s  type=%s', row.id, row.name, row.type);
        }
        if (notInCatalog.length > 40) console.log('  … 其余 %d 件', notInCatalog.length - 40);
    }

    if (!missing.length && !notInCatalog.length) console.log('\n=== 全部有图，无漏登记 ===');

    process.exit(check && (missing.length || notInCatalog.length) ? 1 : 0);
})();
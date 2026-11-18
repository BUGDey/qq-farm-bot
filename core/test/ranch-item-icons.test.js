const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { getItemImageById } = require('../src/config/gameConfig');
const { MCItemInfo } = require('../src/gameConfig/RanchConfig.json');
const directory = path.resolve(__dirname, '../../web/public/game-config/ranch-icons/items');

test('牧场全部仓库分类均有可访问的本地图片，包含巨大产物、幼崽、饲料、罐头和建筑', () => {
    for (const item of MCItemInfo.filter(row => Number(row.show_tab_ids) >= 5)) {
        const image = getItemImageById(item.id);
        assert.ok(image, `${item.id} ${item.name}`);
        const suffix = image.replace(/^\/game-config\//, '');
        assert.ok([
            path.resolve(__dirname, '../../web/public/game-config', suffix),
            path.resolve(__dirname, '../src/gameConfig', suffix),
        ].some(file => fs.existsSync(file)), `${item.id}: ${image}`);
    }
});

test('新增官方图片映射与 PNG 内容、SHA256 逐项一致', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'sources.json')));
    assert.deepEqual(manifest.missing, []);
    assert.equal(manifest.images.length, 180);
    for (const image of manifest.images) {
        const bytes = fs.readFileSync(path.join(directory, image.file));
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), image.sha256);
        assert.equal(getItemImageById(image.id), `/game-config/ranch-icons/items/${image.file}`);
    }
    for (const id of [7002, 80021, 80031, 2060001]) assert.ok(getItemImageById(id));
});

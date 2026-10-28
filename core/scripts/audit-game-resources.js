const fs = require('node:fs');
const path = require('node:path');

const coreRoot = path.resolve(__dirname, '..');
const gameConfig = path.join(coreRoot, 'src', 'gameConfig');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

const plantsRaw = readJson(path.join(gameConfig, 'Plant.json'));
const plants = Array.isArray(plantsRaw) ? plantsRaw : Object.values(plantsRaw);

// 宿主种子图索引（{seedId}_xxx.png / Crop_X_Seed.png）
const seedDir = path.join(gameConfig, 'seed_images_named');
const seedFiles = fs.existsSync(seedDir) ? fs.readdirSync(seedDir) : [];
const hostSeedIds = new Set();
const hostCropIds = new Set();
for (const file of seedFiles) {
    const head = /^(\d+)/.exec(file);
    if (head) hostSeedIds.add(Number(head[1]));
    const crop = /Crop_(\d+)/.exec(file);
    if (crop) hostCropIds.add(Number(crop[1]));
}

// 素材插件提供的种子图 / 阶段图
const pluginRoot = path.join(coreRoot, 'plugins');
const pluginSeedIds = new Set();
for (const dir of fs.existsSync(pluginRoot) ? fs.readdirSync(pluginRoot) : []) {
    const seedDirOfPlugin = path.join(pluginRoot, dir, 'assets', 'seed_images_named');
    if (!fs.existsSync(seedDirOfPlugin)) continue;
    for (const file of fs.readdirSync(seedDirOfPlugin)) {
        const head = /^(\d+)/.exec(file);
        if (head) pluginSeedIds.add(Number(head[1]));
        const crop = /Crop_(\d+)/.exec(file);
        if (crop) pluginSeedIds.add(20000 + Number(crop[1]));
    }
}

const hostManifest = readJson(path.join(gameConfig, 'plant_images', 'manifest.json'));
const hostPhase = new Set(Object.keys(hostManifest));
const pluginPhase = new Set();
for (const dir of fs.existsSync(pluginRoot) ? fs.readdirSync(pluginRoot) : []) {
    const manifestFile = path.join(pluginRoot, dir, 'assets', 'plant_images', 'manifest.json');
    if (fs.existsSync(manifestFile)) {
        for (const key of Object.keys(readJson(manifestFile))) pluginPhase.add(key);
    }
}

const golden = [];
const missingSeed = [];
const missingPhase = [];
let normal = 0;

for (const plant of plants) {
    const seedId = Number(plant.seed_id);
    if (!Number.isFinite(seedId) || seedId <= 0) {
        golden.push(plant.name);
        continue;
    }
    normal += 1;
    const cropKey = seedId > 20000 ? `Crop_${seedId - 20000}` : `Plant_${plant.id}`;
    const hasSeed = hostSeedIds.has(seedId) || hostCropIds.has(seedId - 20000) || pluginSeedIds.has(seedId);
    const hasPhase = hostPhase.has(cropKey) || pluginPhase.has(cropKey);
    if (!hasSeed) missingSeed.push(`${seedId} ${plant.name}`);
    if (!hasPhase) missingPhase.push(`${cropKey} ${plant.name}`);
}

console.log(JSON.stringify({
    plants: plants.length,
    normalPlants: normal,
    noSeedIdPlants: golden.length,
    missingSeedCount: missingSeed.length,
    missingPhaseCount: missingPhase.length,
    missingSeed,
    missingPhase,
}, null, 2));
const manifest = require('../gameConfig/ranch_visuals/manifest.json');
function getAnimalVisual(animalId, stage, mutation = {}) {
    const animal = manifest.animals[String(animalId)];
    // Official AnimalViewConfig animation suffix: cub=1, growing=2, producing/mature/gain=3.
    const pose = mutation?.mutationType === 1 && mutation.tier >= 4 ? 4 : ({ 1: 1, 2: 2, 3: 3, 4: 3, 5: 3 })[Number(stage)];
    // AnimalViewConfig: stage size and server mutation scale, capped by tier.
    const stageScale = Number(stage) === 1 ? 1 / (1.3 * 1.25) : Number(stage) === 2 ? 1 / 1.25 : 1;
    const bp = Number(mutation?.scaleBp) || 0;
    const cap = ({ 1: 12000, 2: 13000, 3: 14000, 4: 15000 })[Number(mutation?.tier)] || 15000;
    const scale = stageScale * (bp > 0 ? Math.min(bp, cap) / 10000 : 1);
    return { image: animal?.poses[pose] || '', pose: pose || null, scale };
}
function getFacilityVisual(row) { return manifest.facilities[row?.prefab_path] || null; }
module.exports = { getAnimalVisual, getFacilityVisual };

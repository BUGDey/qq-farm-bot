const config = require('../gameConfig/RanchConfig.json');
const animals = new Map(config.MCAnimalConfig.map(a => [String(a.cub_item_id), a]));
const items = new Map(config.MCItemInfo.map(i => [String(i.id), i]));
function cubScore(cub, strategy) {
    const a = animals.get(String(cub.itemId));
    if (!a) return -Infinity;
    const cycle = Number(a.infant_sec || 0) + Number(a.grow_sec || 0) + Number(a.mature_sec || 0) + Number(a.product_round_sec || 0) * Number(a.max_produce_count || 0);
    if (strategy === 'max_exp') return cycle > 0 ? (Number(a.harvest_exp || 0) + Number(a.produce_exp || 0) * Number(a.max_produce_count || 0)) / cycle : -Infinity;
    if (strategy === 'max_profit') {
        const sell = entry => { const match = /^1007:(\d+)$/.exec(String(items.get(String(entry?.id))?.sells)); return match ? Number(match[1]) * Number(entry.count || 0) : 0; };
        // Existing warehouse cubs only; use base output value, not an invented purchase cost.
        return cycle > 0 ? (sell(a.product_item) * Number(a.max_produce_count || 0) + sell(a.byproduct_item)) / cycle : -Infinity;
    }
    return Number(items.get(String(a.cub_item_id))?.level || a.id || 0);
}
function taskCubIds(tasks = []) {
    // Official mcTaskCondType: adoption, harvest product/main/sub product, buy cub.
    // Match exact protocol params only; never infer an animal from task text.
    const ids = new Set();
    for (const task of tasks) {
        if (!task.isUnlocked || task.isClaimed || !(Number(task.totalProgress) > Number(task.progress)) ||
            ![107, 110, 118, 119, 126].includes(Number(task.condType))) continue;
        for (const param of task.params || []) for (const a of animals.values()) {
            const targets = [107, 126].includes(Number(task.condType))
                ? [a.id, a.cub_item_id] : [a.product_item?.id, a.byproduct_item?.id];
            if (targets.some(id => id != null && String(id) === String(param))) ids.add(String(a.cub_item_id));
        }
    }
    return ids;
}
function selectCub(cubs, strategy, tasks = []) {
    if (strategy === 'task') {
        const preferred = taskCubIds(tasks);
        const matches = cubs.filter(c => preferred.has(String(c.itemId)));
        return selectCub(matches.length ? matches : cubs, 'level');
    }
    return [...cubs].sort((a, b) => cubScore(b, strategy) - cubScore(a, strategy) || Number(a.itemId) - Number(b.itemId))[0];
}
function feedTypes(animal, p, nowMs) {
    if (!animal.canFeed || animal.canHarvest || p.canStrategy === 'none') return [];
    const deadline = ({ 1: animal.infantReadyAtMs, 2: animal.growReadyAtMs, 3: animal.produceReadyAtMs, 4: animal.matureReadyAtMs })[animal.stage];
    const end = Number(deadline ?? Math.min(...[animal.produceReadyAtMs, animal.matureReadyAtMs, animal.growReadyAtMs, animal.infantReadyAtMs].map(Number).filter(t => t > nowMs)));
    const near = end > nowMs && end - nowMs <= p.smartSeconds * 1000;
    const organic = animal.limitedCanUsed ? [] : [2];
    return ({ both: [1, ...organic], normal: [1], organic, smart: [1, ...(near ? organic : [])], smart_only: near ? organic : [], smart_normal: near ? [1] : [] })[p.canStrategy] || [];
}
function quietNow(p, nowMs) {
    if (!p.quietEnabled) return false;
    const date = new Date(nowMs + 8 * 3600000);
    const time = date.toISOString().slice(11, 16);
    return p.quietStart <= p.quietEnd ? time >= p.quietStart && time < p.quietEnd : time >= p.quietStart || time < p.quietEnd;
}
// Same farm scheduling principles: nearest maturity first, 5-min due recheck,
// rotating 15-min calibration. State belongs to one ranch service/account, never the farm singleton.
function createRanchMaturityPlan(now = Date.now) {
    const plans = new Map(); let cursor = 0; let calibrationAt = 0; let helpAt = 0;
    let stealIds = new Set(); let helpIds = new Set();
    return {
        select(friends, limit, settings = {}, p = {}) {
            const time = now(); const ids = new Set(friends.map(f => String(f.gid)));
            for (const id of plans.keys()) if (!ids.has(id)) plans.delete(id);
            const due = settings.autoSteal ? friends.filter(f => plans.has(String(f.gid)) && plans.get(String(f.gid)) <= time).sort((a, b) => plans.get(String(a.gid)) - plans.get(String(b.gid))) : [];
            const selected = due.slice(0, limit);
            if (settings.autoSteal && time >= calibrationAt && !friends.length) calibrationAt = time + 15 * 60000;
            if (settings.autoSteal && time >= calibrationAt && friends.length) {
                for (let i = 0; i < Math.min(limit, friends.length) && selected.length < limit; i++) {
                    const f = friends[(cursor + i) % friends.length];
                    if (!selected.includes(f)) selected.push(f);
                }
                cursor = (cursor + limit) % friends.length;
                calibrationAt = time + 15 * 60000;
            }
            for (const f of selected) plans.set(String(f.gid), time + 5 * 60000);
            stealIds = new Set(selected.map(f => String(f.gid)));
            helpIds = new Set();
            if ((settings.autoHelp || settings.autoStroke || settings.autoPutHazard) && time >= helpAt) {
                for (let i = 0; i < Math.min(limit, friends.length); i++) helpIds.add(String(friends[(cursor + i) % friends.length].gid));
                if (friends.length) cursor = (cursor + limit) % friends.length;
                helpAt = time + ((p.helpMin || 10) + Math.random() * ((p.helpMax || 15) - (p.helpMin || 10))) * 1000;
            }
            return [...selected, ...friends.filter(f => helpIds.has(String(f.gid)) && !stealIds.has(String(f.gid)))];
        },
        observe(gid, ranches) {
            const times = (ranches || []).flatMap(r => (r.animals || []).filter(a => a.producing && !a.grassBlocked).map(a => Number(a.produceReadyAtMs))).filter(t => t > now());
            plans.set(String(gid), times.length ? Math.min(...times) : now() + 5 * 60000);
        },
        canSteal(gid) { return stealIds.has(String(gid)); },
        canHelp(gid) { return helpIds.has(String(gid)); },
        isDue(settings) { return !!((settings.autoSteal && (now() >= calibrationAt || [...plans.values()].some(t => t <= now()))) || ((settings.autoHelp || settings.autoStroke || settings.autoPutHazard) && now() >= helpAt)); },
        nextDelay(settings = {}) { return Math.max(1000, Math.min(...(settings.autoSteal ? [calibrationAt || now(), ...plans.values()] : []), ...(settings.autoHelp || settings.autoStroke || settings.autoPutHazard ? [helpAt || now()] : []), now() + 15 * 60000) - now()); },
        reset() { plans.clear(); cursor = 0; calibrationAt = 0; helpAt = 0; stealIds.clear(); helpIds.clear(); },
    };
}
function purchasableCubs(ranch, shop, goodsMap) {
    return (shop.shops?.find(s => s.shopId === 5)?.goodsList || []).flatMap(g => {
        const row = goodsMap.get(String(g.id));
        const animal = row && animals.get(String(row.item_id));
        if (!row || row.price_id !== 1007 || !animal?.enable_flag || !g.unlocked || g.owned ||
            animal.husbandry_type !== ({ 1: '窝', 2: '棚' })[ranch.husbandryType] ||
            (BigInt(g.limitCount || 0) > 0n && BigInt(g.boughtNum || 0) >= BigInt(g.limitCount))) return [];
        return [{ itemId: row.item_id, animalId: animal.id, goodsId: String(g.id), price: String(g.price) }];
    });
}
module.exports = { taskCubIds, purchasableCubs, selectCub, feedTypes, quietNow, createRanchMaturityPlan };

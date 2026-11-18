// Scene and business module are independent: ranch actions reuse farm log categories.
function ranchOperationModule(action) {
    if (['visitFriend', 'leaveFriend', 'steal', 'friendProduce', 'help', 'stroke', 'putHazard'].includes(action)) return 'friend';
    if (['sell', 'useCan', 'feedAnimal'].includes(action)) return 'warehouse';
    if (['buy', 'exchange', 'dailyBenefit'].includes(action)) return 'shop';
    if (['claimTask', 'submitOrder', 'refreshOrder', 'claimIllustrated', 'claimWeight'].includes(action)) return 'task';
    return 'ranch';
}

// Only project confirmed fields into logs. Never persist raw requests/replies.
function ranchOperationDetails(input, reply, { state, itemName = id => `物品 ${id}`, goodsItem, friendName } = {}) {
    const meta = {};
    const parts = [];
    for (const key of ['ranchId', 'animalInstId', 'facilityInstId', 'hostGid', 'itemId', 'goodsId', 'slotIndex', 'instanceId', 'bucketType', 'count']) {
        if (input[key] != null) meta[key] = String(input[key]);
    }
    if (input.hostGid) parts.push(`好友 ${friendName || input.hostGid}（${input.hostGid}）`);
    const ranch = state?.ranches?.find(r => String(r.ranchInstId) === String(input.ranchId));
    if (input.ranchId != null) parts.push(`${ranch?.name || '栏舍'} #${input.ranchId}`);
    const animal = ranch?.animals?.find(a => String(a.animalInstId) === String(input.animalInstId));
    if (input.animalInstId != null) parts.push(`${animal?.name || '动物'} #${input.animalInstId}`);
    const facility = state?.facilities?.find(f => String(f.instId) === String(input.facilityInstId));
    if (input.facilityInstId != null) parts.push(`${facility?.name || '设施'} #${input.facilityInstId}`);
    if (input.action === 'sell' && input.items) parts.push(input.items.map(row => `${itemName(row.itemId)} ×${row.count}`).join('、'));
    const id = input.itemId ?? goodsItem;
    if (id != null) { meta.itemName = itemName(id); parts.push(`${meta.itemName}${input.count != null ? ` ×${input.count}` : ''}`); }
    else if (input.count != null) parts.push(`数量 ${input.count}`);
    if (input.goodsId != null) parts.push(`商品 #${input.goodsId}`);
    if (input.slotIndex != null) parts.push(`${['submitOrder', 'refreshOrder'].includes(input.action) ? '订单' : '货架'} ${Number(input.slotIndex) + 1}`);
    if (input.taskId != null) { meta.taskId = String(input.taskId); parts.push(`任务 #${input.taskId}`); }
    if (input.action === 'claimWeight' && input.id != null) { meta.rewardId = String(input.id); parts.push(`奖励 #${input.id}`); }
    if (input.bucketType != null) parts.push(`罐头容器类型 ${input.bucketType}`);
    function items(rows) {
        const totals = new Map();
        for (const row of rows) {
            if (row?.id == null || !/^\d+$/.test(String(row.count))) continue;
            const id = String(row.id);
            totals.set(id, (totals.get(id) || 0n) + BigInt(row.count));
        }
        return [...totals].filter(([, count]) => count > 0n).map(([id, count]) => ({ id, name: itemName(id), count: String(count) }));
    }
    // These are defined reward/cost fields, not inventory snapshots or predictions.
    meta.rewards = items([...(reply?.rewards || []), ...(reply?.reward_items || []), ...(reply?.get_items || []), ...(reply?.got_items || []), ...(reply?.op_results || []).flatMap(r => r.rewards || [])]);
    meta.costs = items([...(reply?.costs || []), ...(reply?.cost_items || []), ...(reply?.sell_items || []), ...(reply?.op_results || []).flatMap(r => r.costs || [])]);
    for (const [key, label] of [['rewards', '获得'], ['costs', '消耗']]) {
        if (meta[key].length) parts.push(`${label}：${meta[key].map(i => `${i.name} ×${i.count}`).join('、')}`);
    }
    return { meta, text: parts.join('；') };
}
module.exports = { ranchOperationDetails, ranchOperationModule };

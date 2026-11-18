const levels = require('../gameConfig/RanchLevel.json');

// 1102 is cumulative ranch experience, not farm experience or a facility level.
function ranchLevel(items) {
    const rows = items.filter(i => String(i.id) === '1102');
    if (!rows.length || rows.some(i => !/^\d+$/.test(String(i.count)))) return null;
    const exp = rows.reduce((sum, i) => sum + BigInt(i.count), 0n);
    return levels.reduce((level, row) => exp >= BigInt(row.exp) ? Math.max(level, row.level) : level, 1);
}

function upgradeBlockReason(facility, state, farmLevel) {
    if (facility.state != null && Number(facility.state) !== 1) return '设施尚未解锁';
    if (facility.upgradeState || !facility.nextLevel) return '设施正在升级或已达最高等级';
    for (const rule of String(facility.nextUpgradeConditions || '').split(';').filter(Boolean)) {
        const match = /^(LEVEL|RANCH_LEVEL):(\d+)$/.exec(rule);
        if (!match) return '设施升级条件尚未确认';
        const level = match[1] === 'RANCH_LEVEL' ? state.ranchLevel : farmLevel;
        if (!Number.isSafeInteger(Number(level)) || level == null || Number(level) < 1) return '尚未取得升级所需的账号或牧场等级';
        if (Number(level) < Number(match[2])) return `${match[1] === 'RANCH_LEVEL' ? '牧场' : '账号'}等级不足，需要 ${match[2]} 级（当前 ${level} 级）`;
    }
    if (!facility.nextUpgradeCost?.length) return '升级费用尚未确认';
    let required = 0n;
    for (const cost of facility.nextUpgradeCost) {
        if (String(cost.id) !== '1007' || !/^[1-9]\d*$/.test(String(cost.count))) return '不使用未开放的付费资源升级';
        required += BigInt(cost.count);
    }
    const usable = state.items.filter(i => String(i.id) === '1007' && !i.locked && !i.detail?.ranchProduct);
    if (usable.some(i => !/^\d+$/.test(String(i.count)))) return '金券余额尚未确认';
    if (usable.reduce((sum, i) => sum + BigInt(i.count), 0n) < required) return '金券不足，无法升级设施';
    return null;
}
module.exports = { ranchLevel, upgradeBlockReason };

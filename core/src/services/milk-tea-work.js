// 奶茶热销中「我的工作」兼职数据规范化（移植自 muyuewang/qq-farm-bot-li milk-tea-work.ts，
// 图片路径换成本仓库 /activity/milk-tea/ 资产命名）。
const catalog = require('../activity-data/milk-tea-20261015.json');

const clean = (text) => String(text || '').replace(/<[^>]+>/g, '');
const image = (file) => `/activity/milk-tea/${file}.png`;

function interactionResult(interact) {
    const type = Number(interact?.type);
    const definition = catalog.MilkTeaInteractionType.find(value => value.interaction_id === type);
    if (!definition || !Number(interact?.interaction_id)) return null;
    let reward = { name: '奶茶券', image: image('icon_s4_ticket'), count: Number(interact.friend?.bonus_amount || 0) };
    if (type === 4 && interact.success) {
        reward = { name: '宣传喇叭', image: image('icon_s4_boost'), count: 1 };
    } else if (type === 3 && interact.success) {
        const recipe = catalog.MilkTeaRecipeConfig.find(value => value.recipe_id === Number(interact.friend?.taste_recipe_id));
        reward = { name: recipe?.recipe_name || '高级奶茶', image: recipe?.image || '', count: Number(interact.friend?.taste_cups || 0) };
    }
    return { name: definition.name, reward };
}

function normalizeMilkTeaWork(work) {
    const shift = work.my_shift;
    // 官方按完整班次时长匹配工资和试饮数量；未知时长不套用四小时档。
    const duration = shift && catalog.MilkTeaHireDurationConfig.find(value => value.duration_sec === Number(shift.end_at) - Number(shift.begin_at));
    const talent = catalog.MilkTeaTalentConfig.find(value => value.talent_id === Number(shift?.talent_id || work.talent_id));
    const promote = shift?.interact_previews?.find((value) => Number(value.interaction_type) === 1);
    const interactions = catalog.MilkTeaInteractionType.map(value => {
        const detail = catalog.MilkTeaInteractionConfig.find(entry => entry.duration_id === duration?.duration_id && entry.interaction_type === value.interaction_id);
        const count = value.interaction_id === 1 ? promote?.promote_cups : detail?.random_drink_count;
        const ready = !value.des.includes('{0}') || (count != null && Number.isFinite(Number(count)));
        return { interaction_id: value.interaction_id, name: value.name, image: image(`icon_S4MyJob_interact_${value.interaction_id}`),
            description: clean(value.des).replace('{0}', count == null ? '—' : String(count)), ready };
    });
    return {
        work: { ...work, talentDescription: clean(talent?.des),
            my_shift: shift ? { ...shift, baseWage: duration ? Number(duration.duration_cost.split(':')[1]) : null, interactionResult: interactionResult(shift.interact) } : null,
            slips: (work.slips || []).map((slip) => ({ ...slip, interactionResult: interactionResult(slip.interact) })) },
        interactions,
    };
}

module.exports = { normalizeMilkTeaWork };

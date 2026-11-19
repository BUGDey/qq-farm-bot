// 牧场每日福利：slot_type=6 商城里的免费商品 goods_id=2001。
// 抓包证据（2026-11-18 00:38 HAR）：GetMallListBySlotType{slot_type:6, is_manual_open:false, global_scene_id:2}
// 回包 12 个商品，其中 2001「每日福利」免费、限购每日 1 次、奖励 80021 有机罐头×1；
// 领取就是普通商城 Purchase{goods_id:2001, count:1}。
// 农场商城用的 mallpb 是私有 bytes 布局，这里必须用官方字段的 RanchMall* 定义解码同一份 goods_list。
const { types } = require('../utils/proto');
const { getItemById, getItemImageById } = require('../config/gameConfig');

const SERVICE = 'gamepb.mallpb.MallService';
const METHOD_LIST = 'GetMallListBySlotType';
const METHOD_PURCHASE = 'Purchase';
const SLOT_TYPE = 6;
const SCENE_ID = 2;
const GOODS_ID = '2001';
const DEFAULT_TIMEOUT = 20000;

function num(value) {
    if (value == null) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function rewardDto(item) {
    const id = String(item?.id ?? '0');
    return {
        id,
        count: String(item?.count ?? '0'),
        name: getItemById(id)?.name || `物品 #${id}`,
        image: getItemImageById(id) || '',
    };
}

/**
 * 把官方 MallGoods 归一成前端能用的每日福利状态。
 * 未知字段（discount/promotion 这类没证据的生意）一律不解，避免猜语义。
 */
function describeGoods(goods, now = Date.now()) {
    if (!goods) return null;
    const limit = goods.purchase_limit || {};
    const limitCount = num(limit.limit_count);
    const boughtCount = num(limit.bought_count);
    const dailyLimited = num(limit.limit_type) === 1 && limitCount === 1;
    const rewards = (goods.reward_items || []).map(rewardDto);
    const claimed = dailyLimited && boughtCount >= limitCount && limitCount > 0;
    const available = goods.is_free === true
        && num(goods.price?.count) === 0
        && dailyLimited
        && goods.is_available === true
        && goods.is_owned !== true
        && goods.ad_only !== true
        && goods.share?.share_only !== true
        && rewards.length > 0;
    const resetText = dailyLimited ? '每日重置' : '限购规则未确认';
    return {
        goodsId: GOODS_ID,
        name: goods.name || '每日福利',
        claimed,
        available: available && !claimed,
        rewards,
        limitType: num(limit.limit_type),
        limitCount,
        boughtCount,
        resetText,
        checkedAt: now,
    };
}

function createRanchDailyBenefit({ send } = {}) {
    if (typeof send !== 'function') throw new Error('牧场每日福利缺少网络发送器');
    async function list() {
        const body = types.RanchMallListRequest.encode(types.RanchMallListRequest.create({
            slot_type: SLOT_TYPE,
            is_manual_open: false,
            global_scene_id: SCENE_ID,
        })).finish();
        const replyBody = await send(SERVICE, METHOD_LIST, body);
        const reply = types.GetMallListBySlotTypeResponse.decode(replyBody);
        const goods = [];
        for (const raw of reply.goods_list || []) {
            try { goods.push(types.RanchMallGoods.decode(raw)); } catch { /* 单个商品解不出来不影响领取 */ }
        }
        return goods;
    }

    async function read(now = Date.now()) {
        const goods = await list();
        const target = goods.find(g => String(g.goods_id) === GOODS_ID);
        const state = describeGoods(target, now);
        if (!state) return { goodsId: GOODS_ID, name: '每日福利', claimed: false, available: false, rewards: [], resetText: '服务端未下发每日福利商品', missing: true, checkedAt: now };
        return { ...state, missing: false };
    }

    async function claim(now = Date.now(), { beforePurchase } = {}) {
        const before = await read(now);
        if (before.missing) throw new Error('服务端未下发每日福利商品，暂不领取');
        if (before.claimed) throw new Error('今天的牧场每日福利已经领过了');
        if (!before.available) throw new Error('牧场每日福利当前不可领取');
        const body = types.RanchMallPurchaseRequest.encode(types.RanchMallPurchaseRequest.create({
            goods_id: GOODS_ID,
            count: 1,
        })).finish();
        beforePurchase?.();
        let reply;
        try {
            const replyBody = await send(SERVICE, METHOD_PURCHASE, body, DEFAULT_TIMEOUT);
            reply = types.RanchMallPurchaseResponse.decode(replyBody);
            if (String(reply.goods_id) !== GOODS_ID || reply.success !== true) throw new Error('Purchase reply did not confirm the requested goods');
        } catch (cause) {
            const err = new Error('领取回包未能确认，请刷新核对，勿重复提交', { cause });
            err.code = 'RANCH_DAILY_BENEFIT_UNKNOWN';
            throw err;
        }
        const rewards = (reply.reward_items || []).map(rewardDto);
        // Purchase 已明确确认成功；后续读取失败不能把已完成的领取变成可重试错误。
        let after = before;
        let refreshError;
        try { after = await read(now); } catch (err) { refreshError = err.message; }
        return { ...after, claimed: true, available: false, rewards: rewards.length ? rewards : before.rewards, ...(refreshError ? { refreshError } : {}) };
    }

    return { read, claim };
}

module.exports = { createRanchDailyBenefit, describeGoods, GOODS_ID, SLOT_TYPE, SCENE_ID };

/**
 * 节令小札活动服务（插件版）。
 *
 * 由宿主迁移而来，包含两代协议：
 *   - V2（gamepb.solartermspb.SolarTermsV2Service）：节令列表查询与答题（现役）；
 *   - V1（gamepb.solartermspb.SolarTermsService）：赠礼领取（裸 protobuf 手工编码）。
 * V2 的 createSolarTermsService 与宿主 activity-solar-terms.js 原实现逐行一致；
 * V1 副本供插件自动化 runner 使用（宿主内仍保留同份 V1 供千星游记快照）。
 * 宿主模块一律经 ctx 注入（helpers 裸读工具 / gameConfig 物品映射），禁止直接 require。
 */

const { solarTermsConfig, hasSolarQuiz } = require('./catalog/solar-terms-config');

const SERVICE_V2 = 'gamepb.solartermspb.SolarTermsV2Service';
const SERVICE_V1 = 'gamepb.solartermspb.SolarTermsService';

// ==================== V2：查询与答题 ====================

function createSolarTermsService({ types, send, assertConnected, now, mapItem }) {
    let answering = false;

    function normalizeEvent(event, nowTime = now()) {
        if (!event || Number(event.id) <= 0) return null;
        const id = Number(event.id);
        const config = solarTermsConfig.get(id);
        const status = Number(event.window_status);
        const startTime = Number(event.open_start_time);
        const endTime = Number(event.open_end_time);
        const active = status === 2 && startTime > 0 && endTime >= startTime
            && nowTime >= startTime && nowTime <= endTime;
        const answerAvailable = hasSolarQuiz(config);
        const configActive = answerAvailable && config.startTime > 0 && config.endTime >= config.startTime
            && nowTime >= config.startTime && nowTime <= config.endTime;
        const wrongOptions = (event.wrong_options || []).map(Number);
        const answerable = !!(active && configActive && !event.quiz_claimed && !event.quiz_wrong_today);
        const answerStatus = event.quiz_claimed ? '答题奖励已领取'
            : event.quiz_wrong_today ? '今日答错，明日再试'
                : !active ? '当前不在答题时间内' : !configActive ? '本地题库未覆盖当前活动' : '可答题';
        return {
            id, status, startTime, endTime,
            statusLabel: status === 3 || (endTime > 0 && nowTime > endTime) ? '已结束'
                : status === 1 || (startTime > 0 && nowTime < startTime) ? '未开始'
                    : active ? '进行中' : '暂不可参与',
            claimable: active && !event.direct_claimed,
            title: config?.name || `节令${id}`,
            rewards: (event.rewards || []).map(mapItem),
            questionRewards: (event.question_rewards || []).map(mapItem),
            question: config?.question || '',
            options: config?.options || [],
            correctOptionIndex: config?.correctOptionIndex ?? null,
            explanation: config?.error_tips || '',
            directClaimed: !!event.direct_claimed,
            quizClaimed: !!event.quiz_claimed,
            quizWrongToday: !!event.quiz_wrong_today,
            wrongOptions, answerAvailable, answerable, answerStatus,
        };
    }

    function summarize(terms, nowTime, extra = {}) {
        const group = term => term.claimable || term.answerable ? 0
            : term.startTime <= nowTime && nowTime <= term.endTime ? 1 : term.startTime > nowTime ? 2 : 3;
        terms.sort((a, b) => group(a) - group(b)
            || (group(a) === 3 ? b.startTime - a.startTime : a.startTime - b.startTime));
        return {
            ...extra, version: 'v2', nowTime, terms,
            claimableCount: terms.filter(term => term.claimable).length,
            currentTerm: terms.find(term => term.startTime <= nowTime && nowTime <= term.endTime) || null,
            nextTerm: terms.find(term => term.startTime > nowTime) || null,
        };
    }

    async function getInfo() {
        assertConnected('节令查询');
        const { body } = await send(SERVICE_V2, 'GetSolarTermsV2', types.GetSolarTermsV2Request.encode({}).finish());
        const reply = types.GetSolarTermsV2Reply.decode(body);
        const nowTime = Number(reply.server_time) || now();
        const terms = (reply.events || []).map(event => normalizeEvent(event, nowTime)).filter(Boolean);
        return summarize(terms, nowTime, { entryRedDot: !!reply.entry_red_dot, albumRedDot: !!reply.album_red_dot });
    }

    async function answer(termId, optionIndex, canProceed = () => true) {
        assertConnected('节令答题');
        if (!Number.isSafeInteger(termId) || termId <= 0 || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3)
            throw new Error('节令答题参数无效');
        if (answering) throw new Error('节令答题正在提交，请稍后刷新');
        answering = true;
        try {
            const before = await getInfo();
            const target = before.terms.find(term => term.id === termId);
            if (!target) throw new Error('未找到该节令');
            if (!target.answerable) throw new Error(target.answerStatus);
            if (target.wrongOptions.includes(optionIndex)) throw new Error('该选项已被判定错误');
            // Refresh-time checks alone do not cover disabling automation during a query.
            assertConnected('节令答题');
            if (!canProceed()) throw new Error('节令答题自动领取已关闭');
            const currentTime = now();
            const config = solarTermsConfig.get(termId);
            if (currentTime < target.startTime || currentTime > target.endTime
                || currentTime < config.startTime || currentTime > config.endTime) throw new Error('节令答题已不在活动时间内');
            const request = types.AnswerSolarTermsRequest.encode(types.AnswerSolarTermsRequest.create({
                id: termId, option_index: optionIndex,
            })).finish();
            // Do not retry a mutation if the transport result is uncertain.
            const { body } = await send(SERVICE_V2, 'AnswerSolarTerms', request);
            const reply = types.AnswerSolarTermsReply.decode(body);
            let term = normalizeEvent(reply.updated_event, before.nowTime);
            if (!term || term.id !== termId) term = { ...target };
            term = { ...term, quizClaimed: !!reply.correct || term.quizClaimed,
                quizWrongToday: !reply.correct || term.quizWrongToday, answerable: false,
                answerStatus: reply.correct ? '答题奖励已领取' : '今日答错，明日再试' };
            let solarTerms = summarize(before.terms.map(item => item.id === termId ? term : item), before.nowTime);
            try { solarTerms = await getInfo(); }
            catch (error) { solarTerms.warning = `答题已提交，状态刷新失败：${error.message}`; }
            return { ok: true, correct: !!reply.correct, rewards: (reply.rewards || []).map(mapItem), term, solarTerms };
        } finally { answering = false; }
    }

    async function autoClaim({ enabled, onResult, onError }) {
        if (!enabled()) return;
        let info;
        try { info = await getInfo(); }
        catch (error) { onError(error); return; }
        for (const term of info.terms) {
            if (!enabled()) break;
            if (!term.answerable || term.correctOptionIndex === null || term.wrongOptions.includes(term.correctOptionIndex)) continue;
            try { onResult(await answer(term.id, term.correctOptionIndex, enabled), term); }
            catch (error) { onError(error, term); }
        }
    }

    return { getInfo, answer, autoClaim, normalizeEvent };
}

// ==================== V1：赠礼领取（裸 protobuf 手工编码） ====================

function createLegacySolarTermsAccess({ send, now, helpers, requireModule, catalog, log }) {
    const {
        readProtoFields, getProtoNumber, getProtoBytesAll, getProtoBytes, getProtoString, parseActivityItemMessage,
    } = helpers;
    const solarTermNames = new Map(catalog.terms.map(term => [term.id, term.name]));

    function solarStatusLabel(status) {
        if (status === 2) return '可领取';
        if (status === 3) return '已领取';
        if (status === 1) return '未开启';
        if (status === 5) return '已结束';
        return '暂不可领取';
    }

    function normalizeSolarTerm(rawBytes) {
        const entries = readProtoFields(rawBytes);
        const status = getProtoNumber(entries, 2);
        return {
            id: getProtoNumber(entries, 1),
            status,
            statusLabel: solarStatusLabel(status),
            claimable: status === 2,
            startTime: getProtoNumber(entries, 3),
            endTime: getProtoNumber(entries, 4),
            rewards: getProtoBytesAll(entries, 5).map(parseActivityItemMessage).filter(Boolean),
            title: getProtoString(entries, 6, '') || solarTermNames.get(getProtoNumber(entries, 1)) || '节令赠礼',
        };
    }

    function isSolarTermClaimable(term, nowTime) {
        return term?.status === 2 && Number.isFinite(nowTime) && term.startTime > 0
            && term.endTime >= term.startTime && nowTime >= term.startTime && nowTime <= term.endTime;
    }

    function normalizeSolarTermsInfo(rawBody) {
        const entries = readProtoFields(rawBody);
        const terms = getProtoBytesAll(entries, 1)
            .map(normalizeSolarTerm)
            .filter(term => term.id > 0);
        const configEntries = readProtoFields(getProtoBytes(entries, 3));
        const nowTime = getProtoNumber(entries, 2) || now();
        for (const term of terms) {
            term.claimable = isSolarTermClaimable(term, nowTime);
            term.statusLabel = term.status === 3 ? '已领取' : nowTime > term.endTime && term.endTime > 0 ? '已结束'
                : nowTime < term.startTime ? '未开始' : term.claimable ? '可领取' : '暂不可领取';
        }
        const group = term => term.claimable ? 0 : term.startTime <= nowTime && nowTime <= term.endTime ? 1 : term.startTime > nowTime ? 2 : 3;
        terms.sort((a, b) => group(a) - group(b) || (group(a) === 3 ? b.startTime - a.startTime : a.startTime - b.startTime));
        return {
            nowTime,
            terms,
            claimableCount: terms.filter(term => term.claimable).length,
            currentTerm: terms.find(term => term.startTime <= nowTime && nowTime <= term.endTime) || null,
            nextTerm: terms.find(term => term.startTime > nowTime) || null,
            tipsText: getProtoString(configEntries, 3, ''),
        };
    }

    function normalizeSolarTermsClaimResult(rawBody) {
        const entries = readProtoFields(rawBody);
        const termBytes = getProtoBytes(entries, 2);
        return {
            rewards: getProtoBytesAll(entries, 1).map(parseActivityItemMessage).filter(Boolean),
            term: termBytes ? normalizeSolarTerm(termBytes) : null,
        };
    }

    async function getLegacySolarTermsInfo() {
        const { body } = await send(SERVICE_V1, 'GetSolarTerms', Buffer.alloc(0));
        return normalizeSolarTermsInfo(Buffer.from(body || []));
    }

    async function claimLegacySolarTermsReward(termId = 0) {
        const before = await getLegacySolarTermsInfo();
        const resolvedTermId = Number(termId) || Number(before?.currentTerm?.id) || 0;
        if (resolvedTermId <= 0) throw new Error('未找到可领取的节令奖励');
        const target = (before.terms || []).find(term => term.id === resolvedTermId) || null;
        if (!target || !target.claimable) {
            throw new Error(`${target?.title || '该节令'}当前不可领取`);
        }
        // 官方未公开 V1 领取的 proto 定义：termId 为第 1 字段的 varint 手工编码
        // 宿主模块经 ctx.requireModule 白名单解析（插件目录解析不到宿主 node_modules）
        const request = requireModule('protobufjs').Writer.create()
            .uint32((1 << 3) | 0)
            .uint32(Math.max(0, resolvedTermId))
            .finish();
        const { body } = await send(SERVICE_V1, 'ClaimSolarTerms', Buffer.from(request));
        const result = normalizeSolarTermsClaimResult(Buffer.from(body || []));
        const after = await getLegacySolarTermsInfo();
        log('活动', `节令小札领取成功：${target.title}，${result.rewards.length} 项奖励`, {
            module: 'activity', event: 'solar_terms_claim', termId: resolvedTermId, termTitle: target.title, result: 'success',
        });
        return {
            ok: true,
            termId: resolvedTermId,
            rewards: result.rewards,
            term: result.term,
            solarTerms: after,
        };
    }

    return { getLegacySolarTermsInfo, claimLegacySolarTermsReward };
}

module.exports = { createSolarTermsService, createLegacySolarTermsAccess, hasSolarQuiz };

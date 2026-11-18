/**
 * 牧歌初启（muge）活动服务
 *
 * 从上游 activity-center 的 muge-activity.ts 移植为本地 JS 单模块。
 * 协议定义见 core/src/proto/muge.proto（package gamepb.activitypb，服务名仍是 ActivityService），
 * 配置（题目 / 人格结果 / 任务分值）见 core/src/activity-data/muge-20261117.json。
 *
 * 设计约束：
 * - 只做有协议定义支撑的读取与领取，不猜字段；
 * - 写操作串行（mutationTail），避免同一活动并发提交导致回包错配；
 * - 回包与请求不匹配时一律报“未确认”，提示用户刷新核对，绝不谎报成功。
 */
const config = require('../activity-data/muge-20261117.json');
const { types } = require('../utils/proto');
const { sendMsgAsync } = require('../utils/network');
const { getServerTimeSec, toNum } = require('../utils/utils');
const { getItemById, getItemImageById } = require('../config/gameConfig');
const { util } = require('protobufjs');
const { businessError } = require('./activity-center-helpers');
const ranchItems = new Map(require('../gameConfig/RanchConfig.json').MCItemInfo.map(row => [String(row.id), row]));
const ranchItemIcons = require('../gameConfig/RanchItemIcons.json');

const GROUP_ID = '2026111700';
const IDS = { celebration: '2026111702', friends: '2026111703', handbook: '2026111704', personality: '2026111705' };

// 每个操作对应的子活动 id、cmd 以及回包里承载结果的那个字段。
const OPERATIONS = {
  claimCelebration: { id: IDS.celebration, cmd: 85, field: 'global_count_claim_tier' },
  claimFriends: { id: IDS.friends, cmd: 84, field: 'invite_friend_tier_claim' },
  claimTask: { id: IDS.handbook, cmd: 82, field: 'task_claim' },
  claimHandbook: { id: IDS.handbook, cmd: 83, field: 'task_tier_claim' },
  saveAnswers: { id: IDS.personality, cmd: 86, field: 'survey_save_progress' },
  settle: { id: IDS.personality, cmd: 87, field: 'survey_settle' },
  claimShare: { id: IDS.personality, cmd: 89, field: 'survey_claim_share_reward' },
};

let mutationTail = Promise.resolve();

function itemDto(item) {
  const id = toNum(item.id);
  const info = getItemById(id) || ranchItems.get(String(id));
  return { id, count: toNum(item.count), name: info?.name || `物品 #${id}`, image: ranchItemIcons[String(id)] || getItemImageById(id) };
}

function tierDto(tier) {
  return {
    id: String(tier.tier_id),
    threshold: toNum(tier.threshold),
    status: tier.status,
    rewards: (tier.reward || []).map(itemDto),
  };
}

/** map<int64,int64> 的键在 wire 上可能是二进制 hash，统一换成十进制字符串。 */
function answersDto(answers) {
  return Object.fromEntries(Object.entries(answers || {}).map(([key, value]) => [
    /^\d+$/.test(key) ? key : util.longFromHash(key).toString(),
    toNum(value),
  ]));
}

async function getMugeActivity() {
  if (!types.MugeListReply || !types.ActivityListRequest) {
    throw businessError('MUGE_UNAVAILABLE', '牧歌初启协议未加载');
  }
  const body = types.ActivityListRequest.encode({ game_scene_id: 1 }).finish();
  const response = await sendMsgAsync('gamepb.activitypb.ActivityService', 'List', body);
  const groups = types.MugeListReply.decode(response.body).groups || [];
  const group = groups.find(entry => String(entry.head?.id) === GROUP_ID);
  if (String(group?.head?.id) !== GROUP_ID) throw businessError('MUGE_UNAVAILABLE', '牧歌初启活动数据暂不可用');

  const find = id => (group.children || []).find(entry => String(entry.head?.id) === id);
  const celebration = find(IDS.celebration)?.global_count;
  const friends = find(IDS.friends)?.invite_friend;
  const handbook = find(IDS.handbook)?.task;
  const personality = find(IDS.personality)?.survey;

  const now = getServerTimeSec() * 1000;
  const startTime = toNum(group.head.start_time) * 1000;
  const endTime = toNum(group.head.end_time) * 1000;
  const active = group.head.status === 1 && now >= startTime && now < endTime;
  const personalityId = toNum(personality?.personality_id);

  return {
    activityId: GROUP_ID,
    title: '牧歌初启',
    serverTime: now,
    startTime,
    endTime,
    active,
    rules: String(group.head.desc || '').split(/\r?\n/).filter(Boolean),
    celebration: celebration ? { total: toNum(celebration.total), tiers: (celebration.tiers || []).map(tierDto) } : null,
    friends: friends ? { count: (friends.counted_friends || []).length, tiers: (friends.tiers || []).map(tierDto) } : null,
    handbook: handbook ? {
      points: toNum(handbook.tier_points),
      tiers: (handbook.tiers || []).map(tierDto),
      tasks: (handbook.tasks || []).map(task => ({
        id: String(task.task_id),
        description: task.desc,
        progress: toNum(task.progress),
        target: toNum(task.target),
        status: task.status,
        unlockDay: toNum(task.unlock_day),
        points: config.tasks.find(entry => entry.id === toNum(task.task_id))?.points || 0,
        rewards: (task.reward || []).map(itemDto),
      })),
    } : null,
    personality: personality ? {
      answers: answersDto(personality.answers),
      personalityId,
      settleCount: toNum(personality.settle_count),
      image: config.results.find(entry => entry.id === personalityId)?.image || '',
      shareRewardClaimed: personality.share_reward_claimed,
    } : null,
    questions: config.questions,
  };
}

async function perform(action, input = {}, options = {}) {
  const operation = Object.hasOwn(OPERATIONS, action) ? OPERATIONS[action] : null;
  if (!operation) throw businessError('INVALID_MUGE_ACTION', '未知的牧歌初启操作');
  // 自动化 runner 传入的护栏：每次 await 前后复查开关/场景，写前再核对一次可领取状态。
  // 手动操作不传这两个回调，行为与以前完全一致。
  const { guard = () => {}, beforeWrite = () => {} } = options;
  guard();

  const state = await getMugeActivity();
  guard();
  if (!state.active) throw businessError('MUGE_ENDED', '牧歌初启尚未开始或已经结束');

  let params = {};
  if (action === 'claimCelebration' || action === 'claimFriends' || action === 'claimHandbook') {
    const section = action === 'claimCelebration' ? state.celebration : action === 'claimFriends' ? state.friends : state.handbook;
    // status === 2 表示可领取；服务端接受 tier_id: 0 表示领取全部已达成档位。
    if (!section?.tiers.some(tier => tier.status === 2)) throw businessError('MUGE_NOT_CLAIMABLE', '当前没有可领取的档位奖励');
    params = { tier_id: 0 };
  } else if (action === 'claimTask') {
    if (!state.handbook?.tasks.some(task => task.status === 2)) throw businessError('MUGE_NOT_CLAIMABLE', '任务未完成或奖励已领取');
    params = { task_id: 0 };
  } else {
    if (!state.personality) throw businessError('MUGE_UNAVAILABLE', '牧场人格数据暂不可用');
    if (action === 'saveAnswers') {
      if (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) throw businessError('INVALID_MUGE_ANSWERS', '请选择题目答案');
      if (input.clear !== undefined && typeof input.clear !== 'boolean') throw businessError('INVALID_MUGE_ANSWERS', '重答标记无效');
      // 清空旧进度与写入新答案是两次独立提交：混在一起无法判断回包对应哪一步。
      if (input.clear === true && Object.keys(input.answers).length) throw businessError('INVALID_MUGE_ANSWERS', '清空进度和保存答案需要分开提交，请刷新页面重新测试');
      if (input.clear !== true && !Object.keys(input.answers).length) throw businessError('INVALID_MUGE_ANSWERS', '请选择题目答案');
      for (const [questionId, value] of Object.entries(input.answers)) {
        const question = config.questions.find(entry => String(entry.id) === questionId);
        if (!question?.options.some(option => option.value === value)) throw businessError('INVALID_MUGE_ANSWERS', '题目或答案无效');
      }
      params = { answers: input.answers, clear: input.clear === true };
    } else if (action === 'settle') {
      const complete = config.questions.every(question => question.options.some(option => option.value === state.personality.answers[String(question.id)]));
      if (!complete) throw businessError('MUGE_ANSWERS_INCOMPLETE', '请先完成全部题目');
    } else if (!state.personality.personalityId || state.personality.shareRewardClaimed) {
      throw businessError('MUGE_NOT_CLAIMABLE', '请先完成人格测试，首次分享奖励仅可领取一次');
    }
  }

  if (!types.MugeOperateRequest || !types.MugeOperateReply) throw businessError('MUGE_UNAVAILABLE', '牧歌初启协议未加载');
  // 写前最后一次核对：状态已变化或开关已关闭就放弃本次提交（避免重复领取）。
  beforeWrite(state);
  guard();
  const body = types.MugeOperateRequest.encode({ id: operation.id, cmd: operation.cmd, [operation.field]: params }).finish();
  const response = await sendMsgAsync('gamepb.activitypb.ActivityService', 'Operate', body);
  guard();
  const reply = types.MugeOperateReply.decode(response.body);
  const result = reply[operation.field];
  if (String(reply.id) !== operation.id
    || toNum(reply.cmd) !== operation.cmd
    || !result
    || String(reply.activity?.head?.id) !== operation.id) {
    throw businessError('MUGE_RESULT_UNKNOWN', '操作回包未能确认，请刷新核对，勿重复提交');
  }

  const claimedIds = result.claimed_ids || [];
  const surveyAnswers = answersDto(reply.activity?.survey?.answers);
  const failed = (['claimTask', 'claimHandbook', 'claimCelebration', 'claimFriends'].includes(action) && !claimedIds.length)
    || (action === 'claimShare' && !reply.activity?.survey?.share_reward_claimed)
    || (action === 'settle' && toNum(reply.activity?.survey?.personality_id) <= 0)
    || (action === 'saveAnswers' && !reply.activity?.survey)
    || (action === 'saveAnswers' && params.clear && Object.values(surveyAnswers).some(value => value > 0))
    || (action === 'saveAnswers' && !params.clear && !Object.entries(input.answers).every(([key, value]) => surveyAnswers[key] === value));
  if (failed) throw businessError('MUGE_RESULT_UNKNOWN', '操作状态未能确认，请刷新核对，勿重复提交');

  const rewards = (result.awards || []).map(itemDto);
  const fresh = await getMugeActivity();
  guard();
  return { activity: fresh, rewards };
}

/** 写操作串行化：前一次失败不阻塞后续请求。 */
function operateMugeActivity(action, input = {}, options = {}) {
  const pending = mutationTail.then(() => perform(action, input, options));
  mutationTail = pending.catch(() => {});
  return pending;
}

module.exports = { getMugeActivity, operateMugeActivity, MUGE_GROUP_ID: GROUP_ID, MUGE_OPERATIONS: OPERATIONS };

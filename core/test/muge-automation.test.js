'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AUTO_ACTIONS, createMugeAutomation } = require('../src/services/muge-automation');

const questions = require('../src/activity-data/muge-20261117.json').questions;
function answeredState() {
  return Object.fromEntries(questions.map(q => [String(q.id), q.options[0].value]));
}
function baseState(overrides = {}) {
  return {
    activityId: '2026111700', startTime: 1, endTime: 9999999999, active: true,
    celebration: { tiers: [] }, friends: { tiers: [] }, handbook: { tiers: [], tasks: [] },
    personality: { personalityId: 0, settleCount: 0, answers: {} },
    ...overrides,
  };
}
function harness({ state = baseState(), automation = {}, isReady = () => true } = {}) {
  const operations = [];
  const runner = createMugeAutomation({
    getState: async () => state,
    operate: async (action, input, options) => {
      options?.beforeWrite?.(state);
      options?.guard?.();
      operations.push(action);
      return { activity: state, rewards: [] };
    },
    getAutomation: () => automation,
    isReady,
    assertScene: () => {},
    now: () => 1000,
    budgetMs: 20000,
  });
  return { runner, operations };
}

test('automation keys include compatible settlement and questionnaire automation', () => {
  assert.deepEqual(Object.entries(AUTO_ACTIONS), [
    ['muge_task_claim', 'claimTask'],
    ['muge_celebration_claim', 'claimCelebration'],
    ['muge_friend_claim', 'claimFriends'],
    ['muge_personality_settle', 'settle'],
    ['muge_auto_answer', 'autoAnswer'],
    ['muge_handbook_claim', 'claimHandbook'],
  ]);
  // 人格结算不代答、不重置、不分享、不伪造邀请。
  assert.equal(Object.values(AUTO_ACTIONS).some(a => ['saveAnswers', 'claimShare'].includes(a)), false);
});

test('all switches off means no operation at all', async () => {
  const { runner, operations } = harness({ state: baseState({ handbook: { tiers: [{ id: '1', status: 2 }], tasks: [{ id: '9', status: 2 }] } }) });
  await runner();
  assert.deepEqual(operations, []);
});

test('enabled claim acts once for claimable tiers/tasks, skips non-claimable ones', async () => {
  const state = baseState({
    celebration: { tiers: [{ id: '1', status: 2 }] },
    handbook: { tiers: [{ id: '2', status: 1 }], tasks: [{ id: '9', status: 2 }] },
  });
  const { runner, operations } = harness({ state, automation: {
    muge_celebration_claim: true, muge_handbook_claim: true, muge_task_claim: true,
  } });
  await runner();
  assert.deepEqual(operations.sort(), ['claimCelebration', 'claimTask']);
});

test('settle is skipped unless every question is answered and no settle happened', async () => {
  const incomplete = baseState();
  const a = harness({ state: incomplete, automation: { muge_personality_settle: true } });
  await a.runner();
  assert.deepEqual(a.operations, []);
  const complete = baseState({ personality: { personalityId: 0, settleCount: 0, answers: answeredState() } });
  const b = harness({ state: complete, automation: { muge_personality_settle: true } });
  await b.runner();
  assert.deepEqual(b.operations, ['settle']);
  const settled = baseState({ personality: { personalityId: 123, settleCount: 1, answers: answeredState() } });
  const c = harness({ state: settled, automation: { muge_personality_settle: true } });
  await c.runner();
  assert.deepEqual(c.operations, []);
});

test('guard stops pending actions when readiness drops mid-run', async () => {
  let ready = true;
  const state = baseState({ celebration: { tiers: [{ id: '1', status: 2 }] }, handbook: { tasks: [{ id: '9', status: 2 }] } });
  const operations = [];
  const runner = createMugeAutomation({
    getState: async () => state,
    operate: async (action, _input, options) => {
      options?.beforeWrite?.(state);
      options?.guard?.();
      operations.push(action);
      ready = false; // 第一个动作提交成功后停号，下一动作应被 guard 拦下。
    },
    getAutomation: () => ({ muge_celebration_claim: true, muge_task_claim: true }),
    isReady: () => ready,
    assertScene: () => {},
  });
  await assert.rejects(runner(), /停止|超时/);
  assert.deepEqual(operations, ['claimTask']);
});

test('submitted fingerprint is kept so an ambiguous round is never replayed', async () => {
  const state = baseState({ celebration: { tiers: [{ id: '1', status: 2 }] } });
  const { runner, operations } = harness({ state, automation: { muge_celebration_claim: true } });
  await runner();
  await runner();
  assert.deepEqual(operations, ['claimCelebration']);
});

function surveyHarness(state, { failSave = false, disableAfterSave = false } = {}) {
  const calls = [];
  const automation = { muge_auto_answer: true };
  const runner = createMugeAutomation({
    getState: async () => state,
    getAutomation: () => automation,
    operate: async (action, input, options) => {
      options.guard();
      options.beforeWrite(state);
      calls.push({ action, input });
      if (action === 'saveAnswers') {
        if (failSave) throw new Error('ambiguous response');
        Object.assign(state.personality.answers, input.answers);
        if (disableAfterSave) automation.muge_auto_answer = false;
      } else if (action === 'settle') {
        state.personality.personalityId = 123;
        state.personality.settleCount = 1;
      }
      return { activity: state };
    },
  });
  return { runner, calls };
}

test('auto answer fills missing choices, preserves saved answers, settles once', async () => {
  const state = baseState();
  const first = questions[0];
  const saved = first.options.at(-1).value;
  state.personality.answers[String(first.id)] = saved;
  const { runner, calls } = surveyHarness(state);
  await runner();
  await runner();
  assert.deepEqual(calls.map(c => c.action), ['saveAnswers', 'settle']);
  assert.equal(calls[0].input.clear, false);
  assert.equal(calls[0].input.answers[String(first.id)], undefined);
  assert.equal(state.personality.answers[String(first.id)], saved);
  assert.equal(Object.keys(state.personality.answers).length, questions.length);
});

test('complete questionnaire settles without saving or clearing', async () => {
  const state = baseState({ personality: { personalityId: 0, settleCount: 0, answers: answeredState() } });
  const { runner, calls } = surveyHarness(state);
  await runner();
  assert.deepEqual(calls.map(c => c.action), ['settle']);
});

test('expired or settled questionnaires never write', async () => {
  for (const state of [baseState({ active: false }), baseState({ personality: { personalityId: 123, settleCount: 1, answers: {} } })]) {
    const { runner, calls } = surveyHarness(state);
    await runner();
    assert.deepEqual(calls, []);
  }
});

test('unknown save result is not resubmitted and never settles', async () => {
  const { runner, calls } = surveyHarness(baseState(), { failSave: true });
  await assert.rejects(runner(), /ambiguous response/);
  await runner();
  assert.deepEqual(calls.map(c => c.action), ['saveAnswers']);
});

test('disabling after save prevents settlement', async () => {
  const { runner, calls } = surveyHarness(baseState(), { disableAfterSave: true });
  await assert.rejects(runner(), /停止|超时/);
  assert.deepEqual(calls.map(c => c.action), ['saveAnswers']);
});

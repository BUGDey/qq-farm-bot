import assert from 'node:assert/strict'
import test from 'node:test'
import { isHelpAction, isNuisanceAction, isStealAction } from '../src/utils/interact-types.ts'

// 2026-11 抓包里偷取记录是 action_type 13（带 crop_id/crop_count），旧版是 1。
// 9/11 缺字段证据，必须留在「未知互动」里，不能算偷取或帮忙。
test('interact action types keep 13 as steal and leave 9/11 unknown', () => {
  assert.equal(isStealAction(1), true)
  assert.equal(isStealAction(13), true)
  assert.equal(isStealAction(9), false)
  assert.equal(isStealAction(11), false)
  assert.equal(isHelpAction(2), true)
  assert.equal(isHelpAction(11), false)
  assert.equal(isNuisanceAction(3), true)
  assert.equal(isNuisanceAction(13), false)
  assert.equal(isStealAction('13'), true, '字符串型 action_type 也应识别')
  assert.equal(isStealAction(undefined), false)
})

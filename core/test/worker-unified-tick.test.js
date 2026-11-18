const test = require('node:test');
const assert = require('node:assert/strict');

function createTickRunner() {
  let running = false;
  let permit = 0;
  let runs = 0;
  let gatewaySkip = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      if (gatewaySkip) return;
      permit += 1;
      try { runs += 1; } finally { permit -= 1; }
    } finally {
      running = false;
    }
  };
  return { run, setGatewaySkip: value => { gatewaySkip = value; }, state: () => ({ running, permit, runs }) };
}

test('unified scheduler releases overlap guard after gateway early return', async () => {
  const tick = createTickRunner();
  tick.setGatewaySkip(true);
  await tick.run();
  assert.equal(tick.state().running, false);
  assert.equal(tick.state().permit, 0);
  tick.setGatewaySkip(false);
  await tick.run();
  assert.equal(tick.state().running, false);
  assert.equal(tick.state().runs, 1);
});

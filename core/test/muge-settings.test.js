'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('muge_auto_answer persists true and false across fresh processes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'muge-settings-'));
  const env = { ...process.env, FARM_DATA_DIR: dir, FARM_ACCOUNT_ID: 'muge-regression' };
  function run(source) {
    return execFileSync(process.execPath, ['-e', source], { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8' });
  }
  const load = "const s=require('./src/models/store');";
  try {
    run(load + "s.setAutomation('muge_auto_answer',true); if(s.getAutomation().muge_auto_answer!==true) process.exit(2);");
    assert.match(run(load + "console.log('VALUE='+s.getAutomation().muge_auto_answer)"), /VALUE=true/);
    run(load + "s.setAutomation('muge_auto_answer',false)");
    assert.match(run(load + "console.log('VALUE='+s.getAutomation().muge_auto_answer)"), /VALUE=false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

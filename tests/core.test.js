const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/core.js');

test('all golden eval cases pass', () => {
  const failed = L.runEvals().filter(e => !e.pass);
  assert.deepStrictEqual(failed, []);
});

test('smart recovery beats plain retries and never breaks card rules', () => {
  const r = L.runAll({ count: 10000, seed: 2026 });
  const tx = Object.fromEntries(r.data.txns.map(t => [t.id, t]));
  let smart = 0, naive = 0;
  for (const x of r.recovery) {
    if (x.recovered) smart += tx[x.txn].usd;
    if (x.naiveOk) naive += tx[x.txn].usd;
    // the policy never retries a hard decline
    if (x.kind !== 'soft') assert.ok(!x.steps.some(s => s.action.startsWith('retry')));
  }
  assert.ok(smart > naive * 2, `smart ${smart} vs naive ${naive}`);
});

test('reconciliation finds every injected mismatch with no false alarms', () => {
  const r = L.runAll({ count: 10000, seed: 7 });
  const found = new Set(r.recon.breaks.map(b => b.ref + ':' + b.type));
  for (const [ref, type] of Object.entries(r.settle.injected)) assert.ok(found.has(ref + ':' + type), `${ref} ${type}`);
  const falseAlarms = r.recon.breaks.filter(b => !r.settle.injected[b.ref]);
  assert.strictEqual(falseAlarms.length, 0);
});

test('same seed gives the same week', () => {
  const a = L.runAll({ count: 2000, seed: 42 }), b = L.runAll({ count: 2000, seed: 42 });
  assert.strictEqual(a.recon.breaks.length, b.recon.breaks.length);
  assert.strictEqual(a.recovery.length, b.recovery.length);
});

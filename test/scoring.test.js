/* Unit tests for the Meridian scoring core (js/data.js — pure functions).
 * Run with:  node --test test/
 * data.js attaches MeridianData to `this`, which is module.exports under CommonJS. */
const test = require('node:test');
const assert = require('node:assert');
const { MeridianData: M } = require('../js/data.js');

function span(overrides) {
  return Object.assign({
    clearanceFt: 10, requiredFt: 4, growthRate: 2,
    tier: 2, customers: 500, kv: 12, slope: 10, accessHard: false
  }, overrides);
}

test('generate() is deterministic across calls', () => {
  const a = M.generate(), b = M.generate();
  assert.strictEqual(a.spans.length, b.spans.length);
  assert.ok(a.spans.length > 400, 'expected a few hundred spans');
  for (let i = 0; i < 25; i++) {
    assert.strictEqual(a.spans[i].id, b.spans[i].id);
    assert.strictEqual(a.spans[i].vri, b.spans[i].vri);
    assert.strictEqual(a.spans[i].clearanceFt, b.spans[i].clearanceFt);
  }
});

test('timeToViolation: violation now, stable, and a plain case', () => {
  assert.strictEqual(M.timeToViolation(span({ clearanceFt: 3, requiredFt: 4 })), 0);
  assert.strictEqual(M.timeToViolation(span({ clearanceFt: 4, requiredFt: 4 })), 0);
  assert.strictEqual(M.timeToViolation(span({ growthRate: 0 })), 999);
  // 6 ft of headroom at 3 ft/yr = 24 months
  assert.strictEqual(M.timeToViolation(span({ clearanceFt: 10, requiredFt: 4, growthRate: 3 })), 24);
});

test('factorsFor: encroachment saturates at violation, zeroes at 20 ft headroom', () => {
  assert.strictEqual(M.factorsFor(span({ clearanceFt: 2, requiredFt: 4 })).enc, 1);
  assert.strictEqual(M.factorsFor(span({ clearanceFt: 24, requiredFt: 4 })).enc, 0);
  const f = M.factorsFor(span());
  for (const k of ['enc', 'growth', 'fire', 'crit', 'access']) {
    assert.ok(f[k] >= 0 && f[k] <= 1, `${k} in [0,1]`);
  }
});

test('computeVRI stays in [0,100] for every generated span', () => {
  for (const s of M.generate().spans) {
    assert.ok(s.vri >= 0 && s.vri <= 100, `${s.id} vri=${s.vri}`);
  }
});

test('computeVRI renormalizes weights (scaling all weights changes nothing)', () => {
  const s = span();
  const w1 = Object.assign({}, M.DEFAULT_WEIGHTS);
  const w2 = {};
  for (const k of Object.keys(w1)) w2[k] = w1[k] * 2;
  assert.strictEqual(M.computeVRI(s, w1), M.computeVRI(s, w2));
});

test('computeVRI with all-zero weights does not divide by zero', () => {
  const zero = { encroachment: 0, growth: 0, fire: 0, criticality: 0, access: 0 };
  assert.strictEqual(M.computeVRI(span(), zero), 0);
});

test('consequence scales with HFTD tier', () => {
  const base = { customers: 100 };
  const t1 = M.consequence(span(Object.assign({ tier: 1 }, base)));
  const t2 = M.consequence(span(Object.assign({ tier: 2 }, base)));
  const t3 = M.consequence(span(Object.assign({ tier: 3 }, base)));
  assert.ok(t1 < t2 && t2 < t3, 'tier multiplier is monotonic');
  assert.strictEqual(t1, 100);
  assert.strictEqual(t3, 320);
});

/* Unit tests for computeModel — the retirement projection engine.
   computeModel(p) is pure: it takes a params object and returns
   { p, accM, decM, N, eq, mix, paid } with no DOM dependency. */
import { test } from 'node:test';
import assert from 'node:assert';
import { loadApp, closeTo } from './_loadApp.mjs';

const { computeModel } = loadApp();

// A valid params object; rates are fractions (e.g. 0.07 = 7%), eqGs/eqGe 0..1.
function makeP(over = {}) {
  return {
    contrib: 1000, step: 0, eqR: 0.07, bdR: 0.03, infl: 0.025, fee: 0.002,
    spb: true, age: 30, retAge: 67, endAge: 92, horizon: 37, start: 10000,
    income: 2000, eqGs: 1.0, eqGe: 0.5, ...over,
  };
}

test('accumulation/decumulation month counts round from years', () => {
  const m = computeModel(makeP({ horizon: 37, retAge: 67, endAge: 92 }));
  assert.equal(m.accM, 444);          // 37 * 12
  assert.equal(m.decM, 300);          // (92 - 67) * 12
  assert.equal(m.N, m.accM);
  assert.equal(m.paid.length, m.accM);
});

test('zero net return + zero contribution conserves the starting pot', () => {
  // eqR==fee and bdR==fee -> monthly real return is exactly 0 for any mix
  const m = computeModel(makeP({ eqR: 0.05, fee: 0.05, bdR: 0.05, contrib: 0, start: 10000, horizon: 10 }));
  assert.ok(closeTo(m.eq.potAtRet.potNom, 10000));
  assert.ok(closeTo(m.mix.potAtRet.potNom, 10000));
});

test('contributions with zero return sum to paid-in', () => {
  const m = computeModel(makeP({ eqR: 0.05, fee: 0.05, bdR: 0.05, contrib: 100, step: 0, start: 0, horizon: 1 }));
  assert.ok(closeTo(m.eq.potAtRet.potNom, 1200));     // 12 * 100, no growth
  assert.ok(closeTo(m.paid[m.paid.length - 1].nom, 1200));
});

test('positive return makes the pot exceed contributions', () => {
  const m = computeModel(makeP({ contrib: 0, start: 10000, eqR: 0.10, fee: 0, bdR: 0, horizon: 10, eqGs: 1, eqGe: 1 }));
  assert.ok(m.eq.potAtRet.potNom > 10000);                          // it grew
  assert.ok(m.eq.potAtRet.potNom > m.paid[m.paid.length - 1].nom);  // beats paid-in
});

test('100% equity strategy keeps equity weight at 1 throughout', () => {
  const m = computeModel(makeP());
  assert.ok(m.eq.acc.every((pt) => pt.eqW === 1.0));
  assert.equal(m.eq.eqRet, 1.0);
});

test('mix strategy glides equity weight from eqGs to eqGe', () => {
  const m = computeModel(makeP({ eqGs: 1.0, eqGe: 0.5 }));
  assert.ok(closeTo(m.mix.acc[0].eqW, 1.0));                    // first month = eqGs
  assert.ok(closeTo(m.mix.acc[m.accM - 1].eqW, 0.5));           // last month = eqGe
  assert.equal(m.mix.eqRet, 0.5);
});

test('sustainable withdrawal is positive when a pot exists', () => {
  const m = computeModel(makeP());
  assert.ok(m.mix.sustainable > 0);
  assert.ok(m.eq.sustainable > 0);
});

test('step-up raises later contributions above the base rate', () => {
  const flat = computeModel(makeP({ step: 0, eqR: 0.05, fee: 0.05, bdR: 0.05, start: 0, horizon: 5 }));
  const stepped = computeModel(makeP({ step: 0.05, eqR: 0.05, fee: 0.05, bdR: 0.05, start: 0, horizon: 5 }));
  // same base contribution, but step-up compounds -> more paid in by retirement
  assert.ok(stepped.eq.potAtRet.potNom > flat.eq.potAtRet.potNom);
});

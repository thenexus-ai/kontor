/* Unit tests for the German investment-tax helpers in finance_dashboard.js.
   Constants: ABG (Abgeltungsteuer) = 0.26375, TF_EQ (equity Teilfreistellung)
   = 0.30, SPB (Sparer-Pauschbetrag) = 1000 €. */
import { test } from 'node:test';
import assert from 'node:assert';
import { loadApp, closeTo } from './_loadApp.mjs';

const { applyTax, effRate, ABG, TF_EQ, SPB } = loadApp();

test('tax constants match German 2026 rules', () => {
  assert.equal(ABG, 0.26375);
  assert.equal(TF_EQ, 0.30);
  assert.equal(SPB, 1000);
});

test('applyTax: equity gain gets the 30% Teilfreistellung', () => {
  // 1000 equity gain -> 70% taxable -> 700 * 0.26375
  assert.ok(closeTo(applyTax(1000, 0, false), 700 * ABG));
});

test('applyTax: bond gain is fully taxable', () => {
  assert.ok(closeTo(applyTax(0, 1000, false), 1000 * ABG));
});

test('applyTax: equity + bond gains combine correctly', () => {
  assert.ok(closeTo(applyTax(1000, 500, false), (700 + 500) * ABG));
});

test('applyTax: Sparer-Pauschbetrag exempts the first 1000 of taxable base', () => {
  // 1000 equity -> 700 taxable, minus 1000 allowance -> 0
  assert.ok(closeTo(applyTax(1000, 0, true), 0));
  // 2000 equity -> 1400 taxable, minus 1000 -> 400 * ABG
  assert.ok(closeTo(applyTax(2000, 0, true), 400 * ABG));
});

test('applyTax: negative gains are floored at zero (no negative tax)', () => {
  assert.equal(applyTax(-500, 0, false), 0);
  assert.equal(applyTax(0, -500, false), 0);
  assert.equal(applyTax(-500, -500, true), 0);
});

test('effRate: blended effective rate by equity weight', () => {
  assert.ok(closeTo(effRate(1), ABG * (1 - TF_EQ)));   // 100% equity
  assert.ok(closeTo(effRate(0), ABG));                  // 100% bonds
  assert.ok(closeTo(effRate(0.7), 0.7 * ABG * (1 - TF_EQ) + 0.3 * ABG));
});

test('effRate: monotonically decreases as equity weight rises', () => {
  assert.ok(effRate(0) > effRate(0.5));
  assert.ok(effRate(0.5) > effRate(1));
});

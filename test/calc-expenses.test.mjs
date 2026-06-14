/* Unit tests for expense aggregation and number formatting/parsing.
   All pure: monthlyRate / activeCount / annualActual / annualFull, plus the
   de-DE-aware parseNum and the eur formatter. */
import { test } from 'node:test';
import assert from 'node:assert';
import { loadApp } from './_loadApp.mjs';

const { monthlyRate, activeCount, annualActual, annualFull, parseNum, eur } = loadApp();

const exp = (over = {}) => ({ amount: 100, unit: 'month', months: Array(12).fill(true), ...over });

test('monthlyRate: monthly unit is the amount as-is', () => {
  assert.equal(monthlyRate(exp({ amount: 250, unit: 'month' })), 250);
});

test('monthlyRate: yearly unit is amortised over 12 months', () => {
  assert.equal(monthlyRate(exp({ amount: 1200, unit: 'year' })), 100);
});

test('monthlyRate: missing amount is treated as 0', () => {
  assert.equal(monthlyRate({ unit: 'month', months: [] }), 0);
});

test('activeCount: counts the active months', () => {
  assert.equal(activeCount(exp()), 12);
  assert.equal(activeCount(exp({ months: [true, false, true, false, false, false, false, false, false, false, false, false] })), 2);
  assert.equal(activeCount(exp({ months: Array(12).fill(false) })), 0);
});

test('annualActual: monthly rate times active months', () => {
  // 100/mo, active 6 months -> 600 this year
  const e = exp({ amount: 100, unit: 'month', months: [true, true, true, true, true, true, false, false, false, false, false, false] });
  assert.equal(annualActual(e), 600);
});

test('annualFull: the 12-month-equivalent cost', () => {
  assert.equal(annualFull(exp({ amount: 100, unit: 'month' })), 1200);
  assert.equal(annualFull(exp({ amount: 1200, unit: 'year' })), 1200);
});

test('annualActual equals annualFull when active all year', () => {
  const e = exp({ amount: 80, unit: 'month' });
  assert.equal(annualActual(e), annualFull(e));
});

test('parseNum: German thousands/decimal formats', () => {
  assert.equal(parseNum('2.500'), 2500);       // grouping dot
  assert.equal(parseNum('2.500,50'), 2500.5);  // grouping + decimal comma
  assert.equal(parseNum('1.234,5'), 1234.5);
  assert.equal(parseNum('12,5'), 12.5);        // decimal comma
  assert.equal(parseNum('1000'), 1000);
  assert.equal(parseNum('2.5'), 2.5);          // lone dot = decimal point
  assert.equal(parseNum('1.234.567'), 1234567); // pure grouping
});

test('parseNum: passthrough and invalid inputs', () => {
  assert.equal(parseNum(1234), 1234);
  assert.ok(Number.isNaN(parseNum(null)));
  assert.ok(Number.isNaN(parseNum('')));
  assert.ok(Number.isNaN(parseNum('   ')));
});

test('eur: compact M/k suffixes and sign', () => {
  assert.equal(eur(1500000), '€1.50M');
  assert.equal(eur(-1500000), '-€1.50M');
  assert.equal(eur(15000), '€15k');     // >=10000 -> k
  assert.equal(eur(0), '€0');
});

test('eur: de-DE grouping below 10k', () => {
  assert.equal(eur(1234), '€1.234');
  assert.equal(eur(-500), '-€500');
});

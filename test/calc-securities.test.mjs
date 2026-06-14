/* Unit tests for sanitizeSecurities — defensive normalisation of the
   securities object on load/import (keys must look like 'YYYY-MM'). */
import { test } from 'node:test';
import assert from 'node:assert';
import { loadApp } from './_loadApp.mjs';

const { sanitizeSecurities } = loadApp();

test('non-objects sanitise to null', () => {
  assert.equal(sanitizeSecurities(null), null);
  assert.equal(sanitizeSecurities(undefined), null);
  assert.equal(sanitizeSecurities('nope'), null);
  assert.equal(sanitizeSecurities(42), null);
});

test('empty object yields the canonical empty shape', () => {
  assert.deepEqual(sanitizeSecurities({}), {
    startBalance: 0, startMonth: null, ledger: {}, values: {}, notes: {}, benchmark: null,
  });
});

test('startBalance is coerced; invalid -> 0', () => {
  assert.equal(sanitizeSecurities({ startBalance: '1500' }).startBalance, 1500);
  assert.equal(sanitizeSecurities({ startBalance: 'abc' }).startBalance, 0);
  assert.equal(sanitizeSecurities({ startBalance: 0 }).startBalance, 0);
});

test('startMonth must be YYYY-MM, else null', () => {
  assert.equal(sanitizeSecurities({ startMonth: '2026-03' }).startMonth, '2026-03');
  assert.equal(sanitizeSecurities({ startMonth: '2026-3' }).startMonth, null);   // needs two-digit month
  assert.equal(sanitizeSecurities({ startMonth: 'March' }).startMonth, null);
});

test('ledger keeps numeric values on month-shaped keys, drops the rest', () => {
  const out = sanitizeSecurities({ ledger: { '2026-01': 100, '2026-02': '200', notamonth: 50, '2026-03': 'abc' } });
  assert.deepEqual(out.ledger, { '2026-01': 100, '2026-02': 200 });
});

test('values drop negatives and non-numerics', () => {
  const out = sanitizeSecurities({ values: { '2026-01': 500, '2026-02': -10, '2026-03': 'x' } });
  assert.deepEqual(out.values, { '2026-01': 500 });
});

test('notes are clamped to 140 characters; non-strings dropped', () => {
  const out = sanitizeSecurities({ notes: { '2026-01': 'x'.repeat(200), '2026-02': 123 } });
  assert.equal(out.notes['2026-01'].length, 140);
  assert.equal('2026-02' in out.notes, false);
});

test('benchmark requires a valid anchorMonth', () => {
  assert.equal(sanitizeSecurities({ benchmark: { anchorMonth: 'bad' } }).benchmark, null);
  const b = sanitizeSecurities({
    benchmark: { anchorMonth: '2026-01', startBalance: '1000', contrib: 50, horizonM: 0 },
  }).benchmark;
  assert.equal(b.anchorMonth, '2026-01');
  assert.equal(b.setMonth, '2026-01');     // defaults to anchorMonth
  assert.equal(b.startBalance, 1000);
  assert.equal(b.contrib, 50);
  assert.equal(b.horizonM, 360);            // 0 -> default 360
  assert.equal(b.eqGs, 1);                  // missing -> default 1
});

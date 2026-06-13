/* Exercises the real storage.js in a simulated browser:
   jsdom provides localStorage, fake-indexeddb provides IndexedDB. */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import 'fake-indexeddb/auto';            // installs global indexedDB
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'https://example.org' });
const { window } = dom;

// Load storage.js as a browser script and pull FDStore out of its scope.
const sandbox = {
  localStorage: window.localStorage,
  indexedDB,
  navigator: { storage: { persist: async () => true } },
  setTimeout, clearTimeout, console,
};
const code = readFileSync(new URL('../storage.js', import.meta.url), 'utf8');
const FDStore = vm.runInNewContext(code + '\nFDStore;', sandbox);

const settle = (ms = 600) => new Promise((r) => setTimeout(r, ms)); // > 400ms IDB debounce

test('write is readable synchronously from localStorage', () => {
  const data = { version: 1, income: { 2026: 3000 } };
  FDStore.write(data);
  assert.deepEqual(FDStore.readSync(), data);
});

test('write mirrors into IndexedDB after the debounce', async () => {
  const data = { version: 1, expenses: { 2026: [{ id: 'e1', amount: 42 }] } };
  FDStore.write(data);
  await settle();
  assert.deepEqual(await FDStore.readDurable(), data);
});

test('data survives localStorage eviction (the iOS ITP case)', async () => {
  const data = { version: 1, securities: { startBalance: 1000 } };
  FDStore.write(data);
  await settle();
  window.localStorage.clear();                 // simulate Safari evicting localStorage
  assert.equal(FDStore.readSync(), null);
  assert.deepEqual(await FDStore.readDurable(), data); // still recoverable from IndexedDB
});

test('requestPersistence resolves truthy when supported', async () => {
  assert.equal(await FDStore.requestPersistence(), true);
});

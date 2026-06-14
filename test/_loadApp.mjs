/* Loads the FinDash browser scripts into a jsdom + fake-indexeddb context and
   returns the app's top-level functions/constants for unit testing.

   The files are concatenated and run as ONE script so their top-level
   const/let/function bindings share a single lexical scope — exactly how the
   browser treats multiple classic <script> tags (shared global lexical env).
   This makes cross-file references (e.g. finance_dashboard.js -> FDStore) work. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'storage.js',
  'sources/finhub-etf-basics.js',
  'sources/finhub-income-tax.js',
  'sources/finhub-investment-tax.js',
  'sources/finhub-deductions.js',
  'finance_dashboard.js',
];

// Names to surface for tests (must be top-level declarations in the scripts).
const EXPORTS = [
  'applyTax', 'effRate', 'computeModel', 'activeCount', 'parseNum', 'eur',
  'ABG', 'TF_EQ', 'SPB', 'MINI', 'sanitizeSecurities',
];

export function loadApp() {
  const html = readFileSync(join(root, 'finance_dashboard.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://findash.test/', pretendToBeVisual: true });
  const { window } = dom;

  const sandbox = {
    window, document: window.document, navigator: window.navigator,
    localStorage: window.localStorage, indexedDB,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: () => {},
    getComputedStyle: window.getComputedStyle.bind(window),
    console, Math, Date, JSON, Array, Object, String, Number, Boolean, isNaN, parseFloat, parseInt,
  };
  vm.createContext(sandbox);

  const code = FILES.map((f) => readFileSync(join(root, f), 'utf8')).join('\n;\n');
  const picker = `;({ ${EXPORTS.join(', ')} })`;
  return vm.runInContext(code + picker, sandbox, { filename: 'findash-bundle.js' });
}

/** floating-point assertion helper */
export function closeTo(actual, expected, eps = 1e-9) {
  return Math.abs(actual - expected) <= eps;
}

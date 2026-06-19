/* =====================================================================
   Kontor i18n — runtime, no-build. Loaded BEFORE finance_dashboard.js.

   - window.I18N = { de:{...}, en:{...} } flat dot-keyed dictionary.
   - t(key, vars)   -> string in the active language (falls back to en, then key),
                       with {placeholder} interpolation.
   - tList(key)     -> array value (e.g. month names), active language.
   - L(leaf)        -> resolves a {de,en} content leaf (used by FinHub modules).
   - applyI18n(root)-> localizes static markup: [data-i18n] sets textContent,
                       [data-i18n-attr="attr:key, attr2:key2"] sets attributes.
   - getLang()/setLang(lang) -> active language; persisted in localStorage.

   Default language: German floor — navigator.language starting "en" picks English,
   everything else gets German (this is a German-market app).
   Numbers/currency stay de-DE formatted in BOTH languages by design.
   ===================================================================== */
(function () {
  'use strict';
  // Expose globals via the real global object so they work both in the browser
  // (globalThis === window) and in the jsdom test VM (globalThis === the sandbox).
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var LANG_KEY = 'kontor_lang';
  var SUPPORTED = ['de', 'en'];

  function detectLang() {
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved && SUPPORTED.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    try {
      var nav = (navigator.language || navigator.userLanguage || 'de').toLowerCase();
      return nav.indexOf('en') === 0 ? 'en' : 'de';
    } catch (e) {}
    return 'de';
  }

  var LANG = detectLang();

  function dict() { return (G.I18N && G.I18N[LANG]) || {}; }
  function fallback() { return (G.I18N && G.I18N.en) || {}; }

  function interp(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) {
      return (vars[k] != null) ? vars[k] : m;
    });
  }

  // t('a.b.c', {name:'x'}) — active lang, fall back to en, then the key itself.
  function t(key, vars) {
    var d = dict();
    var v = (d[key] != null) ? d[key] : fallback()[key];
    if (v == null) return key;               // visible-but-safe: surfaces a missing key
    if (typeof v !== 'string') return v;
    return interp(v, vars);
  }

  function tList(key) {
    var d = dict();
    var v = (d[key] != null) ? d[key] : fallback()[key];
    return Array.isArray(v) ? v : [];
  }

  // FinHub content leaves are authored inline as {de:'…', en:'…'} (or a plain string).
  function L(leaf) {
    if (leaf == null) return '';
    if (typeof leaf === 'string') return leaf;
    return (leaf[LANG] != null) ? leaf[LANG] : (leaf.en != null ? leaf.en : '');
  }

  // Localize static markup. data-i18n -> textContent; data-i18n-attr -> attributes.
  function applyI18n(root) {
    root = root || document;
    var nodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], key = el.getAttribute('data-i18n');
      var s = t(key);
      if (s !== key) el.textContent = s;      // leave untouched if key missing (keeps source text)
    }
    var an = root.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < an.length; j++) {
      var ae = an[j], spec = ae.getAttribute('data-i18n-attr');
      spec.split(',').forEach(function (pair) {
        var bits = pair.split(':');
        if (bits.length !== 2) return;
        var attr = bits[0].trim(), k = bits[1].trim();
        var val = t(k);
        if (val !== k) ae.setAttribute(attr, val);
      });
    }
    try { document.documentElement.setAttribute('lang', LANG); } catch (e) {}
  }

  function getLang() { return LANG; }

  // Switch language: persist, re-localize static markup, and let the app re-render
  // its JS-built strings (the app exposes a relocalize() hook).
  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) < 0 || lang === LANG) return;
    LANG = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    applyI18n(document);
    if (typeof G.__kontorRelocalize === 'function') G.__kontorRelocalize();
  }

  G.I18N = G.I18N || { de: {}, en: {} };
  G.t = t;
  G.tList = tList;
  G.L = L;
  G.applyI18n = applyI18n;
  G.getLang = getLang;
  G.setLang = setLang;
})();

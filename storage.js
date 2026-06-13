/* =====================================================================
   FinDash storage layer — local-first, durable.

   localStorage  = instant synchronous cache. Fast boot + fallback, but
                   iOS Safari (ITP) can evict it after ~7 days of no use.
   IndexedDB     = durable source of truth. Survives that eviction,
                   especially once storage is marked persistent.

   Both are written together. A future remote-sync backend implements the
   same read/write contract — FDStore is the seam, so the rest of the app
   never talks to a storage primitive directly.
   ===================================================================== */
const FDStore = (function () {
  const LS_KEY = 'finance_dashboard_data_v1';   // must match the app's STORE_KEY
  const DB = 'fd_store', STORE = 'kv', KEY = 'data', VER = 1;
  let dbp = null, idbTimer = null;

  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB, VER);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }

  function idbPut(obj) {
    return openDB().then((db) => new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(obj, KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    }));
  }

  function idbGet() {
    return openDB().then((db) => new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(KEY);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    })).catch(() => null);
  }

  /* Synchronous fast path — used for instant boot. */
  function readSync() {
    try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  /* Durable path — IndexedDB copy (Promise). */
  function readDurable() { return idbGet(); }

  /* Write both: localStorage now (sync), IndexedDB debounced. */
  function write(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch (e) {}
    clearTimeout(idbTimer);
    idbTimer = setTimeout(() => { idbPut(obj).catch(function () {}); }, 400);
  }

  /* Ask the browser to keep our storage (best-effort; prevents eviction). */
  function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
    } catch (e) {}
    return Promise.resolve(false);
  }

  return { readSync, readDurable, write, requestPersistence, LS_KEY };
})();

/* =====================================================================
   Kontor storage layer — local-first, durable.

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

  /* Optional codec (the app-lock seam): { encode(obj)->Promise, decode(obj)->Promise }.
     Writes and the async read paths route through it; readSync stays raw —
     the app decodes its one synchronous boot read itself. No codec set means
     behavior is identical to the plain (unencrypted) store. */
  let codec = null, writeSeq = 0;
  function setCodec(c) { codec = c || null; }

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

  function idbPut(obj, key) {
    return openDB().then((db) => new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(obj, key || KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    }));
  }

  function idbGet(key) {
    return openDB().then((db) => new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(key || KEY);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    })).catch(() => null);
  }

  /* Small auxiliary records (e.g. the app-lock meta) that must survive a
     localStorage eviction alongside the data they unlock. Never encoded. */
  function putAux(key, obj) {
    if (obj == null) {
      return openDB().then((db) => new Promise((res) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete('aux:' + key);
        tx.oncomplete = res; tx.onerror = res;
      })).catch(() => {});
    }
    return idbPut(obj, 'aux:' + key).catch(() => {});
  }
  function getAux(key) { return idbGet('aux:' + key); }

  /* Synchronous fast path — used for instant boot. */
  function readSync() {
    try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  /* Durable path — IndexedDB copy (Promise). Decoded when a codec is set. */
  function readDurable() { return idbGet().then((o) => (codec ? codec.decode(o) : o)); }

  /* Write both: localStorage now (sync), IndexedDB debounced.
     With a codec the localStorage write happens right after the (fast,
     async) encode; a sequence counter drops stale encodes so overlapping
     saves can't land out of order. */
  function write(obj) {
    if (codec) {
      const seq = ++writeSeq;
      codec.encode(obj).then((env) => {
        if (seq !== writeSeq) return;
        try { localStorage.setItem(LS_KEY, JSON.stringify(env)); } catch (e) {}
        clearTimeout(idbTimer);
        idbTimer = setTimeout(() => { idbPut(env).catch(function () {}); }, 400);
      }).catch(function () {});
      return;
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch (e) {}
    clearTimeout(idbTimer);
    idbTimer = setTimeout(() => { idbPut(obj).catch(function () {}); }, 400);
  }

  /* Wipe both copies of the finance data (localStorage + IndexedDB record). */
  function clear() {
    clearTimeout(idbTimer);
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    return openDB().then((db) => new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = res; tx.onerror = res;
    })).catch(() => {});
  }

  /* Ask the browser to keep our storage (best-effort; prevents eviction). */
  function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
    } catch (e) {}
    return Promise.resolve(false);
  }

  /* Single pre-destructive snapshot slot (one-step Undo for import / open / clear).
     Encoded/decoded like the main record so the Undo copy is never plainer
     than the data it protects. */
  var SNAP = 'snapshot';
  function snapshot(obj) {
    const enc = codec ? codec.encode(obj) : Promise.resolve(obj);
    return enc.then((o) => openDB().then((db) => new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ data: o, ts: Date.now() }, SNAP);
      tx.oncomplete = res; tx.onerror = res;
    }))).catch(() => {});
  }
  function readSnapshot() {
    return openDB().then((db) => new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(SNAP);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    })).then((s) => {
      if (!s || !codec) return s;
      return codec.decode(s.data).then((d) => ({ data: d, ts: s.ts }));
    }).catch(() => null);
  }

  return { readSync, readDurable, write, clear, requestPersistence, snapshot, readSnapshot, setCodec, putAux, getAux, LS_KEY };
})();

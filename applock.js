/* =====================================================================
   Kontor app lock — opt-in encryption at rest + unlock gate.

   Key architecture (DEK/KEK):
     DEK           = random AES-GCM-256 key; encrypts the stored data.
                     Held in memory only while unlocked, never persisted raw.
     PIN wrapper   = PBKDF2-SHA256(pin, salt, 600k) -> KEK -> wraps the DEK.
                     Always present: the recovery path when biometrics break.
     Bio wrapper   = WebAuthn platform credential with the PRF extension;
                     HKDF-SHA256(prfOutput, salt, "kontor-applock-v1") -> KEK
                     -> wraps the same DEK. Optional, only where PRF works.

   The lock meta (salts, iteration count, wrapped keys, credential id) is
   NOT secret — without the PIN or the authenticator it unwraps nothing.
   It lives in localStorage and is mirrored to IndexedDB by the app so an
   evicted localStorage doesn't strand the encrypted IndexedDB copy.

   Envelope at rest: { __kontorLocked:1, v:1, iv, ct } (base64) around
   JSON.stringify(data) — the same shape in localStorage, IndexedDB and
   the snapshot slot, applied via FDStore's codec seam.

   Exports and a linked data file stay PLAINTEXT by design: they are the
   user's own backups and must outlive a forgotten PIN.
   ===================================================================== */
const FDLock = (function () {
  'use strict';
  const META_KEY = 'kontor_lock_v1';
  const HKDF_INFO = 'kontor-applock-v1';
  const PBKDF2_ITER = 600000;
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  let dek = null;   // CryptoKey while unlocked; null = locked (or lock off)

  /* ----------------------------- codecs ----------------------------- */
  function b64(buf) {
    const u = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function utf8(s) { return new TextEncoder().encode(s); }

  /* ------------------------------ meta ------------------------------ */
  function readMeta() {
    try { const raw = localStorage.getItem(META_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function writeMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function clearMeta() { try { localStorage.removeItem(META_KEY); } catch (e) {} }
  function isEnabled() { return !!readMeta(); }
  function isUnlocked() { return !!dek; }
  function hasBiometric() { const m = readMeta(); return !!(m && m.bio); }
  function lock() { dek = null; }

  /* ----------------------- KEK derivation --------------------------- */
  function kekFromPin(pin, salt, iter) {
    return subtle.importKey('raw', utf8(pin), 'PBKDF2', false, ['deriveKey'])
      .then((km) => subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter },
        km, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']));
  }
  function kekFromPrf(prfOut, salt) {
    return subtle.importKey('raw', prfOut, 'HKDF', false, ['deriveKey'])
      .then((km) => subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: salt, info: utf8(HKDF_INFO) },
        km, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']));
  }

  /* ----------------------- DEK wrap / unwrap ------------------------ */
  function wrapDek(dekKey, kek) {
    const iv = rand(12);
    return subtle.wrapKey('raw', dekKey, kek, { name: 'AES-GCM', iv: iv })
      .then((w) => ({ iv: b64(iv), wrap: b64(w) }));
  }
  function unwrapDek(wrapper, kek) {
    return subtle.unwrapKey('raw', unb64(wrapper.wrap), kek,
      { name: 'AES-GCM', iv: unb64(wrapper.iv) },
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  /* --------------------------- envelope ----------------------------- */
  function isEnvelope(o) { return !!(o && typeof o === 'object' && o.__kontorLocked); }
  function encodeData(obj) {
    if (!dek || isEnvelope(obj)) return Promise.resolve(obj);
    const iv = rand(12);
    return subtle.encrypt({ name: 'AES-GCM', iv: iv }, dek, utf8(JSON.stringify(obj)))
      .then((ct) => ({ __kontorLocked: 1, v: 1, iv: b64(iv), ct: b64(ct) }));
  }
  function decodeData(obj) {
    if (!isEnvelope(obj)) return Promise.resolve(obj);
    if (!dek) return Promise.reject(new Error('locked'));
    return subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, dek, unb64(obj.ct))
      .then((pt) => JSON.parse(new TextDecoder().decode(pt)));
  }
  /* The codec FDStore routes writes/reads through while the lock is on. */
  function codec() { return { encode: encodeData, decode: decodeData }; }

  /* --------------------------- WebAuthn ----------------------------- */
  function bioAvailable() {
    try {
      if (typeof PublicKeyCredential === 'undefined' ||
          !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
      return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
    } catch (e) { return Promise.resolve(false); }
  }
  /* Get the PRF output for our salt from an existing credential (one prompt). */
  function prfAssert(credId, prfSalt) {
    return navigator.credentials.get({ publicKey: {
      challenge: rand(32),
      allowCredentials: [{ type: 'public-key', id: unb64(credId).buffer }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: unb64(prfSalt).buffer } } }
    } }).then((cred) => {
      const res = cred && cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
      const out = res && res.prf && res.prf.results && res.prf.results.first;
      if (!out) throw new Error('prf-unavailable');
      return new Uint8Array(out);
    });
  }
  /* Create a platform credential and prove PRF works; returns the wrapper
     pieces. residentKey is REQUIRED: PRF needs a discoverable credential on
     Android (Google Password Manager) — 'preferred' can yield a credential
     that silently reports PRF as unsupported. The PRF eval is requested at
     create time too: where the authenticator honors that (newer Chrome),
     enrollment is a single prompt; otherwise we assert once more. */
  function enrollBiometric(dekKey) {
    const userId = rand(16), prfSalt = rand(32), hkdfSalt = rand(32);
    return navigator.credentials.create({ publicKey: {
      challenge: rand(32),
      rp: { name: 'Kontor' },
      user: { id: userId.buffer, name: 'kontor', displayName: 'Kontor' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt.buffer } } }
    } }).then((cred) => {
      const res = cred && cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
      const credId = b64(cred.rawId);
      // What matters is PRF *output*, not the prf.enabled flag: some
      // authenticators (Android GPM among them) misreport at create time
      // but answer the eval on a normal assertion — so if create didn't
      // yield output, always try one assertion before giving up.
      const createOut = res && res.prf && res.prf.results && res.prf.results.first;
      const prfOut$ = createOut ? Promise.resolve(new Uint8Array(createOut)) : prfAssert(credId, b64(prfSalt));
      return prfOut$
        .then((prfOut) => kekFromPrf(prfOut, hkdfSalt))
        .then((kek) => wrapDek(dekKey, kek))
        .then((w) => ({ credId: credId, prfSalt: b64(prfSalt), hkdfSalt: b64(hkdfSalt), iv: w.iv, wrap: w.wrap }));
    });
  }

  /* --------------------------- public API --------------------------- */
  /* Enable the lock: PIN is mandatory (recovery path), biometric optional.
     Resolves { bioEnabled } — bio failure downgrades gracefully to PIN-only.
     Biometric enrollment runs FIRST: credentials.create needs the click's
     user activation, which the slow PBKDF2 derivation would eat into on
     slower phones. */
  function setup(pin, withBio) {
    return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
      .then((newDek) => {
        const bio = withBio
          ? enrollBiometric(newDek).then((w) => ({ w: w, err: null }), (e) => ({ w: null, err: e }))
          : Promise.resolve({ w: null, err: null });
        return bio.then((b) => {
          const salt = rand(32);
          return kekFromPin(pin, salt, PBKDF2_ITER)
            .then((kek) => wrapDek(newDek, kek))
            .then((w) => {
              writeMeta({ v: 1, pin: { salt: b64(salt), iter: PBKDF2_ITER, iv: w.iv, wrap: w.wrap }, bio: b.w || null });
              dek = newDek;
              // bioError carries the enrollment failure so the UI can say
              // WHY biometrics degraded instead of failing silently.
              return { bioEnabled: !!b.w, bioError: b.err };
            });
        });
      });
  }
  function unlockWithPin(pin) {
    const m = readMeta();
    if (!m || !m.pin) return Promise.reject(new Error('no-lock'));
    return kekFromPin(pin, unb64(m.pin.salt), m.pin.iter)
      .then((kek) => unwrapDek(m.pin, kek))
      .then((k) => { dek = k; return true; });
  }
  function unlockWithBiometric() {
    const m = readMeta();
    if (!m || !m.bio) return Promise.reject(new Error('no-bio'));
    return prfAssert(m.bio.credId, m.bio.prfSalt)
      .then((prfOut) => kekFromPrf(prfOut, unb64(m.bio.hkdfSalt)))
      .then((kek) => unwrapDek(m.bio, kek))
      .then((k) => { dek = k; return true; });
  }
  /* Re-wrap the DEK under a new PIN. Requires the unlocked state, which is
     also the recovery for a forgotten PIN (unlock via biometric, set a new
     one). Data is untouched. */
  function changePin(newPin) {
    if (!dek) return Promise.reject(new Error('locked'));
    const m = readMeta(), salt = rand(32);
    return kekFromPin(newPin, salt, PBKDF2_ITER)
      .then((kek) => wrapDek(dek, kek))
      .then((w) => { m.pin = { salt: b64(salt), iter: PBKDF2_ITER, iv: w.iv, wrap: w.wrap }; writeMeta(m); return true; });
  }
  function addBiometric() {
    if (!dek) return Promise.reject(new Error('locked'));
    const m = readMeta();
    return enrollBiometric(dek).then((w) => { m.bio = w; writeMeta(m); return true; });
  }
  function removeBiometric() {
    const m = readMeta();
    if (m) { m.bio = null; writeMeta(m); }
    return Promise.resolve(true);
  }
  /* Turn the lock off. The caller is responsible for re-saving the data as
     plaintext afterwards (clear the codec first, then persist). */
  function disable() {
    if (!dek) return Promise.reject(new Error('locked'));
    clearMeta(); dek = null;
    return Promise.resolve(true);
  }
  /* Forgot-PIN escape hatch: drop the lock WITHOUT unlocking. The caller
     must also wipe the (now unreachable) encrypted data. */
  function wipe() { clearMeta(); dek = null; }

  return {
    isEnabled, isUnlocked, hasBiometric, isEnvelope, lock,
    setup, unlockWithPin, unlockWithBiometric, changePin,
    addBiometric, removeBiometric, disable, wipe,
    encodeData, decodeData, codec, bioAvailable,
    readMeta, writeMeta, META_KEY,
    _test: { kekFromPin, kekFromPrf, wrapDek, unwrapDek, PBKDF2_ITER }
  };
})();

/**
 * Auth.cs — db.js  (v3 — fully integrated)
 * IndexedDB storage for accounts, app-users, api-keys, audit-log, meta.
 * Owner default: INSANZO / 1234
 * 2FA secret stored per-account in IndexedDB (not just localStorage).
 */
 
const AuthDB = (() => {
 
  const DB_NAME    = 'authcs_main';
  const DB_VERSION = 3;
 
  const STORE = {
    ACCOUNTS  : 'accounts',
    APP_USERS : 'app_users',
    API_KEYS  : 'api_keys',
    AUDIT     : 'audit_log',
    META      : 'meta',
  };
 
  const OWNER_USERNAME     = 'INSANZO';
  const OWNER_DEFAULT_PASS = '1234';
 
  const ALL_APPS = [
    'insanzocheatsaimkill',
    'insanzoexternal',
    'insanzointernal',
    'insanzostreamer',
    'insanzouidbypass',
  ];
 
  let _db = null;
 
  /* ── open / upgrade ── */
  function init() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
 
      req.onupgradeneeded = e => {
        const db  = e.target.result;
        const old = e.oldVersion;
 
        if (!db.objectStoreNames.contains(STORE.ACCOUNTS)) {
          const s = db.createObjectStore(STORE.ACCOUNTS, { keyPath: 'username' });
          s.createIndex('role',      'role',      { unique: false });
          s.createIndex('createdBy', 'createdBy', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE.APP_USERS)) {
          const s = db.createObjectStore(STORE.APP_USERS, { keyPath: 'id' });
          s.createIndex('appKey',    'appKey',    { unique: false });
          s.createIndex('createdBy', 'createdBy', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE.API_KEYS)) {
          db.createObjectStore(STORE.API_KEYS, { keyPath: 'username' });
        }
        if (!db.objectStoreNames.contains(STORE.AUDIT)) {
          const s = db.createObjectStore(STORE.AUDIT, { keyPath: 'id', autoIncrement: true });
          s.createIndex('actor',     'actor',     { unique: false });
          s.createIndex('target',    'target',    { unique: false });
          s.createIndex('action',    'action',    { unique: false });
          s.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE.META)) {
          db.createObjectStore(STORE.META, { keyPath: 'key' });
        }
      };
 
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }
 
  /* ── generic helpers ── */
  function _tx(store, mode = 'readonly') {
    return _db.transaction(store, mode).objectStore(store);
  }
  function _get(store, key) {
    return new Promise((res, rej) => {
      const r = _tx(store).get(key);
      r.onsuccess = e => res(e.target.result || null);
      r.onerror   = e => rej(e.target.error);
    });
  }
  function _put(store, value) {
    return new Promise((res, rej) => {
      const r = _tx(store, 'readwrite').put(value);
      r.onsuccess = () => res(true);
      r.onerror   = e => rej(e.target.error);
    });
  }
  function _delete(store, key) {
    return new Promise((res, rej) => {
      const r = _tx(store, 'readwrite').delete(key);
      r.onsuccess = () => res(true);
      r.onerror   = e => rej(e.target.error);
    });
  }
  function _getAll(store) {
    return new Promise((res, rej) => {
      const r = _tx(store).getAll();
      r.onsuccess = e => res(e.target.result || []);
      r.onerror   = e => rej(e.target.error);
    });
  }
  function _getByIndex(store, index, value) {
    return new Promise((res, rej) => {
      const r = _tx(store).index(index).getAll(value);
      r.onsuccess = e => res(e.target.result || []);
      r.onerror   = e => rej(e.target.error);
    });
  }
  function _putMany(store, items) {
    return new Promise((res, rej) => {
      const tx = _db.transaction(store, 'readwrite');
      const s  = tx.objectStore(store);
      items.forEach(i => s.put(i));
      tx.oncomplete = () => res(true);
      tx.onerror    = e => rej(e.target.error);
    });
  }
 
  /* ══════════════════════════════════════
     ACCOUNTS
     ══════════════════════════════════════ */
  const accounts = {
 
    async getByUsername(username) {
      if (!username) return null;
      return _get(STORE.ACCOUNTS, username.toLowerCase());
    },
    async getAll()        { return _getAll(STORE.ACCOUNTS); },
    async getByRole(role) { return _getByIndex(STORE.ACCOUNTS, 'role', role); },
    async getCreatedBy(u) { return _getByIndex(STORE.ACCOUNTS, 'createdBy', (u||'').toLowerCase()); },
 
    /**
     * Save / update an account.
     * Preserves existing fields (like totpSecret) if not supplied.
     */
    async save(data) {
      const key = (data.username || '').toLowerCase();
      // Preserve existing record so we don't wipe totpSecret etc.
      let existing = null;
      try { existing = await _get(STORE.ACCOUNTS, key); } catch(_) {}
 
      const r = {
        ...(existing || {}),
        username      : key,
        displayName   : data.displayName   !== undefined ? data.displayName   : (existing?.displayName   || data.username),
        password      : data.password      !== undefined ? data.password      : (existing?.password      || ''),
        role          : data.role          !== undefined ? data.role          : (existing?.role          || 'reseller'),
        packages      : data.packages      !== undefined ? data.packages      : (existing?.packages      || []),
        createdBy     : data.createdBy     !== undefined ? (data.createdBy||'').toLowerCase() : (existing?.createdBy || ''),
        since         : existing?.since    || data.since || Date.now(),
        apiEnabled    : data.apiEnabled    !== undefined ? !!data.apiEnabled    : (existing ? !!existing.apiEnabled    : false),
        twoFAEnabled  : data.twoFAEnabled  !== undefined ? !!data.twoFAEnabled  : (existing ? !!existing.twoFAEnabled  : true),
        enabled       : data.enabled       !== undefined ? !!data.enabled       : (existing ? !!existing.enabled       : true),
        // totpSecret preserved from existing unless explicitly set
        totpSecret    : data.totpSecret    !== undefined ? data.totpSecret    : (existing?.totpSecret    || ''),
        updatedAt     : Date.now(),
      };
      await _put(STORE.ACCOUNTS, r);
      return r;
    },
 
    async verifyLogin(username, password) {
      const r = await this.getByUsername(username);
      if (!r) return null;
      if (r.enabled === false) return null;
      return r.password === password ? r : null;
    },
 
    async changePassword(username, newPass, changedBy) {
      const r = await this.getByUsername(username);
      if (!r) throw new Error(`Account "${username}" not found.`);
      r.password  = newPass;
      r.updatedAt = Date.now();
      await _put(STORE.ACCOUNTS, r);
      await audit.log({ actor: (changedBy||'').toLowerCase(), target: username.toLowerCase(), action: 'password_change', detail: `Password changed for ${username}` });
      return r;
    },
 
    async setTotpSecret(username, secret) {
      const r = await this.getByUsername(username);
      if (!r) throw new Error(`Account "${username}" not found.`);
      r.totpSecret = secret || '';
      r.updatedAt  = Date.now();
      await _put(STORE.ACCOUNTS, r);
      // Keep localStorage in sync for backward-compat (login.html reads it)
      if (secret) {
        localStorage.setItem('2fa_secret_' + username.toLowerCase(), secret);
      } else {
        localStorage.removeItem('2fa_secret_' + username.toLowerCase());
      }
      return r;
    },
 
    async getTotpSecret(username) {
      const r = await this.getByUsername(username);
      if (!r) return '';
      // Prefer DB value; fall back to localStorage (legacy)
      if (r.totpSecret) return r.totpSecret;
      const ls = localStorage.getItem('2fa_secret_' + username.toLowerCase());
      if (ls) { await this.setTotpSecret(username, ls); return ls; }
      return '';
    },
 
    async updatePackages(username, packages, changedBy) {
      const r = await this.getByUsername(username);
      if (!r) throw new Error(`Account "${username}" not found.`);
      r.packages  = packages;
      r.updatedAt = Date.now();
      await _put(STORE.ACCOUNTS, r);
      await audit.log({ actor: (changedBy||'').toLowerCase(), target: username.toLowerCase(), action: 'packages_updated', detail: `Packages updated: [${packages.join(', ')}]` });
      return r;
    },
 
    async setApiEnabled(username, enabled, changedBy) {
      const r = await this.getByUsername(username);
      if (!r) throw new Error(`Account "${username}" not found.`);
      r.apiEnabled = !!enabled;
      r.updatedAt  = Date.now();
      await _put(STORE.ACCOUNTS, r);
      await audit.log({ actor: (changedBy||'').toLowerCase(), target: username.toLowerCase(), action: enabled ? 'api_enabled' : 'api_disabled', detail: `API ${enabled?'enabled':'disabled'} for ${username}` });
      return r;
    },
 
    async set2FAEnabled(username, enabled, changedBy) {
      const r = await this.getByUsername(username);
      if (!r) throw new Error(`Account "${username}" not found.`);
      r.twoFAEnabled = !!enabled;
      r.updatedAt    = Date.now();
      await _put(STORE.ACCOUNTS, r);
      await audit.log({ actor: (changedBy||'').toLowerCase(), target: username.toLowerCase(), action: enabled ? '2fa_enabled' : '2fa_disabled', detail: `2FA ${enabled?'enabled':'disabled'} for ${username}` });
      return r;
    },
 
    async setEnabled(username, enabled, changedBy) {
      const r = await this.getByUsername(username);
      if (!r) throw new Error(`Account "${username}" not found.`);
      r.enabled   = !!enabled;
      r.updatedAt = Date.now();
      await _put(STORE.ACCOUNTS, r);
      await audit.log({ actor: (changedBy||'').toLowerCase(), target: username.toLowerCase(), action: enabled ? 'account_enabled' : 'account_disabled', detail: `Account ${enabled?'enabled':'disabled'} for ${username}` });
      return r;
    },
 
    async remove(username, deletedBy) {
      const key = (username||'').toLowerCase();
      await _delete(STORE.ACCOUNTS, key);
      await _delete(STORE.API_KEYS, key);
      localStorage.removeItem('2fa_secret_' + key);
      await audit.log({ actor: (deletedBy||'').toLowerCase(), target: key, action: 'account_deleted', detail: `Account "${username}" deleted by ${deletedBy}` });
    },
  };
 
  /* ══════════════════════════════════════
     APP USERS
     ══════════════════════════════════════ */
  const appUsers = {
    makeId(username, appKey) { return appKey + '::' + (username||'').toLowerCase(); },
    async getById(id)        { return _get(STORE.APP_USERS, id); },
    async getByApp(appKey)   { return _getByIndex(STORE.APP_USERS, 'appKey', appKey); },
    async getAll()           { return _getAll(STORE.APP_USERS); },
    async getCreatedBy(u)    { return _getByIndex(STORE.APP_USERS, 'createdBy', (u||'').toLowerCase()); },
 
    async save(u) {
      const r = {
        id        : this.makeId(u.username, u.appKey),
        username  : u.username,
        appKey    : u.appKey,
        display   : u.display   || u.appKey,
        hwid      : u.hwid      || '—',
        expiry    : u.expiry    || '0',
        banned    : !!u.banned,
        expired   : !!u.expired,
        createdBy : (u.createdBy || '').toLowerCase(),
        createdAt : u.createdAt || Date.now(),
        updatedAt : Date.now(),
      };
      await _put(STORE.APP_USERS, r);
      return r;
    },
 
    async saveMany(users) {
      return _putMany(STORE.APP_USERS, users.map(u => ({
        id        : this.makeId(u.username, u.appKey),
        username  : u.username,
        appKey    : u.appKey,
        display   : u.display   || u.appKey,
        hwid      : u.hwid      || '—',
        expiry    : u.expiry    || '0',
        banned    : !!u.banned,
        expired   : !!u.expired,
        createdBy : (u.createdBy || '').toLowerCase(),
        createdAt : u.createdAt || Date.now(),
        updatedAt : Date.now(),
      })));
    },
 
    async remove(username, appKey) {
      return _delete(STORE.APP_USERS, this.makeId(username, appKey));
    },
  };
 
  /* ══════════════════════════════════════
     API KEYS
     ══════════════════════════════════════ */
  const apiKeys = {
    _generate(seed) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const h = (seed + Date.now() + Math.random()).split('').reduce((a,c,i) => a + c.charCodeAt(0) * (i+7), 0);
      let key = 'ac_';
      for (let i = 0; i < 32; i++) key += chars[Math.abs(Math.floor(h*(i+1.3)*17+i*31)) % chars.length];
      return key;
    },
    async getOrCreate(username) {
      const key = (username||'').toLowerCase();
      let r = await _get(STORE.API_KEYS, key);
      if (!r) { r = { username: key, key: this._generate(username), createdAt: Date.now() }; await _put(STORE.API_KEYS, r); }
      return r.key;
    },
    async get(username) {
      const r = await _get(STORE.API_KEYS, (username||'').toLowerCase());
      return r ? r.key : null;
    },
    async regenerate(username, changedBy) {
      const key    = (username||'').toLowerCase();
      const newKey = this._generate(username + Date.now() + Math.random());
      await _put(STORE.API_KEYS, { username: key, key: newKey, createdAt: Date.now() });
      await audit.log({ actor: (changedBy||key).toLowerCase(), target: key, action: 'api_key_regenerated', detail: `API key regenerated for ${username}` });
      return newKey;
    },
  };
 
  /* ══════════════════════════════════════
     AUDIT
     ══════════════════════════════════════ */
  const audit = {
    async log({ actor, target, action, detail }) {
      return _put(STORE.AUDIT, { actor: actor||'', target: target||'', action: action||'', detail: detail||'', timestamp: Date.now() });
    },
    async getAll()          { return _getAll(STORE.AUDIT); },
    async getRecent(n = 50) { const a = await this.getAll(); return a.sort((x,y)=>y.timestamp-x.timestamp).slice(0,n); },
  };
 
  /* ══════════════════════════════════════
     META
     ══════════════════════════════════════ */
  const meta = {
    async set(key, val) { return _put(STORE.META, { key, value: val }); },
    async get(key)      { const r = await _get(STORE.META, key); return r ? r.value : null; },
    async remove(key)   { return _delete(STORE.META, key); },
  };
 
  /* ══════════════════════════════════════
     SEED OWNER
     ══════════════════════════════════════ */
  async function seedOwner() {
    const existing = await accounts.getByUsername(OWNER_USERNAME);
    if (existing) return existing;
    return accounts.save({
      username     : OWNER_USERNAME,
      displayName  : OWNER_USERNAME,
      password     : OWNER_DEFAULT_PASS,
      role         : 'owner',
      packages     : [...ALL_APPS],
      createdBy    : '',
      apiEnabled   : true,
      twoFAEnabled : true,
      enabled      : true,
      totpSecret   : '',
    });
  }
 
  /* ══════════════════════════════════════
     TOTP HELPERS  (shared, called from login + dashboard)
     ══════════════════════════════════════ */
  const totp = {
    B32: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
 
    b32ToBytes(s) {
      let bits=0, val=0, out=[];
      for (let i=0; i<s.length; i++) {
        const idx = this.B32.indexOf(s[i].toUpperCase());
        if (idx === -1) continue;
        val = (val<<5)|idx; bits += 5;
        if (bits >= 8) { out.push((val>>>(bits-8))&0xFF); bits -= 8; }
      }
      return out;
    },
 
    intToBytes(n) {
      const a = new Uint8Array(8);
      for (let i=7; i>=0; i--) { a[i]=n&0xFF; n=Math.floor(n/256); }
      return a;
    },
 
    async getCode(secret) {
      if (!secret) return null;
      const counter = Math.floor(Date.now()/1000/30);
      const key = await crypto.subtle.importKey(
        'raw', new Uint8Array(this.b32ToBytes(secret)),
        { name:'HMAC', hash:'SHA-1' }, false, ['sign']
      );
      const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, this.intToBytes(counter)));
      const off = sig[sig.length-1] & 0xf;
      const code = ((sig[off]&0x7f)<<24)|((sig[off+1]&0xff)<<16)|((sig[off+2]&0xff)<<8)|(sig[off+3]&0xff);
      return (code % 1000000).toString().padStart(6,'0');
    },
 
    /** Generate a random base32 secret (160-bit) */
    generateSecret() {
      const bytes = crypto.getRandomValues(new Uint8Array(20));
      let out = '';
      for (let i=0; i<bytes.length; i+=5) {
        const b = bytes.slice(i, i+5);
        out += this.B32[b[0]>>3];
        out += this.B32[((b[0]&7)<<2)|(b[1]>>6)];
        out += this.B32[(b[1]>>1)&31];
        out += this.B32[((b[1]&1)<<4)|(b[2]>>4)];
        out += this.B32[((b[2]&15)<<1)|(b[3]>>7)];
        out += this.B32[(b[3]>>2)&31];
        out += this.B32[((b[3]&3)<<3)|(b[4]>>5)];
        out += this.B32[b[4]&31];
      }
      return out.slice(0,32);
    },
 
    /** Build a QR-code URI for Google Authenticator */
    otpauthUri(username, secret, issuer = 'Auth.cs') {
      return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    },
  };
 
  return { init, seedOwner, accounts, appUsers, apiKeys, audit, meta, totp, STORE, OWNER_USERNAME, ALL_APPS };
})();
 
window.AuthDB = AuthDB;
 

/**
 * Auth.cs — db.js
 * IndexedDB storage for accounts, app-users, api-keys, audit-log, meta.
 * NO KeyAuth dependency — all logins are validated against this DB.
 * Owner default password: 1234  (changeable from Settings)
 */
 
const AuthDB = (() => {
 
  const DB_NAME    = 'authcs_main';
  const DB_VERSION = 2;           // bumped so onupgradeneeded re-runs
 
  const STORE = {
    ACCOUNTS  : 'accounts',
    APP_USERS : 'app_users',
    API_KEYS  : 'api_keys',
    AUDIT     : 'audit_log',
    META      : 'meta',
  };
 
  const OWNER_USERNAME = 'INSANZO';
  const OWNER_DEFAULT_PASS = '1234';
 
  const ALL_APPS = [
    'insanzocheatsaimkill',
    'insanzoexternal',
    'insanzointernal',
    'insanzostreamer',
    'insanzouidbypass',
  ];
 
  let _db = null;
 
  /* ── open ── */
  function init() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
 
      req.onupgradeneeded = e => {
        const db = e.target.result;
 
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
 
  /* ── accounts ── */
  const accounts = {
 
    async getByUsername(username) {
      return _get(STORE.ACCOUNTS, username.toLowerCase());
    },
    async getAll()         { return _getAll(STORE.ACCOUNTS); },
    async getByRole(role)  { return _getByIndex(STORE.ACCOUNTS, 'role', role); },
    async getCreatedBy(u)  { return _getByIndex(STORE.ACCOUNTS, 'createdBy', u.toLowerCase()); },
 
    async save(data) {
      const r = {
        username      : data.username.toLowerCase(),
        displayName   : data.displayName || data.username,
        password      : data.password,
        role          : data.role,
        packages      : data.packages      || [],
        createdBy     : (data.createdBy    || '').toLowerCase(),
        since         : data.since         || Date.now(),
        apiEnabled    : data.apiEnabled    !== undefined ? !!data.apiEnabled    : false,
        twoFAEnabled  : data.twoFAEnabled  !== undefined ? !!data.twoFAEnabled  : true,
        enabled       : data.enabled       !== undefined ? !!data.enabled       : true,
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
      await audit.log({ actor: (changedBy||'').toLowerCase(), target: username.toLowerCase(), action: 'password_change', detail: `Password changed for ${username} by ${changedBy}` });
      return r;
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
      await audit.log({ actor: (changedBy||'').toLowerCase(), target: username.toLowerCase(), action: enabled ? 'api_enabled' : 'api_disabled', detail: `API ${enabled ? 'enabled' : 'disabled'} for ${username}` });
      return r;
    },
 
    async set2FAEnabled(username, enabled, changedBy) {
      const r = await this.getByUsername(username);
      if (!r) throw new Error(`Account "${username}" not found.`);
      r.twoFAEnabled = !!enabled;
      r.updatedAt    = Date.now();
      await _put(STORE.ACCOUNTS, r);
      await audit.log({ actor: (changedBy||'').toLowerCase(), target: username.toLowerCase(), action: enabled ? '2fa_enabled' : '2fa_disabled', detail: `2FA ${enabled ? 'enabled' : 'disabled'} for ${username}` });
      return r;
    },
 
    async setEnabled(username, enabled, changedBy) {
      const r = await this.getByUsername(username);
      if (!r) throw new Error(`Account "${username}" not found.`);
      r.enabled   = !!enabled;
      r.updatedAt = Date.now();
      await _put(STORE.ACCOUNTS, r);
      await audit.log({ actor: (changedBy||'').toLowerCase(), target: username.toLowerCase(), action: enabled ? 'account_enabled' : 'account_disabled', detail: `Account ${enabled ? 'enabled' : 'disabled'} for ${username}` });
      return r;
    },
 
    async remove(username, deletedBy) {
      const key = username.toLowerCase();
      await _delete(STORE.ACCOUNTS, key);
      await _delete(STORE.API_KEYS, key);
      await audit.log({ actor: (deletedBy||'').toLowerCase(), target: key, action: 'account_deleted', detail: `Account "${username}" deleted by ${deletedBy}` });
    },
  };
 
  /* ── appUsers ── */
  const appUsers = {
    makeId(username, appKey) { return appKey + '::' + username.toLowerCase(); },
    async getById(id)        { return _get(STORE.APP_USERS, id); },
    async getByApp(appKey)   { return _getByIndex(STORE.APP_USERS, 'appKey', appKey); },
    async getAll()           { return _getAll(STORE.APP_USERS); },
    async getCreatedBy(u)    { return _getByIndex(STORE.APP_USERS, 'createdBy', u.toLowerCase()); },
 
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
 
  /* ── apiKeys ── */
  const apiKeys = {
    _generate(username) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const seed  = (username + Date.now()).split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
      let key = 'ac_';
      for (let i = 0; i < 32; i++) key += chars[Math.abs(Math.floor(seed * (i + 1.3) * 17 + i * 31)) % chars.length];
      return key;
    },
    async getOrCreate(username) {
      const key = username.toLowerCase();
      let r = await _get(STORE.API_KEYS, key);
      if (!r) { r = { username: key, key: this._generate(username), createdAt: Date.now() }; await _put(STORE.API_KEYS, r); }
      return r.key;
    },
    async get(username) {
      const r = await _get(STORE.API_KEYS, username.toLowerCase());
      return r ? r.key : null;
    },
    async regenerate(username, changedBy) {
      const key    = username.toLowerCase();
      const newKey = this._generate(username + Date.now() + Math.random());
      await _put(STORE.API_KEYS, { username: key, key: newKey, createdAt: Date.now() });
      await audit.log({ actor: (changedBy || key).toLowerCase(), target: key, action: 'api_key_regenerated', detail: `API key regenerated for ${username}` });
      return newKey;
    },
  };
 
  /* ── audit ── */
  const audit = {
    async log({ actor, target, action, detail }) {
      return _put(STORE.AUDIT, { actor: actor||'', target: target||'', action: action||'', detail: detail||'', timestamp: Date.now() });
    },
    async getAll()          { return _getAll(STORE.AUDIT); },
    async getRecent(n = 50) { const a = await this.getAll(); return a.sort((x,y)=>y.timestamp-x.timestamp).slice(0,n); },
  };
 
  /* ── meta ── */
  const meta = {
    async set(key, val) { return _put(STORE.META, { key, value: val }); },
    async get(key)      { const r = await _get(STORE.META, key); return r ? r.value : null; },
    async remove(key)   { return _delete(STORE.META, key); },
  };
 
  /* ── seed owner on first run ── */
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
    });
  }
 
  return { init, seedOwner, accounts, appUsers, apiKeys, audit, meta, STORE, OWNER_USERNAME, ALL_APPS };
})();
 
window.AuthDB = AuthDB;

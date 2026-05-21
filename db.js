/**
 * ═══════════════════════════════════════════════════════════
 *  Auth.cs — Database Layer (db.js)
 *  IndexedDB-backed storage for credentials, subsellers,
 *  resellers, app-users, API keys, and audit logs.
 *
 *  Usage:  await AuthDB.init();
 *          await AuthDB.accounts.getByUsername('INSANZO');
 * ═══════════════════════════════════════════════════════════
 */
 
const AuthDB = (() => {
 
  /* ── constants ── */
  const DB_NAME    = 'authcs_main';
  const DB_VERSION = 1;
 
  /* Object-store names */
  const STORE = {
    ACCOUNTS  : 'accounts',   // owner / subsellers / resellers
    APP_USERS : 'app_users',  // licensed end-users per app
    API_KEYS  : 'api_keys',   // api key per account username
    AUDIT     : 'audit_log',  // password changes + deletions
    META      : 'meta',       // misc key-value (lastSync, etc.)
  };
 
  let _db = null;
 
  /* ─────────────────────────────────────────────────
     OPEN / INIT
  ───────────────────────────────────────────────── */
  function init() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }
 
      const req = indexedDB.open(DB_NAME, DB_VERSION);
 
      req.onupgradeneeded = e => {
        const db = e.target.result;
 
        /* accounts store  — keyed by lowercase username */
        if (!db.objectStoreNames.contains(STORE.ACCOUNTS)) {
          const s = db.createObjectStore(STORE.ACCOUNTS, { keyPath: 'username' });
          s.createIndex('role',      'role',      { unique: false });
          s.createIndex('createdBy', 'createdBy', { unique: false });
        }
 
        /* app_users store — keyed by "appKey::username" */
        if (!db.objectStoreNames.contains(STORE.APP_USERS)) {
          const s = db.createObjectStore(STORE.APP_USERS, { keyPath: 'id' });
          s.createIndex('appKey',    'appKey',    { unique: false });
          s.createIndex('createdBy', 'createdBy', { unique: false });
        }
 
        /* api_keys store  — keyed by username */
        if (!db.objectStoreNames.contains(STORE.API_KEYS)) {
          db.createObjectStore(STORE.API_KEYS, { keyPath: 'username' });
        }
 
        /* audit_log store — auto-increment id */
        if (!db.objectStoreNames.contains(STORE.AUDIT)) {
          const s = db.createObjectStore(STORE.AUDIT, { keyPath: 'id', autoIncrement: true });
          s.createIndex('actor',     'actor',     { unique: false });
          s.createIndex('target',    'target',    { unique: false });
          s.createIndex('action',    'action',    { unique: false });
          s.createIndex('timestamp', 'timestamp', { unique: false });
        }
 
        /* meta store */
        if (!db.objectStoreNames.contains(STORE.META)) {
          db.createObjectStore(STORE.META, { keyPath: 'key' });
        }
      };
 
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }
 
  /* ─────────────────────────────────────────────────
     GENERIC HELPERS
  ───────────────────────────────────────────────── */
  function _tx(storeName, mode = 'readonly') {
    return _db.transaction(storeName, mode).objectStore(storeName);
  }
 
  function _get(storeName, key) {
    return new Promise((res, rej) => {
      const r = _tx(storeName).get(key);
      r.onsuccess = e => res(e.target.result || null);
      r.onerror   = e => rej(e.target.error);
    });
  }
 
  function _put(storeName, value) {
    return new Promise((res, rej) => {
      const r = _tx(storeName, 'readwrite').put(value);
      r.onsuccess = () => res(true);
      r.onerror   = e => rej(e.target.error);
    });
  }
 
  function _delete(storeName, key) {
    return new Promise((res, rej) => {
      const r = _tx(storeName, 'readwrite').delete(key);
      r.onsuccess = () => res(true);
      r.onerror   = e => rej(e.target.error);
    });
  }
 
  function _getAll(storeName) {
    return new Promise((res, rej) => {
      const r = _tx(storeName).getAll();
      r.onsuccess = e => res(e.target.result || []);
      r.onerror   = e => rej(e.target.error);
    });
  }
 
  function _getByIndex(storeName, indexName, value) {
    return new Promise((res, rej) => {
      const r = _tx(storeName).index(indexName).getAll(value);
      r.onsuccess = e => res(e.target.result || []);
      r.onerror   = e => rej(e.target.error);
    });
  }
 
  function _putMany(storeName, items) {
    return new Promise((res, rej) => {
      const tx = _db.transaction(storeName, 'readwrite');
      const s  = tx.objectStore(storeName);
      items.forEach(item => s.put(item));
      tx.oncomplete = () => res(true);
      tx.onerror    = e  => rej(e.target.error);
    });
  }
 
  function _replaceAll(storeName, items) {
    return new Promise((res, rej) => {
      const tx = _db.transaction(storeName, 'readwrite');
      const s  = tx.objectStore(storeName);
      s.clear();
      items.forEach(item => s.put(item));
      tx.oncomplete = () => res(true);
      tx.onerror    = e  => rej(e.target.error);
    });
  }
 
  /* ─────────────────────────────────────────────────
     ACCOUNTS  (owner / subsellers / resellers)
  ───────────────────────────────────────────────── */
  const accounts = {
 
    /**
     * Get a single account by username (case-insensitive).
     * Returns null if not found.
     */
    async getByUsername(username) {
      return _get(STORE.ACCOUNTS, username.toLowerCase());
    },
 
    /** Get all accounts */
    async getAll() {
      return _getAll(STORE.ACCOUNTS);
    },
 
    /** Get accounts by role: 'owner' | 'subseller' | 'reseller' */
    async getByRole(role) {
      return _getByIndex(STORE.ACCOUNTS, 'role', role);
    },
 
    /** Get resellers created by a specific username */
    async getCreatedBy(creatorUsername) {
      return _getByIndex(STORE.ACCOUNTS, 'createdBy', creatorUsername.toLowerCase());
    },
 
    /**
     * Create or overwrite an account.
     * @param {object} data  - { username, password, role, packages[], createdBy, since, apiEnabled }
     */
    async save(data) {
      const record = {
        username   : data.username.toLowerCase(),
        displayName: data.username,           // preserve original casing for display
        password   : data.password,
        role       : data.role,               // 'owner' | 'subseller' | 'reseller'
        packages   : data.packages || [],
        createdBy  : (data.createdBy || '').toLowerCase(),
        since      : data.since || Date.now(),
        apiEnabled : data.apiEnabled !== undefined ? data.apiEnabled : false,
        updatedAt  : Date.now(),
      };
      await _put(STORE.ACCOUNTS, record);
      return record;
    },
 
    /**
     * Change an account's password.
     * Logs the change in the audit log.
     * @param {string} username    - whose password is being changed
     * @param {string} newPassword - plain-text new password
     * @param {string} changedBy   - actor username (self-change or owner override)
     */
    async changePassword(username, newPassword, changedBy) {
      const record = await this.getByUsername(username);
      if (!record) throw new Error(`Account "${username}" not found.`);
      record.password  = newPassword;
      record.updatedAt = Date.now();
      await _put(STORE.ACCOUNTS, record);
 
      /* audit */
      await audit.log({
        actor  : changedBy.toLowerCase(),
        target : username.toLowerCase(),
        action : 'password_change',
        detail : `Password changed for ${username} by ${changedBy}`,
      });
 
      /* keep legacy localStorage key in sync so login.html still works */
      try { localStorage.setItem('authcs_pw_' + username, newPassword); } catch (_) {}
 
      return record;
    },
 
    /**
     * Update packages assigned to an account.
     */
    async updatePackages(username, packages, changedBy) {
      const record = await this.getByUsername(username);
      if (!record) throw new Error(`Account "${username}" not found.`);
      record.packages  = packages;
      record.updatedAt = Date.now();
      await _put(STORE.ACCOUNTS, record);
 
      await audit.log({
        actor  : (changedBy || '').toLowerCase(),
        target : username.toLowerCase(),
        action : 'packages_updated',
        detail : `Packages updated: [${packages.join(', ')}]`,
      });
      return record;
    },
 
    /**
     * Toggle API access for a reseller.
     */
    async setApiEnabled(username, enabled, changedBy) {
      const record = await this.getByUsername(username);
      if (!record) throw new Error(`Account "${username}" not found.`);
      record.apiEnabled = !!enabled;
      record.updatedAt  = Date.now();
      await _put(STORE.ACCOUNTS, record);
 
      await audit.log({
        actor  : (changedBy || '').toLowerCase(),
        target : username.toLowerCase(),
        action : enabled ? 'api_enabled' : 'api_disabled',
        detail : `API key ${enabled ? 'enabled' : 'disabled'} for ${username}`,
      });
      return record;
    },
 
    /**
     * Toggle 2FA requirement for a subseller or reseller.
     */
    async set2FAEnabled(username, enabled, changedBy) {
      const record = await this.getByUsername(username);
      if (!record) throw new Error(`Account "${username}" not found.`);
      record.totp2faEnabled = !!enabled;
      record.updatedAt      = Date.now();
      await _put(STORE.ACCOUNTS, record);

      await audit.log({
        actor  : (changedBy || '').toLowerCase(),
        target : username.toLowerCase(),
        action : enabled ? '2fa_enabled' : '2fa_disabled',
        detail : `2FA ${enabled ? 'enabled' : 'disabled'} for ${username}`,
      });
      return record;
    },

    /**
     * Delete an account and its API key.
     */
    async remove(username, deletedBy) {
      const key = username.toLowerCase();
      await _delete(STORE.ACCOUNTS, key);
      await _delete(STORE.API_KEYS, key);
 
      await audit.log({
        actor  : (deletedBy || '').toLowerCase(),
        target : key,
        action : 'account_deleted',
        detail : `Account "${username}" deleted by ${deletedBy}`,
      });
 
      /* clean legacy localStorage */
      try { localStorage.removeItem('authcs_pw_' + username); } catch (_) {}
    },
 
    /**
     * Verify a login attempt.
     * Returns the account object on success, null on failure.
     */
    async verifyLogin(username, password) {
      const record = await this.getByUsername(username);
      if (!record) return null;
      return record.password === password ? record : null;
    },
  };
 
  /* ─────────────────────────────────────────────────
     APP USERS  (end-users per Auth.cs application)
  ───────────────────────────────────────────────── */
  const appUsers = {
 
    /** Compose the primary key */
    makeId(username, appKey) {
      return appKey + '::' + username.toLowerCase();
    },
 
    async getById(id) {
      return _get(STORE.APP_USERS, id);
    },
 
    async getByApp(appKey) {
      return _getByIndex(STORE.APP_USERS, 'appKey', appKey);
    },
 
    async getCreatedBy(creatorUsername) {
      return _getByIndex(STORE.APP_USERS, 'createdBy', creatorUsername.toLowerCase());
    },
 
    async getAll() {
      return _getAll(STORE.APP_USERS);
    },
 
    async save(user) {
      const record = {
        id        : this.makeId(user.username, user.appKey),
        username  : user.username,
        appKey    : user.appKey,
        display   : user.display || user.appKey,
        hwid      : user.hwid   || '—',
        expiry    : user.expiry || '0',
        banned    : !!user.banned,
        expired   : !!user.expired,
        createdBy : (user.createdBy || '').toLowerCase(),
        createdAt : user.createdAt || Date.now(),
        updatedAt : Date.now(),
      };
      await _put(STORE.APP_USERS, record);
      return record;
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
 
    async replaceAll(users) {
      return _replaceAll(STORE.APP_USERS, users.map(u => ({
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
 
  /* ─────────────────────────────────────────────────
     API KEYS
  ───────────────────────────────────────────────── */
  const apiKeys = {
 
    /** Generate a deterministic-but-unique key for a username */
    _generate(username) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const seed  = username.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
      let key = 'ac_';
      for (let i = 0; i < 32; i++)
        key += chars[Math.abs(Math.floor(seed * (i + 1) * 17 + i * 31)) % chars.length];
      return key;
    },
 
    /**
     * Get (or lazily create) the API key for a username.
     */
    async getOrCreate(username) {
      const key  = username.toLowerCase();
      let record = await _get(STORE.API_KEYS, key);
      if (!record) {
        record = { username: key, key: this._generate(username), createdAt: Date.now() };
        await _put(STORE.API_KEYS, record);
      }
      return record.key;
    },
 
    async get(username) {
      const record = await _get(STORE.API_KEYS, username.toLowerCase());
      return record ? record.key : null;
    },
 
    async regenerate(username, changedBy) {
      const key    = username.toLowerCase();
      const newKey = this._generate(username + Date.now());
      await _put(STORE.API_KEYS, { username: key, key: newKey, createdAt: Date.now() });
      await audit.log({
        actor  : (changedBy || key).toLowerCase(),
        target : key,
        action : 'api_key_regenerated',
        detail : `API key regenerated for ${username}`,
      });
      return newKey;
    },
  };
 
  /* ─────────────────────────────────────────────────
     AUDIT LOG
  ───────────────────────────────────────────────── */
  const audit = {
 
    async log({ actor, target, action, detail }) {
      return _put(STORE.AUDIT, {
        actor    : actor  || '',
        target   : target || '',
        action   : action || '',
        detail   : detail || '',
        timestamp: Date.now(),
      });
    },
 
    async getAll() {
      return _getAll(STORE.AUDIT);
    },
 
    async getByActor(actor) {
      return _getByIndex(STORE.AUDIT, 'actor', actor.toLowerCase());
    },
 
    async getByTarget(target) {
      return _getByIndex(STORE.AUDIT, 'target', target.toLowerCase());
    },
 
    /** Returns entries sorted newest-first, limited to `limit` rows */
    async getRecent(limit = 50) {
      const all = await this.getAll();
      return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    },
  };
 
  /* ─────────────────────────────────────────────────
     META  (last-sync timestamps, etc.)
  ───────────────────────────────────────────────── */
  const meta = {
    async set(key, value) { return _put(STORE.META, { key, value }); },
    async get(key)        { const r = await _get(STORE.META, key); return r ? r.value : null; },
    async remove(key)     { return _delete(STORE.META, key); },
  };
 
  /* ─────────────────────────────────────────────────
     MIGRATION HELPER
     Reads legacy localStorage data and imports it into
     IndexedDB on first run.
  ───────────────────────────────────────────────── */
  async function migrateFromLocalStorage(ownerUsername) {
    const migrated = await meta.get('ls_migrated');
    if (migrated) return; // already done
 
    console.info('[AuthDB] Running one-time localStorage → IndexedDB migration…');
 
    /* ── owner account ── */
    const ownerPw = localStorage.getItem('authcs_pw_' + ownerUsername) || 'admin';
    await accounts.save({
      username   : ownerUsername,
      password   : ownerPw,
      role       : 'owner',
      packages   : ['insanzocheatsaimkill','insanzoexternal','insanzointernal','insanzostreamer','insanzouidbypass'],
      createdBy  : '',
      apiEnabled : true,
    });
 
    /* ── subsellers ── */
    let ssList = [];
    try { ssList = JSON.parse(localStorage.getItem('authcs_subsellers') || '[]'); } catch (_) {}
    for (const ss of ssList) {
      const pw = localStorage.getItem('authcs_pw_' + ss.username) || ss.password || '';
      await accounts.save({
        username   : ss.username,
        password   : pw,
        role       : 'subseller',
        packages   : ss.packages || [],
        createdBy  : ownerUsername,
        since      : ss.since || Date.now(),
        apiEnabled : false,
      });
    }
 
    /* ── resellers ── */
    let rsList = [];
    try { rsList = JSON.parse(localStorage.getItem('authcs_resellers') || '[]'); } catch (_) {}
    for (const rs of rsList) {
      const pw       = localStorage.getItem('authcs_pw_' + rs.username) || rs.password || '';
      const enabled  = localStorage.getItem('authcs_api_enabled_' + rs.username) === '1';
      await accounts.save({
        username   : rs.username,
        password   : pw,
        role       : 'reseller',
        packages   : rs.packages || [],
        createdBy  : rs.createdBy || ownerUsername,
        since      : rs.since || Date.now(),
        apiEnabled : enabled,
      });
    }
 
    /* ── creation log → createdBy fields on app-users ── */
    let creationLog = {};
    try { creationLog = JSON.parse(localStorage.getItem('authcs_creation_log') || '{}'); } catch (_) {}
 
    const allAppUsers = await appUsers.getAll();
    for (const u of allAppUsers) {
      const info = creationLog[u.id];
      if (info && info.createdBy && !u.createdBy) {
        u.createdBy = info.createdBy.toLowerCase();
        u.createdAt = info.at || u.createdAt;
        await _put(STORE.APP_USERS, u);
      }
    }
 
    await meta.set('ls_migrated', Date.now());
    console.info('[AuthDB] Migration complete.');
  }
 
  /* ─────────────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────────────── */
  return {
    init,
    migrateFromLocalStorage,
    accounts,
    appUsers,
    apiKeys,
    audit,
    meta,
    STORE,
  };
 
})();
 
/* Make available globally */
window.AuthDB = AuthDB;

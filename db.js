/**
 * Auth.cs — db.js (v4 — Real Supabase Backend)
 * NO IndexedDB. NO localStorage for user data.
 * All data stored in Supabase via /api/db-server.js
 */
 
const AuthDB = (() => {
 
  const API_BASE = '/api/db-server';
 
  const OWNER_USERNAME     = 'INSANZO';
  const OWNER_DEFAULT_PASS = '1234';
 
  const ALL_APPS = [
    'insanzocheatsaimkill',
    'insanzoexternal',
    'insanzointernal',
    'insanzostreamer',
    'insanzouidbypass',
  ];
 
  // ─── HTTP helpers ──────────────────────────────────────────────────────────
  async function _api(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    if (!res.ok) {
      let msg = 'Server error ' + res.status;
      try { const j = await res.json(); msg = j.error || msg; } catch(_) {}
      throw new Error(msg);
    }
    return res.json();
  }
 
  const GET  = (path)       => _api('GET',    path);
  const POST = (path, body) => _api('POST',   path, body);
  const PUT  = (path, body) => _api('PUT',    path, body);
  const DEL  = (path)       => _api('DELETE', path);
 
  // ─── init ──────────────────────────────────────────────────────────────────
  async function init() {
    try { await GET('/ping'); } catch(e) { console.warn('AuthDB backend unreachable:', e.message); }
    return true;
  }
 
  // ─── ACCOUNTS ─────────────────────────────────────────────────────────────
  const accounts = {
 
    async getByUsername(username) {
      if (!username) return null;
      try {
        const r = await GET('/accounts/' + encodeURIComponent(username.toLowerCase()));
        return r || null;
      } catch(e) {
        if (e.message.includes('404') || e.message.includes('not found')) return null;
        throw e;
      }
    },
 
    async getAll()        { return GET('/accounts'); },
    async getByRole(role) { return GET('/accounts?role=' + encodeURIComponent(role)); },
    async getCreatedBy(u) { return GET('/accounts?createdBy=' + encodeURIComponent((u||'').toLowerCase())); },
    async save(data)      { return POST('/accounts', data); },
 
    async verifyLogin(username, password) {
      try {
        const r = await POST('/accounts/verify', { username, password });
        return r || null;
      } catch(_) { return null; }
    },
 
    async changePassword(username, newPass, changedBy) {
      return PUT('/accounts/' + encodeURIComponent(username.toLowerCase()) + '/password', {
        newPassword: newPass,
        changedBy: (changedBy||'').toLowerCase(),
      });
    },
 
    async setTotpSecret(username, secret) {
      return PUT('/accounts/' + encodeURIComponent(username.toLowerCase()) + '/totp', {
        secret: secret || '',
      });
    },
 
    async getTotpSecret(username) {
      const acc = await this.getByUsername(username);
      return acc ? (acc.totpSecret || '') : '';
    },
 
    async updatePackages(username, packages, changedBy) {
      return PUT('/accounts/' + encodeURIComponent(username.toLowerCase()) + '/packages', {
        packages,
        changedBy: (changedBy||'').toLowerCase(),
      });
    },
 
    async setApiEnabled(username, enabled, changedBy) {
      return PUT('/accounts/' + encodeURIComponent(username.toLowerCase()) + '/api-enabled', {
        enabled: !!enabled,
        changedBy: (changedBy||'').toLowerCase(),
      });
    },
 
    async set2FAEnabled(username, enabled, changedBy) {
      return PUT('/accounts/' + encodeURIComponent(username.toLowerCase()) + '/2fa-enabled', {
        enabled: !!enabled,
        changedBy: (changedBy||'').toLowerCase(),
      });
    },
 
    async setEnabled(username, enabled, changedBy) {
      return PUT('/accounts/' + encodeURIComponent(username.toLowerCase()) + '/enabled', {
        enabled: !!enabled,
        changedBy: (changedBy||'').toLowerCase(),
      });
    },
 
    async remove(username, deletedBy) {
      return DEL('/accounts/' + encodeURIComponent(username.toLowerCase()) +
        '?deletedBy=' + encodeURIComponent((deletedBy||'').toLowerCase()));
    },
  };
 
  // ─── APP USERS ─────────────────────────────────────────────────────────────
  const appUsers = {
    makeId(username, appKey) {
      return appKey + '::' + (username||'').toLowerCase();
    },
    async getById(id) {
      try { return await GET('/app-users/' + encodeURIComponent(id)); } catch(_) { return null; }
    },
    async getByApp(appKey)  { return GET('/app-users?appKey=' + encodeURIComponent(appKey)); },
    async getAll()           { return GET('/app-users'); },
    async getCreatedBy(u)    { return GET('/app-users?createdBy=' + encodeURIComponent((u||'').toLowerCase())); },
    async save(u)            { return POST('/app-users', u); },
    async saveMany(users)    { return POST('/app-users/bulk', { users }); },
    async remove(username, appKey) {
      const id = this.makeId(username, appKey);
      return DEL('/app-users/' + encodeURIComponent(id));
    },
  };
 
  // ─── API KEYS ──────────────────────────────────────────────────────────────
  const apiKeys = {
    _generate(seed) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const h = (seed + Date.now() + Math.random())
        .split('').reduce((a,c,i) => a + c.charCodeAt(0) * (i+7), 0);
      let key = 'ac_';
      for (let i=0; i<32; i++)
        key += chars[Math.abs(Math.floor(h*(i+1.3)*17+i*31)) % chars.length];
      return key;
    },
    async getOrCreate(username) {
      try {
        const r = await GET('/api-keys/' + encodeURIComponent(username.toLowerCase()));
        if (r && r.key) return r.key;
      } catch(_) {}
      const newKey = this._generate(username);
      await POST('/api-keys', { username: username.toLowerCase(), key: newKey });
      return newKey;
    },
    async get(username) {
      try {
        const r = await GET('/api-keys/' + encodeURIComponent(username.toLowerCase()));
        return r ? r.key : null;
      } catch(_) { return null; }
    },
    async regenerate(username, changedBy) {
      const newKey = this._generate(username + Date.now() + Math.random());
      await PUT('/api-keys/' + encodeURIComponent(username.toLowerCase()), {
        key: newKey, changedBy: (changedBy||username).toLowerCase(),
      });
      return newKey;
    },
  };
 
  // ─── AUDIT ─────────────────────────────────────────────────────────────────
  const audit = {
    async log({ actor, target, action, detail }) {
      try { await POST('/audit', { actor:actor||'', target:target||'', action:action||'', detail:detail||'' }); } catch(_) {}
    },
    async getAll()          { return GET('/audit'); },
    async getRecent(n = 50) { return GET('/audit?limit=' + n); },
  };
 
  // ─── META ──────────────────────────────────────────────────────────────────
  const meta = {
    async set(key, val) { return POST('/meta', { key, value: val }); },
    async get(key) {
      try { const r = await GET('/meta/' + encodeURIComponent(key)); return r ? r.value : null; }
      catch(_) { return null; }
    },
    async remove(key) { return DEL('/meta/' + encodeURIComponent(key)); },
  };
 
  // ─── SEED OWNER ────────────────────────────────────────────────────────────
  async function seedOwner() {
    const existing = await accounts.getByUsername(OWNER_USERNAME);
    if (existing) return existing;
    return accounts.save({
      username    : OWNER_USERNAME,
      displayName : OWNER_USERNAME,
      password    : OWNER_DEFAULT_PASS,
      role        : 'owner',
      packages    : [...ALL_APPS],
      createdBy   : '',
      apiEnabled  : true,
      twoFAEnabled: true,
      enabled     : true,
      totpSecret  : '',
    });
  }
 
  // ─── TOTP ──────────────────────────────────────────────────────────────────
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
 
    otpauthUri(username, secret, issuer = 'Auth.cs') {
      return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    },
  };
 
  return {
    init, seedOwner, accounts, appUsers, apiKeys, audit, meta, totp,
    OWNER_USERNAME, ALL_APPS,
  };
 
})();
 
window.AuthDB = AuthDB;

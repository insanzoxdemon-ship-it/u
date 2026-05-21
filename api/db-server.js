/**
 * Auth.cs — /api/db-server.js
 * Vercel Serverless Function — Supabase backend
 *
 * Set these in Vercel → Settings → Environment Variables:
 *   SUPABASE_URL      = https://nzoenhkvkaysqqfvkoer.supabase.co
 *   SUPABASE_ANON_KEY = your-anon-key
 */
 
const SUPABASE_URL      = process.env.SUPABASE_URL      || 'https://nzoenhkvkaysqqfvkoer.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56b2VuaGt2a2F5c3FxZnZrb2VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzg5NjYsImV4cCI6MjA5NDkxNDk2Nn0.E5lnE20QPARVAFB3z-iTD4RuiXnX7F00aZ_bdWfV0gY';
 
// ─── Supabase REST helper ─────────────────────────────────────────────────────
async function sb(method, table, { filter = '', body, single = false } = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  if (filter) url += '&' + filter;
 
  const headers = {
    'apikey'       : SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type' : 'application/json',
    'Prefer'       : single ? 'return=representation' : 'return=representation',
  };
  if (single) headers['Accept'] = 'application/vnd.pgrst.object+json';
 
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
 
  const res  = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || msg; } catch(_) {}
    throw new Error(msg);
  }
  if (!text) return single ? null : [];
  try { return JSON.parse(text); } catch(_) { return null; }
}
 
// Supabase PATCH helper (uses eq filter in URL, not body)
async function sbPatch(table, filter, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const res = await fetch(url, {
    method : 'PATCH',
    headers: {
      'apikey'       : SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type' : 'application/json',
      'Prefer'       : 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) { let msg=text; try{msg=JSON.parse(text).message||msg;}catch(_){} throw new Error(msg); }
  return text ? JSON.parse(text) : null;
}
 
// Supabase DELETE helper
async function sbDelete(table, filter) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const res = await fetch(url, {
    method : 'DELETE',
    headers: {
      'apikey'       : SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Prefer'       : 'return=representation',
    },
  });
  if (!res.ok) { const t=await res.text(); let msg=t; try{msg=JSON.parse(t).message||msg;}catch(_){} throw new Error(msg); }
  return true;
}
 
// Supabase UPSERT helper
async function sbUpsert(table, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method : 'POST',
    headers: {
      'apikey'       : SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type' : 'application/json',
      'Prefer'       : 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) { let msg=text; try{msg=JSON.parse(text).message||msg;}catch(_){} throw new Error(msg); }
  return text ? JSON.parse(text) : null;
}
 
// ─── Password hashing (SHA-256) ───────────────────────────────────────────────
async function hashPass(plain) {
  const enc = new TextEncoder().encode(plain + ':authcs_salt_v1');
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
 
// ─── Row mappers (DB snake_case → JS camelCase) ───────────────────────────────
function mapAccount(row) {
  if (!row) return null;
  return {
    username    : row.username,
    displayName : row.display_name || row.username,
    password    : row.password,
    role        : row.role,
    packages    : row.packages || [],
    createdBy   : row.created_by || '',
    since       : row.since ? new Date(row.since).getTime() : Date.now(),
    apiEnabled  : row.api_enabled,
    twoFAEnabled: row.twofa_enabled,
    enabled     : row.enabled,
    totpSecret  : row.totp_secret || '',
  };
}
 
function mapAppUser(row) {
  if (!row) return null;
  return {
    id        : row.id,
    username  : row.username,
    appKey    : row.app_key,
    display   : row.display,
    hwid      : row.hwid,
    expiry    : row.expiry,
    banned    : row.banned,
    expired   : row.expired,
    createdBy : row.created_by || '',
    createdAt : row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}
 
// ─── Parse request body ───────────────────────────────────────────────────────
async function parseBody(req) {
  if (req.body) return req.body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch(_) { return {}; }
}
 
// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
 
  // On Vercel, req.url for a serverless function is always just the file's own path.
  // The sub-path (e.g. /accounts/insanzo) comes via the query string key that
  // matches the wildcard name in vercel.json — we named it "slug".
  const url    = req.url || '';
  const qs     = Object.fromEntries(new URL('http://x' + url).searchParams);
  let path = '/';
  if (qs.slug) {
    // From vercel.json rewrite: /api/db-server/:slug* -> ?slug=accounts/insanzo
    path = '/' + (Array.isArray(qs.slug) ? qs.slug.join('/') : qs.slug);
    delete qs.slug;
  } else {
    // Fallback: parse from the raw URL path
    const rawPath = url.split('?')[0];
    path = ('/' + rawPath.replace(/^\/api\/db-server\/?/, '')).replace(/\/+/g, '/') || '/';
  }
  const method = req.method;
  const body   = await parseBody(req);
 
  try {
 
    // ── PING ────────────────────────────────────────────────────────────────
    if (path === '/ping') {
      return res.status(200).json({ ok: true });
    }
 
    // ════════════════════════════════════════════════════════════════════════
    // ACCOUNTS
    // ════════════════════════════════════════════════════════════════════════
 
    // GET /accounts  or  /accounts?role=x  or  /accounts?createdBy=x
    if (path === '/accounts' && method === 'GET') {
      let filter = '';
      if (qs.role)      filter = 'role=eq.' + encodeURIComponent(qs.role);
      if (qs.createdBy) filter = 'created_by=eq.' + encodeURIComponent(qs.createdBy.toLowerCase());
      const rows = await sb('GET', 'accounts', { filter });
      return res.status(200).json((rows || []).map(mapAccount));
    }
 
    // POST /accounts  — create account
    if (path === '/accounts' && method === 'POST') {
      const u = body;
      // Check duplicate
      const check = await sb('GET', 'accounts', {
        filter: 'username=eq.' + encodeURIComponent((u.username||'').toLowerCase()),
        single: true,
      }).catch(() => null);
      if (check) return res.status(409).json({ error: 'Username already exists.' });
 
      const hashed = await hashPass(u.password || '');
      const rows = await sbUpsert('accounts', {
        username     : (u.username||'').toLowerCase(),
        display_name : u.displayName || u.username || '',
        password     : hashed,
        role         : u.role || 'reseller',
        packages     : u.packages || [],
        created_by   : (u.createdBy||'').toLowerCase(),
        api_enabled  : u.apiEnabled  === true,
        twofa_enabled: u.twoFAEnabled !== false,
        enabled      : u.enabled !== false,
        totp_secret  : u.totpSecret || '',
      });
      const saved = Array.isArray(rows) ? rows[0] : rows;
      return res.status(200).json(mapAccount(saved));
    }
 
    // POST /accounts/verify — login check
    if (path === '/accounts/verify' && method === 'POST') {
      const { username, password } = body;
      const rows = await sb('GET', 'accounts', {
        filter: 'username=eq.' + encodeURIComponent((username||'').toLowerCase()),
        single: true,
      }).catch(() => null);
      if (!rows) return res.status(200).json(null);
      const hashed = await hashPass(password || '');
      if (rows.password !== hashed) return res.status(200).json(null);
      return res.status(200).json(mapAccount(rows));
    }
 
    // GET /accounts/:username
    const accMatch = path.match(/^\/accounts\/([^/]+)$/);
    if (accMatch && method === 'GET') {
      const username = decodeURIComponent(accMatch[1]).toLowerCase();
      const row = await sb('GET', 'accounts', {
        filter: 'username=eq.' + encodeURIComponent(username),
        single: true,
      }).catch(() => null);
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(mapAccount(row));
    }
 
    // DELETE /accounts/:username
    if (accMatch && method === 'DELETE') {
      const username = decodeURIComponent(accMatch[1]).toLowerCase();
      await sbDelete('accounts', 'username=eq.' + encodeURIComponent(username));
      await sbDelete('api_keys',  'username=eq.' + encodeURIComponent(username)).catch(()=>{});
      return res.status(200).json({ ok: true });
    }
 
    // PUT /accounts/:username/password
    const pwMatch = path.match(/^\/accounts\/([^/]+)\/password$/);
    if (pwMatch && method === 'PUT') {
      const username = decodeURIComponent(pwMatch[1]).toLowerCase();
      const hashed   = await hashPass(body.newPassword || '');
      await sbPatch('accounts', 'username=eq.' + encodeURIComponent(username), {
        password: hashed, updated_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }
 
    // PUT /accounts/:username/totp
    const totpMatch = path.match(/^\/accounts\/([^/]+)\/totp$/);
    if (totpMatch && method === 'PUT') {
      const username = decodeURIComponent(totpMatch[1]).toLowerCase();
      await sbPatch('accounts', 'username=eq.' + encodeURIComponent(username), {
        totp_secret: body.secret || '', updated_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }
 
    // PUT /accounts/:username/packages
    const pkgMatch = path.match(/^\/accounts\/([^/]+)\/packages$/);
    if (pkgMatch && method === 'PUT') {
      const username = decodeURIComponent(pkgMatch[1]).toLowerCase();
      await sbPatch('accounts', 'username=eq.' + encodeURIComponent(username), {
        packages: body.packages || [], updated_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }
 
    // PUT /accounts/:username/api-enabled
    const apiEnMatch = path.match(/^\/accounts\/([^/]+)\/api-enabled$/);
    if (apiEnMatch && method === 'PUT') {
      const username = decodeURIComponent(apiEnMatch[1]).toLowerCase();
      await sbPatch('accounts', 'username=eq.' + encodeURIComponent(username), {
        api_enabled: !!body.enabled, updated_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }
 
    // PUT /accounts/:username/2fa-enabled
    const twoFAMatch = path.match(/^\/accounts\/([^/]+)\/2fa-enabled$/);
    if (twoFAMatch && method === 'PUT') {
      const username = decodeURIComponent(twoFAMatch[1]).toLowerCase();
      await sbPatch('accounts', 'username=eq.' + encodeURIComponent(username), {
        twofa_enabled: !!body.enabled, updated_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }
 
    // PUT /accounts/:username/enabled
    const enMatch = path.match(/^\/accounts\/([^/]+)\/enabled$/);
    if (enMatch && method === 'PUT') {
      const username = decodeURIComponent(enMatch[1]).toLowerCase();
      await sbPatch('accounts', 'username=eq.' + encodeURIComponent(username), {
        enabled: !!body.enabled, updated_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }
 
    // ════════════════════════════════════════════════════════════════════════
    // APP USERS
    // ════════════════════════════════════════════════════════════════════════
 
    // GET /app-users  or  ?appKey=x  or  ?createdBy=x
    if (path === '/app-users' && method === 'GET') {
      let filter = '';
      if (qs.appKey)    filter = 'app_key=eq.'    + encodeURIComponent(qs.appKey);
      if (qs.createdBy) filter = 'created_by=eq.' + encodeURIComponent(qs.createdBy.toLowerCase());
      const rows = await sb('GET', 'app_users', { filter });
      return res.status(200).json((rows || []).map(mapAppUser));
    }
 
    // POST /app-users — upsert single
    if (path === '/app-users' && method === 'POST') {
      const u = body;
      const row = {
        id        : u.id,
        username  : (u.username||'').toLowerCase(),
        app_key   : u.appKey || u.app_key || '',
        display   : u.display || '',
        hwid      : u.hwid || '—',
        expiry    : String(u.expiry || '0'),
        banned    : !!u.banned,
        expired   : !!u.expired,
        created_by: (u.createdBy||'').toLowerCase(),
        updated_at: new Date().toISOString(),
      };
      const saved = await sbUpsert('app_users', row);
      const result = Array.isArray(saved) ? saved[0] : saved;
      return res.status(200).json(mapAppUser(result));
    }
 
    // POST /app-users/bulk — upsert many
    if (path === '/app-users/bulk' && method === 'POST') {
      const users = (body.users || []).map(u => ({
        id        : u.id,
        username  : (u.username||'').toLowerCase(),
        app_key   : u.appKey || u.app_key || '',
        display   : u.display || '',
        hwid      : u.hwid || '—',
        expiry    : String(u.expiry || '0'),
        banned    : !!u.banned,
        expired   : !!u.expired,
        created_by: (u.createdBy||'').toLowerCase(),
        updated_at: new Date().toISOString(),
      }));
      if (users.length) await sbUpsert('app_users', users);
      return res.status(200).json({ ok: true, count: users.length });
    }
 
    // GET /app-users/:id
    const appUserMatch = path.match(/^\/app-users\/([^/]+)$/);
    if (appUserMatch && method === 'GET') {
      const id  = decodeURIComponent(appUserMatch[1]);
      const row = await sb('GET', 'app_users', {
        filter: 'id=eq.' + encodeURIComponent(id), single: true,
      }).catch(() => null);
      return res.status(200).json(mapAppUser(row));
    }
 
    // DELETE /app-users/:id
    if (appUserMatch && method === 'DELETE') {
      const id = decodeURIComponent(appUserMatch[1]);
      await sbDelete('app_users', 'id=eq.' + encodeURIComponent(id));
      return res.status(200).json({ ok: true });
    }
 
    // ════════════════════════════════════════════════════════════════════════
    // API KEYS
    // ════════════════════════════════════════════════════════════════════════
 
    // POST /api-keys — create/upsert
    if (path === '/api-keys' && method === 'POST') {
      await sbUpsert('api_keys', {
        username: body.username.toLowerCase(),
        key     : body.key,
      });
      return res.status(200).json({ ok: true });
    }
 
    // GET /api-keys/:username
    const apiKeyMatch = path.match(/^\/api-keys\/([^/]+)$/);
    if (apiKeyMatch && method === 'GET') {
      const username = decodeURIComponent(apiKeyMatch[1]).toLowerCase();
      const row = await sb('GET', 'api_keys', {
        filter: 'username=eq.' + encodeURIComponent(username), single: true,
      }).catch(() => null);
      return res.status(200).json(row || null);
    }
 
    // PUT /api-keys/:username — regenerate
    if (apiKeyMatch && method === 'PUT') {
      const username = decodeURIComponent(apiKeyMatch[1]).toLowerCase();
      await sbUpsert('api_keys', { username, key: body.key });
      return res.status(200).json({ ok: true });
    }
 
    // ════════════════════════════════════════════════════════════════════════
    // AUDIT
    // ════════════════════════════════════════════════════════════════════════
 
    if (path === '/audit' && method === 'POST') {
      await sb('POST', 'audit_log', { body: {
        actor : body.actor  || '',
        target: body.target || '',
        action: body.action || '',
        detail: body.detail || '',
      }});
      return res.status(200).json({ ok: true });
    }
 
    if (path === '/audit' && method === 'GET') {
      const limit = qs.limit || 100;
      const rows  = await sb('GET', 'audit_log', {
        filter: 'order=created_at.desc&limit=' + limit,
      });
      return res.status(200).json(rows || []);
    }
 
    // ════════════════════════════════════════════════════════════════════════
    // META
    // ════════════════════════════════════════════════════════════════════════
 
    if (path === '/meta' && method === 'POST') {
      await sbUpsert('meta', { key: body.key, value: body.value });
      return res.status(200).json({ ok: true });
    }
 
    const metaMatch = path.match(/^\/meta\/([^/]+)$/);
    if (metaMatch && method === 'GET') {
      const key = decodeURIComponent(metaMatch[1]);
      const row = await sb('GET', 'meta', {
        filter: 'key=eq.' + encodeURIComponent(key), single: true,
      }).catch(() => null);
      return res.status(200).json(row || null);
    }
    if (metaMatch && method === 'DELETE') {
      const key = decodeURIComponent(metaMatch[1]);
      await sbDelete('meta', 'key=eq.' + encodeURIComponent(key));
      return res.status(200).json({ ok: true });
    }
 
    return res.status(404).json({ error: 'Not found: ' + path });
 
  } catch(e) {
    console.error('[db-server]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
 

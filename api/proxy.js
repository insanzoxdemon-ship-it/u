// api/proxy.js
const SELLER_KEYS = {
  insanzocheatsaimkill: '0846b72c68f3e1f71b2c98ef70506662',
  insanzoexternal:      'f3d0dee23dd54f14d37a0b5dac289167',
  insanzointernal:      'e7fd4f2e13db176a01f0ce674c5536c0',
  insanzostreamer:      '78d3c60281d594750f3ceb43faed838e',
  insanzouidbypass:     '0c366611ec5b61c216dc26b9f11a065e',
};
 
const SLUG_MAP = {
  aimkill:   'insanzocheatsaimkill',
  external:  'insanzoexternal',
  internal:  'insanzointernal',
  streamer:  'insanzostreamer',
  uidbypass: 'insanzouidbypass',
};
 
const YOUR_API_KEY = "ac_SmfgyJEs7rKQgofx3lLVP2cQpzdNYSkk";
 
let RESELLER_API_KEYS = {
  [YOUR_API_KEY]: { username: "owner", allowed_slugs: ["*"] },
};
 
try {
  if (process.env.VERIFIED_RESELLERS) {
    RESELLER_API_KEYS = { ...RESELLER_API_KEYS, ...JSON.parse(process.env.VERIFIED_RESELLERS) };
  }
} catch(e) {}
 
function validateApiKey(k) { return k ? (RESELLER_API_KEYS[k] || null) : null; }
 
async function sellerCall(appid, params) {
  const key = SELLER_KEYS[appid];
  if (!key) return { success: false, message: 'Unknown appid.' };
  const qs = new URLSearchParams({ sellerkey: key, ...params }).toString();
  const r  = await fetch(`https://keyauth.win/api/seller/?${qs}`, { headers: { 'User-Agent': 'AuthCS/1.0' } });
  return r.json();
}
 
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');
 
  if (req.method === 'OPTIONS') return res.status(200).end();
 
  const rawPath = (req.url || '').split('?')[0];
 
  // ── POST /api/proxy/package/{slug}/days/{days}/user/{user}/pass/{pass} ──
  if (req.method === 'POST' && /\/package\//.test(rawPath)) {
    const apiKey  = req.headers['x-api-key'] || '';
    const reseller = validateApiKey(apiKey);
    if (!reseller) return res.status(401).json({ success: false, message: 'Invalid or missing X-API-KEY.' });
 
    const m = rawPath.match(/\/package\/([^/]+)\/days\/([^/]+)\/user\/([^/]+)\/pass\/([^/]+)/);
    if (!m) return res.status(400).json({ success: false, message: 'Malformed URL.' });
 
    let [, slugRaw, days, username, password] = m;
    slugRaw = slugRaw.toLowerCase();
 
    const al = reseller.allowed_slugs;
    if (al && !al.includes('*') && !al.includes(slugRaw))
      return res.status(403).json({ success: false, message: `Package '${slugRaw}' not allowed.` });
 
    const appid = SLUG_MAP[slugRaw] || slugRaw;
    if (!SELLER_KEYS[appid]) return res.status(404).json({ success: false, message: 'Unknown package.' });
 
    try {
      const data = await sellerCall(appid, { type: 'adduser', user: username, pass: password, expiry: days, sub: 'default' });
      if (data.success) return res.status(200).json({ success: true, message: 'User created.', username, package: slugRaw, expires: days === '-1' ? 'Lifetime' : `${days} days` });
      return res.status(200).json({ success: false, message: data.message || 'Failed.' });
    } catch(e) { return res.status(502).json({ success: false, message: e.message }); }
  }
 
  // ── POST /api/proxy/user/{user}/resethwid ──
  if (req.method === 'POST' && /\/user\/[^/]+\/resethwid/.test(rawPath)) {
    const reseller = validateApiKey(req.headers['x-api-key'] || '');
    if (!reseller) return res.status(401).json({ success: false, message: 'Invalid X-API-KEY.' });
    const user = rawPath.match(/\/user\/([^/]+)\/resethwid/)[1];
    for (const appid of Object.keys(SELLER_KEYS)) {
      try { const d = await sellerCall(appid, { type: 'resetuser', user }); if (d.success) return res.status(200).json({ success: true, message: 'HWID reset.', username: user }); } catch {}
    }
    return res.status(200).json({ success: false, message: 'User not found.' });
  }
 
  // ── DELETE/POST /api/proxy/user/{user}/delete ──
  if ((req.method === 'DELETE' || req.method === 'POST') && /\/user\/[^/]+\/delete/.test(rawPath)) {
    const reseller = validateApiKey(req.headers['x-api-key'] || '');
    if (!reseller) return res.status(401).json({ success: false, message: 'Invalid X-API-KEY.' });
    const user = rawPath.match(/\/user\/([^/]+)\/delete/)[1];
    for (const appid of Object.keys(SELLER_KEYS)) {
      try { const d = await sellerCall(appid, { type: 'deluser', user }); if (d.success) return res.status(200).json({ success: true, message: 'User deleted.', username: user }); } catch {}
    }
    return res.status(200).json({ success: false, message: 'User not found.' });
  }
 
  // ── POST /api/proxy/user/{user}/ban ──
  if (req.method === 'POST' && /\/user\/[^/]+\/ban$/.test(rawPath)) {
    const reseller = validateApiKey(req.headers['x-api-key'] || '');
    if (!reseller) return res.status(401).json({ success: false, message: 'Invalid X-API-KEY.' });
    const user = rawPath.match(/\/user\/([^/]+)\/ban$/)[1];
    for (const appid of Object.keys(SELLER_KEYS)) {
      try { const d = await sellerCall(appid, { type: 'banuser', user }); if (d.success) return res.status(200).json({ success: true, message: 'User banned.', username: user }); } catch {}
    }
    return res.status(200).json({ success: false, message: 'User not found or already banned.' });
  }
 
  // ── POST /api/proxy/user/{user}/unban ──
  if (req.method === 'POST' && /\/user\/[^/]+\/unban$/.test(rawPath)) {
    const reseller = validateApiKey(req.headers['x-api-key'] || '');
    if (!reseller) return res.status(401).json({ success: false, message: 'Invalid X-API-KEY.' });
    const user = rawPath.match(/\/user\/([^/]+)\/unban$/)[1];
    for (const appid of Object.keys(SELLER_KEYS)) {
      try { const d = await sellerCall(appid, { type: 'unbanuser', user }); if (d.success) return res.status(200).json({ success: true, message: 'User unbanned.', username: user }); } catch {}
    }
    return res.status(200).json({ success: false, message: 'User not found or already unbanned.' });
  }
 
  // ── Internal dashboard calls (query params) ──
  const params = { ...req.query };
  let appid = params.appid;
  if (appid && SLUG_MAP[appid]) appid = SLUG_MAP[appid];
  if (!SELLER_KEYS[appid]) return res.status(403).json({ success: false, message: 'Unknown appid.' });
 
  const type = params.type;
  const allowed = ['fetchallusers', 'adduser', 'deluser', 'resetuser', 'ban', 'unban', 'banuser', 'unbanuser'];
  if (!type || !allowed.includes(type)) return res.status(400).json({ success: false, message: 'Invalid type.' });
 
  const up = { type };
  if (type === 'adduser')  { up.user = params.user||''; up.pass = params.pass||''; up.expiry = params.expiry||'30'; up.sub = params.sub||'default'; }
  else if (type === 'ban') up.type = 'banuser';
  else if (type === 'unban') up.type = 'unbanuser';
  else up.user = params.user || '';
 
  try {
    const data = await sellerCall(appid, up);
    return res.status(200).json(data);
  } catch(e) { return res.status(502).json({ success: false, message: e.message }); }
}

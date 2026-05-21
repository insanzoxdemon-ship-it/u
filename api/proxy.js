// api/proxy.js — with detailed logging
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

const ALLOWED_TYPES = ['fetchallusers', 'adduser', 'deluser', 'resetuser'];

// ✅ YOUR API KEY (exactly as copied from dashboard)
const YOUR_API_KEY = "ac_SmfgyJEs7rKQgofx3lLVP2cQpzdNYSkk";

let RESELLER_API_KEYS = {
  [YOUR_API_KEY]: { 
    username: "discord_bot", 
    allowed_slugs: ["*"]   // all packages
  },
};

// Merge with environment variable if present
try {
  if (process.env.VERIFIED_RESELLERS) {
    const envKeys = JSON.parse(process.env.VERIFIED_RESELLERS);
    RESELLER_API_KEYS = { ...RESELLER_API_KEYS, ...envKeys };
  }
} catch (e) {
  console.error('Failed to parse VERIFIED_RESELLERS env var', e);
}

function validateApiKey(apiKey) {
  if (!apiKey) return null;
  const info = RESELLER_API_KEYS[apiKey];
  return info || null;
}

export default async function handler(req, res) {
  // Always return JSON, never HTML
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawPath = (req.url || '').split('?')[0];
  console.log(`[PROXY] ${req.method} ${rawPath}`);

  // ==================== EXTERNAL REST API ====================
  if (req.method === 'POST' && /^\/api\/proxy\/package\//.test(rawPath)) {
    const apiKey = req.headers['x-api-key'] || '';
    console.log(`[PROXY] Received API Key: ${apiKey ? apiKey.substring(0, 20) + '...' : 'MISSING'}`);

    const reseller = validateApiKey(apiKey);
    if (!reseller) {
      console.log(`[PROXY] Invalid API key: ${apiKey}`);
      return res.status(401).json({ success: false, message: 'Invalid or missing X-API-KEY header.' });
    }
    console.log(`[PROXY] Valid key for reseller: ${reseller.username}`);

    const match = rawPath.match(/\/package\/([^/]+)\/days\/([^/]+)\/user\/([^/]+)\/pass\/([^/]+)/);
    if (!match) return res.status(400).json({ success: false, message: 'Malformed request URL.' });

    let [, slugRaw, days, username, password] = match;
    slugRaw = slugRaw.toLowerCase();

    const allowed = reseller.allowed_slugs;
    if (allowed && !allowed.includes(slugRaw) && !allowed.includes('*')) {
      return res.status(403).json({ success: false, message: `Package '${slugRaw}' not allowed for this key.` });
    }

    const appid = SLUG_MAP[slugRaw] || slugRaw;
    const sellerkey = SELLER_KEYS[appid];
    if (!sellerkey) return res.status(404).json({ success: false, message: 'Unknown package slug.' });

    try {
      const qs = new URLSearchParams({ sellerkey, type: 'adduser', user: username, pass: password, expiry: days, sub: 'default' }).toString();
      const data = await (await fetch(`https://keyauth.win/api/seller/?${qs}`, { headers: { 'User-Agent': 'AuthCS/1.0' } })).json();
      if (data.success) {
        return res.status(200).json({
          success: true,
          message: 'User created successfully',
          username,
          package: slugRaw,
          expires: days === '-1' ? 'Lifetime' : `${days} days`,
          via: 'seller_api',
          reseller: reseller.username
        });
      }
      return res.status(200).json({ success: false, message: data.message || 'Request failed.' });
    } catch (err) {
      return res.status(502).json({ success: false, message: 'Upstream error: ' + err.message });
    }
  }

  // POST /user/{username}/resethwid
  if (req.method === 'POST' && /\/user\/[^/]+\/resethwid/.test(rawPath)) {
    const apiKey = req.headers['x-api-key'] || '';
    const reseller = validateApiKey(apiKey);
    if (!reseller) {
      return res.status(401).json({ success: false, message: 'Invalid or missing X-API-KEY header.' });
    }

    const match = rawPath.match(/\/user\/([^/]+)\/resethwid/);
    if (!match) return res.status(400).json({ success: false, message: 'Malformed URL.' });
    const username = match[1];

    for (const [appid, sellerkey] of Object.entries(SELLER_KEYS)) {
      try {
        const qs = new URLSearchParams({ sellerkey, type: 'resetuser', user: username }).toString();
        const data = await (await fetch(`https://keyauth.win/api/seller/?${qs}`, { headers: { 'User-Agent': 'AuthCS/1.0' } })).json();
        if (data.success) {
          return res.status(200).json({ success: true, message: 'HWID reset successfully.', username });
        }
      } catch {}
    }
    return res.status(200).json({ success: false, message: 'User not found in any application.' });
  }

  // DELETE /user/{username}/delete
  if ((req.method === 'DELETE' || req.method === 'POST') && /\/user\/[^/]+\/delete/.test(rawPath)) {
    const apiKey = req.headers['x-api-key'] || '';
    const reseller = validateApiKey(apiKey);
    if (!reseller) {
      return res.status(401).json({ success: false, message: 'Invalid or missing X-API-KEY header.' });
    }

    const match = rawPath.match(/\/user\/([^/]+)\/delete/);
    if (!match) return res.status(400).json({ success: false, message: 'Malformed URL.' });
    const username = match[1];

    for (const [appid, sellerkey] of Object.entries(SELLER_KEYS)) {
      try {
        const qs = new URLSearchParams({ sellerkey, type: 'deluser', user: username }).toString();
        const data = await (await fetch(`https://keyauth.win/api/seller/?${qs}`, { headers: { 'User-Agent': 'AuthCS/1.0' } })).json();
        if (data.success) {
          return res.status(200).json({ success: true, message: 'User deleted permanently.', username });
        }
      } catch {}
    }
    return res.status(200).json({ success: false, message: 'User not found in any application.' });
  }

  // ==================== INTERNAL DASHBOARD ====================
  const params = { ...req.query };
  let appid = params.appid;
  if (appid && SLUG_MAP[appid]) appid = SLUG_MAP[appid];

  const sellerkey = SELLER_KEYS[appid];
  if (!sellerkey) return res.status(403).json({ success: false, message: 'Unknown appid.' });

  const type = params.type;
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid action type.' });
  }

  const upstream = { sellerkey, type };
  if (type === 'adduser') {
    upstream.user = params.user || '';
    upstream.pass = params.pass || '';
    upstream.expiry = params.expiry || '30';
    upstream.sub = params.sub || 'default';
  } else if (type === 'deluser') {
    upstream.user = params.user || '';
  } else if (type === 'resetuser') {
    upstream.user = params.user || '';
  }

  try {
    const qs = new URLSearchParams(upstream).toString();
    const data = await (await fetch(`https://keyauth.win/api/seller/?${qs}`, { headers: { 'User-Agent': 'AuthCS/1.0' } })).json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ success: false, message: 'Upstream error: ' + err.message });
  }
}

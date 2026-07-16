const https = require('https');

const TRA_BASE = 'https://verify.tra.go.tz';

// Headers applied to every response — security hardening.
const SECURITY_HEADERS = {
  'X-Content-Type-Options':  'nosniff',
  'X-Frame-Options':         'DENY',
  // The proxied TRA page must never execute in a browser under our origin.
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Referrer-Policy':         'no-referrer',
  'Permissions-Policy':      'camera=(), microphone=(), geolocation=()',
  // Receipt verification data must never be cached anywhere in the chain.
  'Cache-Control':           'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma':                  'no-cache',
  'Vary':                    '*',
};

// In-memory rate limiter: 60 requests per IP per minute.
// Resets on cold start; this is a personal tool, so a modest cap is enough
// to stop runaway loops without getting in your own way.
const ipHits = new Map();
const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;

function checkRateLimit(ip) {
  const now = Date.now();
  if (ipHits.size > 1000) {
    for (const [key, val] of ipHits) {
      if (now > val.resetAt) ipHits.delete(key);
    }
  }
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

/** Extract the real client IP, preferring Vercel's x-real-ip over x-forwarded-for,
 *  falling back to the raw socket address when running as a plain local server. */
function getClientIp(req) {
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp.trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

/**
 * Vercel serverless function: GET /api/tra-verify?link=<TRA_URL>
 *
 * Fetches a TRA receipt verification page server-side (no browser CORS
 * involved at all, since this runs on the server) using the Referer-based
 * request shape TRA's portal actually expects.
 *
 * Security: the `link` parameter is validated against a strict allowlist
 * regex before ever being used, to prevent Server-Side Request Forgery
 * (SSRF) — this function can only ever reach verify.tra.go.tz URLs matching
 * the exact receipt-link shape, nothing else. All responses include
 * hardened security headers and Cache-Control: no-store so taxpayer data is
 * never cached anywhere in the chain.
 */
module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain', 'Allow': 'GET' });
    res.end('Method not allowed');
    return;
  }

  const ip = getClientIp(req);
  if (checkRateLimit(ip)) {
    res.writeHead(429, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain', 'Retry-After': '60' });
    res.end('Too many requests');
    return;
  }

  const rawUrl = req.url || '/';
  const qmark = rawUrl.indexOf('?');
  const search = qmark >= 0 ? rawUrl.slice(qmark + 1) : '';
  const link = new URLSearchParams(search).get('link') || '';

  // Strict allowlist: only accept https://verify.tra.go.tz/{RCTVNUM}_{HHMMSS}
  const m = link.match(/^https:\/\/verify\.tra\.go\.tz\/([A-Z0-9]{1,64})_(\d{6})$/i);
  if (!m) {
    res.writeHead(400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' });
    res.end('Invalid or missing link parameter');
    return;
  }

  const [, rctvnum, timeRaw] = m;
  const secret = `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}:${timeRaw.slice(4, 6)}`;
  const verifiedUrl = `${TRA_BASE}/Verify/Verified?Secret=${encodeURIComponent(secret)}`;
  const referer = `${TRA_BASE}/${rctvnum}_${timeRaw}`;

  const upstreamReq = https.get(verifiedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'text/html,application/xhtml+xml',
      'Referer': referer,
    },
  }, (upstream) => {
    const upstreamStatus = upstream.statusCode || 200;
    const status = upstreamStatus === 200 ? 200 : 502;
    // text/plain (not text/html): the front end reads this as plain text and
    // pattern-matches it — it must never render/execute as HTML under our origin.
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain;charset=UTF-8' });
    upstream.pipe(res);
  });

  upstreamReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' });
    }
    res.end('Upstream request failed');
  });

  upstreamReq.setTimeout(12000, () => {
    upstreamReq.destroy(new Error('timeout'));
  });
};

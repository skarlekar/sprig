// Small crypto helpers: random tokens, hashes, signed cookies and encrypted share tokens.
import crypto from 'node:crypto';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
export const pkceChallenge = verifier => crypto.createHash('sha256').update(verifier).digest('base64url');

// value.signature, where value is base64url JSON with an expiry. Used for short-lived cookies only.
export function sign(obj, secret, ttlMs) {
  const value = Buffer.from(JSON.stringify({ ...obj, exp: Date.now() + ttlMs })).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${mac}`;
}
export function verify(token, secret) {
  if (typeof token !== 'string') return null;
  const [value, mac] = token.split('.');
  if (!value || !mac) return null;
  const want = crypto.createHmac('sha256', secret).update(value).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const obj = JSON.parse(Buffer.from(value, 'base64url').toString());
    return obj.exp > Date.now() ? obj : null;
  } catch { return null; }
}

// AES-256-GCM so the Share dialog can show a link again without storing it in plain text.
export function encrypt(text, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}
export function decrypt(blob, key) {
  const [iv, tag, data] = blob.split('.').map(s => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

// Fixed-window counter kept in memory; enough for one server process.
export function rateLimiter() {
  const hits = new Map();
  const timer = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset <= now) hits.delete(k); }, 60_000);
  timer.unref();
  return function limit(key, max, windowMs = 60_000) {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset <= now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    h.n++;
    return h.n <= max ? null : Math.ceil((h.reset - now) / 1000);
  };
}

export const CSP = [
  "default-src 'self'", "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // templates build style attributes; scripts are never inline
  'font-src https://fonts.gstatic.com', "img-src 'self' data: blob:", "connect-src 'self'",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

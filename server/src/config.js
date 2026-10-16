// Reads settings from the environment and refuses to start when something required is missing or unsafe.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const list = v => (v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export function loadConfig(env = process.env) {
  const errors = [];
  const publicUrl = (env.PUBLIC_URL || 'http://localhost:8080').replace(/\/+$/, '');
  let url;
  try { url = new URL(publicUrl); } catch { errors.push('PUBLIC_URL is not a valid URL'); url = new URL('http://localhost'); }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const secure = url.protocol === 'https:';

  const allowed = list(env.ALLOWED_EMAILS);
  const owner = (env.OWNER_EMAIL || allowed[0] || '').trim().toLowerCase();
  if (!allowed.length) errors.push('ALLOWED_EMAILS must list at least one email address');
  if (owner && !allowed.includes(owner)) errors.push('OWNER_EMAIL must also be in ALLOWED_EMAILS');

  const sessionSecret = env.SESSION_SECRET || '';
  if (sessionSecret.length < 32) errors.push('SESSION_SECRET must be at least 32 characters (try: openssl rand -hex 32)');
  const shareKey = env.SHARE_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(shareKey)) errors.push('SHARE_KEY must be 64 hex characters (try: openssl rand -hex 32)');

  const devLogin = env.DEV_LOGIN === '1';
  if (devLogin && !isLocal) errors.push('DEV_LOGIN is only allowed when PUBLIC_URL points at localhost');

  // A provider is on when both its id and secret are set. Order here is the order of the sign-in buttons.
  const providers = {};
  for (const [id, key] of [['google', 'GOOGLE'], ['facebook', 'FACEBOOK'], ['x', 'X']]) {
    const clientId = env[`${key}_CLIENT_ID`], clientSecret = env[`${key}_CLIENT_SECRET`];
    if (clientId && clientSecret) providers[id] = { clientId, clientSecret };
    else if (clientId || clientSecret) errors.push(`Set both ${key}_CLIENT_ID and ${key}_CLIENT_SECRET, or neither`);
  }
  if (providers.facebook) providers.facebook.version = env.FACEBOOK_GRAPH_VERSION || 'v26.0';
  if (!Object.keys(providers).length && !devLogin) errors.push('Set up at least one sign-in provider (Google, Facebook or X), or DEV_LOGIN=1 for local testing');

  if (errors.length) { const e = new Error('Sprig cannot start:\n  - ' + errors.join('\n  - ')); e.config = true; throw e; }

  return {
    publicUrl, origin: url.origin, secure, isLocal,
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    dataDir: env.DATA_DIR || path.resolve(here, '../../data'),
    dbFile: env.DB_FILE, // optional override, ':memory:' in tests
    webDir: env.WEB_DIR || path.resolve(here, '../..'),
    allowed: new Set(allowed), owner,
    sessionSecret, shareKey: Buffer.from(shareKey, 'hex'),
    providers, devLogin,
    trustProxy: env.TRUST_PROXY || false,
    cookie: {
      session: secure ? '__Host-sprig_session' : 'sprig_session',
      oauth: secure ? '__Host-sprig_oauth' : 'sprig_oauth',
      refused: secure ? '__Host-sprig_refused' : 'sprig_refused',
    },
    logLevel: env.LOG_LEVEL || 'info',
  };
}

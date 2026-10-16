// The Sprig web server: sign-in, the maps API, share links and the editor files.
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { buildProviders, PROVIDER_NAMES } from './providers.js';
import { zipSync, strToU8 } from 'fflate';
import { tx } from './db.js';
import { randomToken, sha256, pkceChallenge, sign, verify, encrypt, decrypt, rateLimiter, CSP } from './security.js';
import { loginPage, deniedPage, messagePage } from './pages.js';

const DAY = 86_400_000, HOUR = 3_600_000, MIN = 60_000;
const SESSION_TTL = 30 * DAY;
const MAP_BODY_LIMIT = 5 * 1024 * 1024;

// Share tokens must never reach the logs.
const redact = url => String(url).replace(/^\/(s|api\/shared)\/[^/?#]+/, '/$1/[redacted]');

export async function buildApp(config, { db, providers } = {}) {
  const require = createRequire(import.meta.url);
  const S = require(path.join(config.webDir, 'sanitize.js'));
  const newId = () => { let s = ''; for (const b of crypto.randomBytes(16)) s += (b % 36).toString(36); return s; };
  providers = providers || buildProviders(config);

  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
    logger: config.logLevel === 'silent' ? false : {
      level: config.logLevel,
      serializers: { req: r => ({ method: r.method, url: redact(r.url), id: r.id }) },
    },
  });
  await app.register(cookie);

  // ---------- files ----------
  const readWeb = f => fs.readFileSync(path.join(config.webDir, f), 'utf8');
  const indexHtml = readWeb('index.html');
  // index.html uses relative script paths so it also works opened from disk; the server pins them to the root.
  const pageFor = mode => '<!doctype html>\n' + indexHtml
    .replace('<meta name="sprig-mode" content="local">', `<meta name="sprig-mode" content="${mode}">`)
    .replace('<script src="sanitize.js"></script>', '<script src="/sanitize.js"></script>')
    .replace('<script src="app.js"></script>', '<script src="/app.js"></script>');
  const scripts = { '/app.js': readWeb('app.js'), '/sanitize.js': readWeb('sanitize.js') };

  // ---------- statements ----------
  const q = {
    session: db.prepare(`SELECT s.token_hash, s.user_id, s.last_seen_at, s.expires_at, u.email, u.name, u.role, u.seeded
                         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.disabled_at IS NULL`),
    touchSession: db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?'),
    dropSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    dropUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    newSession: db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    newUser: db.prepare('INSERT INTO users (id, email, name, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    loginUser: db.prepare('UPDATE users SET last_login_at = ?, name = COALESCE(?, name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?'),
    seeded: db.prepare('UPDATE users SET seeded = 1 WHERE id = ?'),
    identity: db.prepare('SELECT * FROM identities WHERE provider = ? AND subject = ?'),
    identityCount: db.prepare('SELECT COUNT(*) AS n FROM identities WHERE user_id = ?'),
    newIdentity: db.prepare('INSERT INTO identities VALUES (?, ?, ?, ?, ?, ?)'),
    identitiesOf: db.prepare('SELECT provider, email, created_at FROM identities WHERE user_id = ? ORDER BY created_at'),
    dropIdentity: db.prepare('DELETE FROM identities WHERE user_id = ? AND provider = ?'),
    listMaps: db.prepare(`SELECT m.id, m.title, m.updated_at, m.version, m.node_count, m.theme,
                            EXISTS(SELECT 1 FROM share_links l WHERE l.owner_id = m.owner_id AND l.map_id = m.id AND l.revoked_at IS NULL) AS shared
                          FROM maps m WHERE m.owner_id = ? AND m.deleted_at IS NULL ORDER BY m.updated_at DESC`),
    listTrash: db.prepare(`SELECT id, title, deleted_at FROM maps WHERE owner_id = ? AND deleted_at IS NOT NULL AND deleted_at > ? ORDER BY deleted_at DESC`),
    map: db.prepare('SELECT * FROM maps WHERE owner_id = ? AND id = ?'),
    insertMap: db.prepare(`INSERT INTO maps (owner_id, id, title, doc, format, version, node_count, theme, created_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`),
    updateMap: db.prepare(`UPDATE maps SET title = ?, doc = ?, format = ?, version = version + 1, node_count = ?, theme = ?, updated_at = ?
                           WHERE owner_id = ? AND id = ? AND version = ?`),
    trashMap: db.prepare('UPDATE maps SET deleted_at = ? WHERE owner_id = ? AND id = ?'),
    restoreMap: db.prepare('UPDATE maps SET deleted_at = NULL WHERE owner_id = ? AND id = ? AND deleted_at IS NOT NULL'),
    allMaps: db.prepare('SELECT id, title, doc FROM maps WHERE owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC'),
    newestRevision: db.prepare('SELECT created_at FROM map_revisions WHERE owner_id = ? AND map_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'),
    addRevision: db.prepare('INSERT INTO map_revisions (owner_id, map_id, version, doc, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    revisions: db.prepare('SELECT version, reason, created_at FROM map_revisions WHERE owner_id = ? AND map_id = ? ORDER BY created_at DESC, id DESC'),
    revision: db.prepare('SELECT doc FROM map_revisions WHERE owner_id = ? AND map_id = ? AND version = ? ORDER BY created_at DESC, id DESC LIMIT 1'),
    activeShare: db.prepare('SELECT * FROM share_links WHERE owner_id = ? AND map_id = ? AND revoked_at IS NULL'),
    revokeShare: db.prepare('UPDATE share_links SET revoked_at = ? WHERE owner_id = ? AND map_id = ? AND revoked_at IS NULL'),
    newShare: db.prepare('INSERT INTO share_links (id, owner_id, map_id, token_hash, token_enc, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    shared: db.prepare(`SELECT m.title, m.doc FROM share_links l JOIN maps m ON m.owner_id = l.owner_id AND m.id = l.map_id
                        WHERE l.token_hash = ? AND l.revoked_at IS NULL AND m.deleted_at IS NULL`),
  };

  const iso = (t = Date.now()) => new Date(t).toISOString();
  const limit = rateLimiter();
  const fail = (reply, status, code, message, extra) => reply.code(status).send({ error: { code, message }, ...extra });

  // ---------- headers and request checks ----------
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('Content-Security-Policy', CSP);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (!reply.hasHeader('Referrer-Policy')) reply.header('Referrer-Policy', 'same-origin');
    if (config.secure) reply.header('Strict-Transport-Security', 'max-age=31536000');
    return payload;
  });
  // Only answer to the host in PUBLIC_URL. This stops DNS-rebinding pages (an attacker's domain pointed at
  // 127.0.0.1) from talking to a local Sprig. The health check is exempt so Docker can reach it directly.
  const publicHost = new URL(config.publicUrl).hostname.toLowerCase();
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/healthz') return;
    let host = '';
    try { host = new URL(`http://${req.headers.host || ''}`).hostname.toLowerCase(); } catch { /* malformed */ }
    if (host !== publicHost) {
      req.log.warn({ host: req.headers.host }, 'request refused: unexpected host');
      return reply.code(421).type('text/html').send(messagePage('Wrong address', `Open Sprig at ${config.publicUrl}`));
    }
  });
  // Cross-site requests can never change anything: every non-GET must come from this site.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD') return;
    if (req.headers.origin !== config.origin) return fail(reply, 403, 'bad_origin', 'Requests must come from this site.');
  });

  // ---------- sessions ----------
  const cookieOpts = { path: '/', httpOnly: true, secure: config.secure, sameSite: 'lax' };
  function currentUser(req, reply) {
    const token = req.cookies[config.cookie.session];
    if (!token) return null;
    const hash = sha256(token), s = q.session.get(hash);
    if (!s) return null;
    const now = Date.now();
    if (Date.parse(s.expires_at) <= now) { q.dropSession.run(hash); return null; }
    // The allowlist is checked on every request, so removing an address locks that person out.
    if (!config.allowed.has(s.email)) { q.dropUserSessions.run(s.user_id); return null; }
    if (now - Date.parse(s.last_seen_at) > HOUR) {
      q.touchSession.run(iso(now), iso(now + SESSION_TTL), hash);
      reply.setCookie(config.cookie.session, token, { ...cookieOpts, maxAge: SESSION_TTL / 1000 });
    }
    return { id: s.user_id, email: s.email, name: s.name, role: s.role, seeded: !!s.seeded, tokenHash: hash };
  }
  function startSession(req, reply, userId) {
    const token = randomToken(32), now = Date.now();
    q.newSession.run(sha256(token), userId, iso(now), iso(now), iso(now + SESSION_TTL), String(req.headers['user-agent'] || '').slice(0, 300), req.ip);
    reply.setCookie(config.cookie.session, token, { ...cookieOpts, maxAge: SESSION_TTL / 1000 });
  }
  // Return-to paths: resolve them the way a browser would and keep only same-origin results.
  const safeNext = n => {
    if (typeof n !== 'string' || !n.startsWith('/') || /[\x00-\x1f\x7f\\]/.test(n)) return '/';
    try {
      const u = new URL(n, config.publicUrl);
      return u.origin === config.origin ? u.pathname + u.search + u.hash : '/';
    } catch { return '/'; }
  };

  const refuse = (req, reply, provider, email) => {
    req.log.warn({ provider, email }, 'sign-in refused');
    reply.setCookie(config.cookie.refused, sign({ email }, config.sessionSecret, MIN), { ...cookieOpts, maxAge: 60 });
    return reply.redirect('/denied');
  };
  const htmlPage = (reply, code, title, text) => reply.type('text/html').code(code).header('Cache-Control', 'no-store').send(messagePage(title, text));

  // An account is found by its provider identity first. A new identity can open an account only with a
  // confirmed email on the allowlist, and is never attached by email to an account that already has one:
  // extra providers are connected from the account menu while signed in (see linkIdentity).
  function signIn(req, reply, { provider, subject, email, emailVerified, name, picture, next }) {
    email = String(email || '').trim().toLowerCase();
    const label = PROVIDER_NAMES[provider] || provider;
    let user = null, ident = null;
    if (provider !== 'dev') {
      ident = q.identity.get(provider, subject);
      if (ident) user = q.userById.get(ident.user_id);
    }
    if (!user) {
      if (provider === 'facebook') {
        req.log.warn({ provider }, 'sign-in refused: Facebook is not connected to an account');
        return htmlPage(reply, 403, 'Connect Facebook first', 'Facebook can be used to sign in only after you connect it. Sign in another way, then open the account menu and choose Connect next to Facebook.');
      }
      if (!email || !emailVerified) {
        req.log.warn({ provider }, 'sign-in refused: no confirmed email');
        return htmlPage(reply, 403, 'No confirmed email', `${label} did not share a confirmed email address for this account, so Sprig cannot check it against its list of allowed people.`);
      }
      if (!config.allowed.has(email)) return refuse(req, reply, provider, email);
      user = q.userByEmail.get(email) || null;
      if (user && provider !== 'dev' && q.identityCount.get(user.id).n > 0) {
        req.log.warn({ provider, email }, 'sign-in refused: account uses another sign-in method');
        return htmlPage(reply, 403, `Connect ${label} first`, `${email} already has a Sprig account that signs in another way. Sign in with that, then open the account menu and choose Connect ${label}.`);
      }
    }
    if (user && user.disabled_at) return refuse(req, reply, provider, user.email);
    if (user && !config.allowed.has(user.email)) return refuse(req, reply, provider, user.email);
    const now = iso();
    tx(db, () => {
      if (!user) {
        user = { id: crypto.randomUUID(), email };
        q.newUser.run(user.id, email, name || null, picture || null, email === config.owner ? 'owner' : 'user', now);
      }
      if (provider !== 'dev' && !ident) q.newIdentity.run(crypto.randomUUID(), user.id, provider, subject, email || null, now);
      q.loginUser.run(now, name || null, picture || null, user.id);
    });
    req.log.info({ provider, email: user.email }, 'signed in');
    startSession(req, reply, user.id);
    return reply.redirect(safeNext(next));
  }

  // Attaches another provider to the signed-in account. The provider's email does not need to match.
  function linkIdentity(req, reply, userId, { provider, subject, email }) {
    const label = PROVIDER_NAMES[provider];
    const me = currentUser(req, reply);
    if (!me || me.id !== userId) return reply.redirect('/login');
    const ident = q.identity.get(provider, subject);
    if (ident && ident.user_id !== userId) {
      req.log.warn({ provider }, 'link refused: identity belongs to another account');
      return htmlPage(reply, 409, `${label} account already in use`, `That ${label} account is already connected to a different Sprig account.`);
    }
    if (!ident) {
      if (q.identitiesOf.all(userId).some(i => i.provider === provider)) q.dropIdentity.run(userId, provider); // replace an older one
      q.newIdentity.run(crypto.randomUUID(), userId, provider, subject, email ? String(email).toLowerCase() : null, iso());
    }
    req.log.info({ provider, user: me.email }, 'sign-in method connected');
    return reply.redirect('/?connected=' + provider);
  }

  function authLimited(req, reply) {
    const wait = limit('auth:' + req.ip, 10);
    if (wait) { reply.header('Retry-After', wait); reply.code(429).type('text/html').send(messagePage('Too many attempts', 'Wait a minute, then try signing in again.')); return true; }
    return false;
  }

  // ---------- pages ----------
  app.get('/', async (req, reply) => {
    if (!currentUser(req, reply)) return reply.redirect('/login');
    return reply.type('text/html').header('Cache-Control', 'no-cache').send(pageFor('server'));
  });
  app.get('/login', async (req, reply) => {
    if (currentUser(req, reply)) return reply.redirect('/');
    return reply.type('text/html').header('Cache-Control', 'no-store')
      .send(loginPage({ providers: Object.keys(providers), devLogin: config.devLogin, owner: config.owner, error: req.query.error }));
  });
  app.get('/denied', async (req, reply) => {
    const r = verify(req.cookies[config.cookie.refused], config.sessionSecret);
    reply.clearCookie(config.cookie.refused, { path: '/' });
    return reply.type('text/html').code(403).header('Cache-Control', 'no-store').send(deniedPage(r && r.email));
  });
  for (const [route, body] of Object.entries(scripts)) {
    app.get(route, async (req, reply) => reply.type('text/javascript; charset=utf-8').header('Cache-Control', 'no-cache').send(body));
  }
  app.get('/favicon.ico', async (req, reply) => reply.code(204).header('Cache-Control', 'max-age=86400').send());
  app.get('/healthz', async (req, reply) => {
    try { db.prepare('SELECT 1').get(); return { ok: true }; }
    catch { return reply.code(503).send({ ok: false }); }
  });

  // ---------- sign-in ----------
  // Starts a provider sign-in. The state, nonce, PKCE verifier and intent ride in a short-lived signed cookie.
  function startAuth(reply, provider, extra) {
    const state = randomToken(24), nonce = randomToken(24), verifier = randomToken(48);
    reply.setCookie(config.cookie.oauth, sign({ provider, state, nonce, verifier, ...extra }, config.sessionSecret, 10 * MIN), { ...cookieOpts, maxAge: 600 });
    return providers[provider].authUrl({ state, nonce, challenge: pkceChallenge(verifier) });
  }
  app.get('/auth/:provider', async (req, reply) => {
    const { provider } = req.params;
    if (!Object.hasOwn(providers, provider)) return reply.code(404).send();
    if (authLimited(req, reply)) return;
    return reply.redirect(startAuth(reply, provider, { next: safeNext(req.query.next) }));
  });
  app.get('/auth/:provider/callback', async (req, reply) => {
    const { provider } = req.params;
    if (!Object.hasOwn(providers, provider)) return reply.code(404).send();
    const saved = verify(req.cookies[config.cookie.oauth], config.sessionSecret);
    reply.clearCookie(config.cookie.oauth, { path: '/' }); // single use, whatever happens next
    const back = saved && saved.link ? '/?connected=failed' : '/login?error=';
    if (req.query.error) return reply.redirect(saved && saved.link ? '/' : back + 'cancelled');
    if (!saved || saved.provider !== provider || !req.query.state || req.query.state !== saved.state || !req.query.code) {
      req.log.warn({ provider }, 'sign-in failed: state did not match');
      return reply.redirect(saved && saved.link ? back : back + 'failed');
    }
    let profile;
    try { profile = await providers[provider].exchange(String(req.query.code), saved); }
    catch (e) { req.log.warn({ provider, err: e.message }, 'sign-in failed: token exchange'); return reply.redirect(saved.link ? back : back + 'failed'); }
    if (saved.link) return linkIdentity(req, reply, saved.link, { provider, ...profile });
    return signIn(req, reply, { provider, ...profile, next: saved.next });
  });
  if (config.devLogin) {
    // Local testing only: config refuses DEV_LOGIN unless PUBLIC_URL is localhost.
    app.get('/auth/dev', async (req, reply) => {
      if (authLimited(req, reply)) return;
      const email = req.query.email || config.owner;
      return signIn(req, reply, { provider: 'dev', subject: email, email, emailVerified: true, name: null, picture: null, next: req.query.next });
    });
  }
  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[config.cookie.session];
    if (token) q.dropSession.run(sha256(token));
    reply.clearCookie(config.cookie.session, { path: '/' });
    return reply.code(204).send();
  });

  // ---------- share pages (no sign-in) ----------
  const sharedMap = token => (typeof token === 'string' && token.length >= 16 && token.length <= 64) ? q.shared.get(sha256(token)) : null;
  function shareLimited(req, reply) {
    const wait = limit('share:' + req.ip, 300);
    if (wait) { reply.header('Retry-After', wait); fail(reply, 429, 'rate_limited', 'Too many requests. Try again shortly.'); return true; }
    return false;
  }
  app.get('/s/:token', async (req, reply) => {
    if (shareLimited(req, reply)) return;
    reply.header('X-Robots-Tag', 'noindex, nofollow').header('Referrer-Policy', 'no-referrer').header('Cache-Control', 'no-store');
    if (!sharedMap(req.params.token)) return reply.code(404).type('text/html').send(messagePage('This link is no longer active', 'The person who shared this map has turned the link off, or the map was deleted.'));
    return reply.type('text/html').send(pageFor('viewer'));
  });
  app.get('/api/shared/:token', async (req, reply) => {
    if (shareLimited(req, reply)) return;
    reply.header('X-Robots-Tag', 'noindex, nofollow').header('Referrer-Policy', 'no-referrer').header('Cache-Control', 'no-store');
    const m = sharedMap(req.params.token);
    if (!m) return fail(reply, 404, 'not_found', 'This link is no longer active.');
    return { title: m.title, doc: JSON.parse(m.doc) };
  });

  // ---------- the signed-in API ----------
  await app.register(async api => {
    api.addHook('preHandler', async (req, reply) => {
      const user = currentUser(req, reply);
      if (!user) return fail(reply, 401, 'signed_out', 'Please sign in again.');
      req.user = user;
      if (req.method !== 'GET') {
        const wait = limit('write:' + user.id, 120);
        if (wait) { reply.header('Retry-After', wait); return fail(reply, 429, 'rate_limited', 'Too many changes at once. Saving will retry shortly.'); }
      }
    });

    api.get('/api/me', async req => {
      const { id, email, name, role, seeded } = req.user;
      return { id, email, name, role, seeded, identities: q.identitiesOf.all(id), providers: Object.keys(providers).map(p => ({ id: p, name: PROVIDER_NAMES[p] })) };
    });
    // Connect another sign-in method: returns the provider URL to navigate to (POST, so another site cannot start it).
    api.post('/api/me/identities/:provider', async (req, reply) => {
      const { provider } = req.params;
      if (!Object.hasOwn(providers, provider)) return fail(reply, 404, 'not_found', 'That sign-in method is not set up on this server.');
      return { url: startAuth(reply, provider, { link: req.user.id }) };
    });
    api.delete('/api/me/identities/:provider', async (req, reply) => {
      const mine = q.identitiesOf.all(req.user.id);
      if (!mine.some(i => i.provider === req.params.provider)) return fail(reply, 404, 'not_found', 'That sign-in method is not connected.');
      if (mine.length < 2 && !config.devLogin) return fail(reply, 409, 'last_method', 'Connect another sign-in method before removing this one.');
      q.dropIdentity.run(req.user.id, req.params.provider);
      req.log.info({ provider: req.params.provider, user: req.user.email }, 'sign-in method removed');
      return reply.code(204).send();
    });
    api.post('/api/me/seeded', async (req, reply) => { q.seeded.run(req.user.id); return reply.code(204).send(); });

    api.get('/api/maps', async req => {
      if (req.query.trash) return { maps: q.listTrash.all(req.user.id, iso(Date.now() - 30 * DAY)) };
      return { maps: q.listMaps.all(req.user.id).map(m => ({ ...m, shared: !!m.shared })) };
    });

    const findMap = (req, reply, { deleted = false } = {}) => {
      const id = req.params.id;
      const m = S.SAFE_ID.test(id) ? q.map.get(req.user.id, id) : null;
      if (!m || (!deleted && m.deleted_at)) { fail(reply, 404, 'not_found', 'That map does not exist.'); return null; }
      return m;
    };

    api.get('/api/maps/:id', async (req, reply) => {
      const m = findMap(req, reply); if (!m) return;
      reply.header('ETag', `"${m.version}"`);
      return { doc: JSON.parse(m.doc), version: m.version };
    });

    api.put('/api/maps/:id', { bodyLimit: MAP_BODY_LIMIT }, async (req, reply) => {
      const id = req.params.id, user = req.user;
      if (!S.SAFE_ID.test(id)) return fail(reply, 404, 'not_found', 'That map does not exist.');
      const ifMatch = req.headers['if-match'], create = req.headers['if-none-match'] === '*';
      if (ifMatch == null && !create) return fail(reply, 428, 'precondition_required', 'Send If-Match with the version you edited, or If-None-Match: * to create.');
      const problem = S.validate(req.body);
      if (problem) return fail(reply, 422, 'invalid_map', problem);
      if (req.body.id !== id) return fail(reply, 422, 'invalid_map', 'The map id in the body does not match the address.');
      const clean = S.sanitizeDoc(req.body, { makeId: newId });
      const clientFormat = Number(req.headers['x-sprig-format'] || 0);
      const now = iso(), row = q.map.get(user.id, id);
      const fields = [clean.title, JSON.stringify(clean)];

      if (create) {
        if (row) return fail(reply, 412, 'exists', 'A map with this id already exists.');
        q.insertMap.run(user.id, id, ...fields, clean.format, S.countNodes(clean), clean.theme, now, now);
        return reply.code(201).send({ version: 1 });
      }
      const base = parseInt(String(ifMatch).replace(/"/g, ''), 10);
      if (!row || row.deleted_at) {
        if (row) q.addRevision.run(user.id, id, row.version, fields[1], 'conflict-local', now);
        return fail(reply, 409, 'conflict', 'This map was deleted elsewhere.', { deleted: true });
      }
      if (clientFormat < row.format) return fail(reply, 426, 'client_outdated', 'Sprig was updated. Reload the page to keep saving.');
      if (row.version !== base) {
        q.addRevision.run(user.id, id, base, fields[1], 'conflict-local', now); // keep the losing side
        return fail(reply, 409, 'conflict', 'This map changed elsewhere.', { doc: JSON.parse(row.doc), version: row.version });
      }
      const ok = tx(db, () => {
        const newest = q.newestRevision.get(user.id, id);
        if (req.headers['x-sprig-reason'] === 'conflict-overwrite') q.addRevision.run(user.id, id, row.version, row.doc, 'conflict-server', now);
        else if (!newest || Date.now() - Date.parse(newest.created_at) >= 10 * MIN) q.addRevision.run(user.id, id, row.version, row.doc, 'autosave', now);
        return q.updateMap.run(...fields, Math.max(row.format, clean.format), S.countNodes(clean), clean.theme, now, user.id, id, base).changes;
      });
      if (!ok) return fail(reply, 409, 'conflict', 'This map changed elsewhere.', { doc: JSON.parse(q.map.get(user.id, id).doc), version: q.map.get(user.id, id).version });
      return { version: base + 1 };
    });

    api.delete('/api/maps/:id', async (req, reply) => {
      const m = findMap(req, reply, { deleted: true }); if (!m) return;
      if (m.deleted_at) return reply.code(204).send();
      const ifMatch = req.headers['if-match'];
      if (ifMatch == null) return fail(reply, 428, 'precondition_required', 'Send If-Match with the version you are deleting.');
      if (parseInt(String(ifMatch).replace(/"/g, ''), 10) !== m.version) return fail(reply, 409, 'conflict', 'This map changed elsewhere.', { version: m.version });
      const now = iso();
      tx(db, () => { q.trashMap.run(now, req.user.id, m.id); q.revokeShare.run(now, req.user.id, m.id); });
      return reply.code(204).send();
    });

    api.post('/api/maps/:id/restore', async (req, reply) => {
      const m = findMap(req, reply, { deleted: true }); if (!m) return;
      q.restoreMap.run(req.user.id, m.id); // a restored map does not get its old share link back
      return { version: m.version };
    });

    api.get('/api/maps/:id/revisions', async (req, reply) => {
      const m = findMap(req, reply, { deleted: true }); if (!m) return;
      return { revisions: q.revisions.all(req.user.id, m.id) };
    });
    api.get('/api/maps/:id/revisions/:rev', async (req, reply) => {
      const m = findMap(req, reply, { deleted: true }); if (!m) return;
      const r = q.revision.get(req.user.id, m.id, Number(req.params.rev));
      if (!r) return fail(reply, 404, 'not_found', 'That revision does not exist.');
      return { doc: JSON.parse(r.doc) };
    });
    api.post('/api/maps/:id/revisions/:rev/restore', async (req, reply) => {
      const m = findMap(req, reply); if (!m) return;
      const r = q.revision.get(req.user.id, m.id, Number(req.params.rev));
      if (!r) return fail(reply, 404, 'not_found', 'That revision does not exist.');
      const old = JSON.parse(r.doc), now = iso();
      tx(db, () => {
        q.addRevision.run(req.user.id, m.id, m.version, m.doc, 'before-restore', now);
        q.updateMap.run(old.title || '', r.doc, Math.max(m.format, old.format || 1), S.countNodes(old), old.theme, now, req.user.id, m.id, m.version);
      });
      return { doc: old, version: m.version + 1 };
    });

    api.get('/api/export', async (req, reply) => {
      const files = {}, used = new Set();
      for (const m of q.allMaps.all(req.user.id)) {
        const base = (m.title || 'Untitled map').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '').trim().slice(0, 80) || 'Untitled map';
        let name = `${base}.sprig.json`;
        if (used.has(name)) name = `${base} (${m.id}).sprig.json`;
        used.add(name);
        files[name] = strToU8(JSON.stringify(JSON.parse(m.doc), null, 2));
      }
      const day = new Date().toISOString().slice(0, 10);
      return reply.type('application/zip').header('Content-Disposition', `attachment; filename="sprig-maps-${day}.zip"`)
        .header('Cache-Control', 'no-store').send(Buffer.from(zipSync(files)));
    });

    // ---------- share links ----------
    const linkFor = l => ({ url: `${config.publicUrl}/s/${decrypt(l.token_enc, config.shareKey)}`, created_at: l.created_at });
    api.get('/api/maps/:id/share', async (req, reply) => {
      const m = findMap(req, reply); if (!m) return;
      const l = q.activeShare.get(req.user.id, m.id);
      return l ? linkFor(l) : { url: null };
    });
    api.post('/api/maps/:id/share', async (req, reply) => {
      const m = findMap(req, reply); if (!m) return;
      const token = randomToken(16), now = iso();
      tx(db, () => {
        q.revokeShare.run(now, req.user.id, m.id);
        q.newShare.run(crypto.randomUUID(), req.user.id, m.id, sha256(token), encrypt(token, config.shareKey), now);
      });
      req.log.info({ map: m.id }, 'share link created');
      return reply.code(201).send(linkFor(q.activeShare.get(req.user.id, m.id)));
    });
    api.delete('/api/maps/:id/share', async (req, reply) => {
      const m = findMap(req, reply); if (!m) return;
      q.revokeShare.run(iso(), req.user.id, m.id);
      req.log.info({ map: m.id }, 'share link turned off');
      return reply.code(204).send();
    });
  });

  // ---------- errors ----------
  app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/')
    ? fail(reply, 404, 'not_found', 'Not found.')
    : reply.code(404).type('text/html').send(messagePage('Page not found', 'There is nothing at this address.')));
  app.setErrorHandler((err, req, reply) => {
    if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return fail(reply, 413, 'too_large', 'This map is larger than 5 MB.');
    if (err.statusCode && err.statusCode < 500) return fail(reply, err.statusCode, 'bad_request', err.message);
    req.log.error(err);
    return fail(reply, 500, 'server_error', 'Something went wrong on the server.');
  });

  return app;
}

// Daily housekeeping: expired sessions, Trash older than 30 days, and revisions outside the keep rules.
export function housekeeping(db, now = Date.now()) {
  const iso = t => new Date(t).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(iso(now));
  db.prepare('DELETE FROM maps WHERE deleted_at IS NOT NULL AND deleted_at <= ?').run(iso(now - 30 * DAY));
  const del = db.prepare('DELETE FROM map_revisions WHERE id = ?');
  const list = db.prepare('SELECT id, created_at FROM map_revisions WHERE owner_id = ? AND map_id = ? ORDER BY created_at DESC, id DESC');
  for (const m of db.prepare('SELECT DISTINCT owner_id, map_id FROM map_revisions').all()) {
    const seen = new Set(); let kept = 0;
    for (const r of list.all(m.owner_id, m.map_id)) {
      const t = Date.parse(r.created_at), age = now - t;
      let keep = age <= DAY, bucket = null;
      if (!keep && age <= 7 * DAY) bucket = 'h' + Math.floor(t / HOUR);
      else if (!keep && age <= 90 * DAY) bucket = 'd' + Math.floor(t / DAY);
      if (bucket) { keep = !seen.has(bucket); seen.add(bucket); }
      if (keep && kept < 200) kept++; else del.run(r.id);
    }
  }
}

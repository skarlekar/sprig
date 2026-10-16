// API tests: run with `npm test`. Each test gets a fresh in-memory database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { buildApp, housekeeping } from '../src/app.js';

const ORIGIN = 'http://localhost:8080';
const OWNER = 'owner@example.com';

async function setup(extra = {}) {
  const config = loadConfig({
    PUBLIC_URL: ORIGIN, ALLOWED_EMAILS: OWNER, OWNER_EMAIL: OWNER, DEV_LOGIN: '1',
    SESSION_SECRET: 'x'.repeat(40), SHARE_KEY: 'ab'.repeat(32), DB_FILE: ':memory:', LOG_LEVEL: 'silent', ...extra,
  });
  const db = openDb(config);
  const app = await buildApp(config, { db });
  return { app, db, config };
}
const cookieOf = res => [].concat(res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
async function signIn(app, email) {
  const res = await app.inject({ method: 'GET', url: '/auth/dev' + (email ? '?email=' + encodeURIComponent(email) : '') });
  return { res, cookie: cookieOf(res) };
}
function client(app, cookie) {
  return (method, url, body, headers = {}) => app.inject({
    method, url, headers: { cookie, origin: ORIGIN, 'x-sprig-format': '1', ...headers },
    ...(body !== undefined ? { payload: body } : {}),
  });
}
const mapDoc = (id, title = 'Plan', extra = {}) => ({ id, title, theme: 'meadow', layout: 'map', branch: 'curve', roots: [{ id: 'r1', text: title, children: [{ id: 'c1', text: 'Child', children: [] }], x: 0, y: 0 }], connections: [], ...extra });

test('config refuses unsafe settings', () => {
  assert.throws(() => loadConfig({ PUBLIC_URL: 'https://sprig.example.com', ALLOWED_EMAILS: OWNER, DEV_LOGIN: '1', SESSION_SECRET: 'x'.repeat(40), SHARE_KEY: 'ab'.repeat(32) }), /DEV_LOGIN/);
  assert.throws(() => loadConfig({ ALLOWED_EMAILS: OWNER, DEV_LOGIN: '1', SESSION_SECRET: 'short', SHARE_KEY: 'ab'.repeat(32) }), /SESSION_SECRET/);
  assert.throws(() => loadConfig({ ALLOWED_EMAILS: '', DEV_LOGIN: '1', SESSION_SECRET: 'x'.repeat(40), SHARE_KEY: 'ab'.repeat(32) }), /ALLOWED_EMAILS/);
});

test('signed out: pages redirect and the API refuses', async () => {
  const { app } = await setup();
  const home = await app.inject('/');
  assert.equal(home.statusCode, 302); assert.equal(home.headers.location, '/login');
  assert.equal((await app.inject('/api/maps')).statusCode, 401);
  assert.equal((await app.inject('/api/maps/abc')).statusCode, 401);
  const login = await app.inject('/login');
  assert.equal(login.statusCode, 200); assert.match(login.body, /local test/);
  assert.match(login.headers['content-security-policy'], /script-src 'self'/);
  assert.equal((await app.inject('/healthz')).json().ok, true);
});

test('allowlist: owner signs in, anyone else is refused with no rows created', async () => {
  const { app, db } = await setup();
  const bad = await signIn(app, 'stranger@example.com');
  assert.equal(bad.res.headers.location, '/denied');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
  const denied = await app.inject({ url: '/denied', headers: { cookie: bad.cookie } });
  assert.equal(denied.statusCode, 403); assert.match(denied.body, /stranger@example\.com/);

  const ok = await signIn(app);
  assert.equal(ok.res.headers.location, '/');
  const me = await client(app, ok.cookie)('GET', '/api/me');
  assert.equal(me.json().email, OWNER); assert.equal(me.json().role, 'owner');
  const page = await app.inject({ url: '/', headers: { cookie: ok.cookie } });
  assert.match(page.body, /<meta name="sprig-mode" content="server">/);
});

test('return-to paths cannot leave the site', async () => {
  const { app } = await setup();
  for (const next of ['//evil.example', 'https://evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', '/%09/evil.example', '/\x00/x']) {
    const r = await app.inject('/auth/dev?next=' + encodeURIComponent(next));
    const loc = r.headers.location;
    assert.ok(loc.startsWith('/') && !loc.startsWith('//') && !loc.includes('\\'), `${JSON.stringify(next)} -> ${loc}`);
    assert.equal(new URL(loc, ORIGIN).origin, ORIGIN, `${JSON.stringify(next)} stays on Sprig`);
  }
});

test('requests for any other host are refused (DNS rebinding), except the health check', async () => {
  const { app } = await setup();
  const evil = await app.inject({ url: '/auth/dev', headers: { host: 'rebind.attacker.example:8080' } });
  assert.equal(evil.statusCode, 421);
  assert.equal(evil.headers['set-cookie'], undefined, 'no session for a foreign host');
  assert.equal((await app.inject({ url: '/api/maps', headers: { host: '127.0.0.1:8080' } })).statusCode, 421);
  assert.equal((await app.inject({ url: '/healthz', headers: { host: '127.0.0.1:3000' } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/login', headers: { host: 'localhost:8080' } })).statusCode, 200);
});

test('a same-site return-to path survives sign-in', async () => {
  const { app } = await setup();
  const r = await app.inject('/auth/dev?next=' + encodeURIComponent('/?map=abc#top'));
  assert.equal(r.headers.location, '/?map=abc#top');
});

test('removing an address from the allowlist ends its sessions', async () => {
  const { app, db, config } = await setup();
  const { cookie } = await signIn(app);
  config.allowed.delete(OWNER); // what a restart with a new ALLOWED_EMAILS does
  assert.equal((await client(app, cookie)('GET', '/api/me')).statusCode, 401);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
});

test('logout ends the session', async () => {
  const { app } = await setup();
  const { cookie } = await signIn(app);
  const c = client(app, cookie);
  assert.equal((await c('POST', '/auth/logout')).statusCode, 204);
  assert.equal((await c('GET', '/api/me')).statusCode, 401);
});

test('writes from another site are refused', async () => {
  const { app } = await setup();
  const { cookie } = await signIn(app);
  const r = await app.inject({ method: 'PUT', url: '/api/maps/abc', headers: { cookie, origin: 'https://evil.example', 'if-none-match': '*' }, payload: mapDoc('abc') });
  assert.equal(r.statusCode, 403);
  const r2 = await app.inject({ method: 'PUT', url: '/api/maps/abc', headers: { cookie, 'if-none-match': '*' }, payload: mapDoc('abc') });
  assert.equal(r2.statusCode, 403);
});

test('maps: create, read, update, conflict and preconditions', async () => {
  const { app, db } = await setup();
  const c = client(app, (await signIn(app)).cookie);
  assert.equal((await c('PUT', '/api/maps/abc', mapDoc('abc'))).statusCode, 428);
  const made = await c('PUT', '/api/maps/abc', mapDoc('abc'), { 'if-none-match': '*' });
  assert.equal(made.statusCode, 201); assert.equal(made.json().version, 1);
  assert.equal((await c('PUT', '/api/maps/abc', mapDoc('abc'), { 'if-none-match': '*' })).statusCode, 412);

  const got = await c('GET', '/api/maps/abc');
  assert.equal(got.json().version, 1); assert.equal(got.json().doc.roots[0].children[0].text, 'Child');

  const up = await c('PUT', '/api/maps/abc', mapDoc('abc', 'Plan v2'), { 'if-match': '1' });
  assert.equal(up.statusCode, 200); assert.equal(up.json().version, 2);

  const stale = await c('PUT', '/api/maps/abc', mapDoc('abc', 'Stale edit'), { 'if-match': '1' });
  assert.equal(stale.statusCode, 409); assert.equal(stale.json().version, 2); assert.equal(stale.json().doc.title, 'Plan v2');
  const reasons = db.prepare('SELECT reason FROM map_revisions ORDER BY id').all().map(r => r.reason);
  assert.deepEqual(reasons, ['autosave', 'conflict-local']); // both sides are kept

  const over = await c('PUT', '/api/maps/abc', mapDoc('abc', 'Mine wins'), { 'if-match': '2', 'x-sprig-reason': 'conflict-overwrite' });
  assert.equal(over.json().version, 3);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM map_revisions WHERE reason = 'conflict-server'").get().n, 1);

  const list = (await c('GET', '/api/maps')).json().maps;
  assert.equal(list.length, 1); assert.equal(list[0].title, 'Mine wins'); assert.equal(list[0].node_count, 2);
});

test('maps: validation, size limits and format checks', async () => {
  const { app } = await setup();
  const c = client(app, (await signIn(app)).cookie);
  assert.equal((await c('PUT', '/api/maps/abc', mapDoc('other'), { 'if-none-match': '*' })).statusCode, 422);
  assert.equal((await c('PUT', '/api/maps/abc', { id: 'abc', roots: 'nope' }, { 'if-none-match': '*' })).statusCode, 422);
  assert.equal((await c('PUT', '/api/maps/bad-id!', mapDoc('bad-id!'), { 'if-none-match': '*' })).statusCode, 404);

  let deep = { id: 'n0', text: 'x', children: [] }, cur = deep;
  for (let i = 1; i < 100; i++) { const n = { id: 'n' + i, text: 'x', children: [] }; cur.children.push(n); cur = n; }
  const nested = await c('PUT', '/api/maps/deep', { id: 'deep', roots: [deep] }, { 'if-none-match': '*' });
  assert.equal(nested.statusCode, 422); assert.match(nested.json().error.message, /nested deeper/);

  const big = mapDoc('big', 'Big'); big.roots[0].note = 'x'.repeat(6 * 1024 * 1024);
  assert.equal((await c('PUT', '/api/maps/big', big, { 'if-none-match': '*' })).statusCode, 413);

  await c('PUT', '/api/maps/fmt', { ...mapDoc('fmt') }, { 'if-none-match': '*' });
  const old = await c('PUT', '/api/maps/fmt', mapDoc('fmt'), { 'if-match': '1', 'x-sprig-format': '0' });
  assert.equal(old.statusCode, 426);
});

test('maps are private to their owner', async () => {
  const { app } = await setup({ ALLOWED_EMAILS: `${OWNER},friend@example.com` });
  const a = client(app, (await signIn(app)).cookie);
  const b = client(app, (await signIn(app, 'friend@example.com')).cookie);
  await a('PUT', '/api/maps/abc', mapDoc('abc'), { 'if-none-match': '*' });
  assert.equal((await b('GET', '/api/maps/abc')).statusCode, 404);
  assert.equal((await b('GET', '/api/maps')).json().maps.length, 0);
  // The same id is free for another user: ids are unique per owner only, and never compared across owners.
  assert.equal((await b('PUT', '/api/maps/abc', mapDoc('abc'), { 'if-none-match': '*' })).statusCode, 201);
});

test('delete goes to Trash, restore brings it back, housekeeping purges after 30 days', async () => {
  const { app, db } = await setup();
  const c = client(app, (await signIn(app)).cookie);
  await c('PUT', '/api/maps/abc', mapDoc('abc'), { 'if-none-match': '*' });
  assert.equal((await c('DELETE', '/api/maps/abc')).statusCode, 428);
  assert.equal((await c('DELETE', '/api/maps/abc', undefined, { 'if-match': '7' })).statusCode, 409);
  assert.equal((await c('DELETE', '/api/maps/abc', undefined, { 'if-match': '1' })).statusCode, 204);
  assert.equal((await c('GET', '/api/maps')).json().maps.length, 0);
  assert.equal((await c('GET', '/api/maps?trash=1')).json().maps.length, 1);
  assert.equal((await c('POST', '/api/maps/abc/restore')).statusCode, 200);
  assert.equal((await c('GET', '/api/maps')).json().maps.length, 1);

  await c('DELETE', '/api/maps/abc', undefined, { 'if-match': '1' });
  housekeeping(db, Date.now() + 31 * 86_400_000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM maps').get().n, 0);
});

test('share links: create, view without sign-in, reset, stop, and trash', async () => {
  const { app, db } = await setup();
  const c = client(app, (await signIn(app)).cookie);
  await c('PUT', '/api/maps/abc', mapDoc('abc', 'Shared plan'), { 'if-none-match': '*' });
  assert.equal((await c('GET', '/api/maps/abc/share')).json().url, null);

  const on = await c('POST', '/api/maps/abc/share');
  assert.equal(on.statusCode, 201);
  const url = on.json().url, token = url.split('/s/')[1];
  assert.match(url, /^http:\/\/localhost:8080\/s\/[A-Za-z0-9_-]{22}$/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM share_links WHERE token_enc LIKE ?').get('%' + token + '%').n, 0, 'token is not stored in plain text');
  assert.equal((await c('GET', '/api/maps/abc/share')).json().url, url, 'the dialog can show the link again');
  assert.equal((await c('GET', '/api/maps')).json().maps[0].shared, true);

  const page = await app.inject('/s/' + token);
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /content="viewer"/);
  assert.match(page.body, /<script src="\/app\.js"><\/script>/, 'scripts load from the root, not from /s/');
  assert.equal(page.headers['x-robots-tag'], 'noindex, nofollow');
  assert.equal(page.headers['referrer-policy'], 'no-referrer');
  const data = await app.inject('/api/shared/' + token);
  assert.equal(data.json().title, 'Shared plan'); assert.equal(data.json().doc.roots[0].text, 'Shared plan');
  assert.equal(data.json().owner, undefined);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/maps/abc', headers: { origin: ORIGIN, 'if-match': '1' }, payload: mapDoc('abc') })).statusCode, 401);

  const reset = await c('POST', '/api/maps/abc/share');
  assert.notEqual(reset.json().url, url);
  assert.equal((await app.inject('/s/' + token)).statusCode, 404, 'old link is dead after reset');
  const token2 = reset.json().url.split('/s/')[1];

  assert.equal((await c('DELETE', '/api/maps/abc/share')).statusCode, 204);
  assert.equal((await app.inject('/api/shared/' + token2)).statusCode, 404);

  const token3 = (await c('POST', '/api/maps/abc/share')).json().url.split('/s/')[1];
  await c('DELETE', '/api/maps/abc', undefined, { 'if-match': '1' });
  assert.equal((await app.inject('/s/' + token3)).statusCode, 404, 'trash kills the link');
  await c('POST', '/api/maps/abc/restore');
  assert.equal((await app.inject('/s/' + token3)).statusCode, 404, 'restore does not revive the link');
  assert.equal((await app.inject('/s/made-up-token-that-is-long')).statusCode, 404);
});

test('revisions: list, read and restore', async () => {
  const { app } = await setup();
  const c = client(app, (await signIn(app)).cookie);
  await c('PUT', '/api/maps/abc', mapDoc('abc', 'First'), { 'if-none-match': '*' });
  await c('PUT', '/api/maps/abc', mapDoc('abc', 'Second'), { 'if-match': '1' });
  const revs = (await c('GET', '/api/maps/abc/revisions')).json().revisions;
  assert.equal(revs.length, 1); assert.equal(revs[0].version, 1);
  assert.equal((await c('GET', '/api/maps/abc/revisions/1')).json().doc.title, 'First');
  const back = await c('POST', '/api/maps/abc/revisions/1/restore');
  assert.equal(back.json().version, 3); assert.equal((await c('GET', '/api/maps/abc')).json().doc.title, 'First');
  assert.ok((await c('GET', '/api/maps/abc/revisions')).json().revisions.some(r => r.reason === 'before-restore'));
});

test('export downloads a zip of every map', async () => {
  const { app } = await setup();
  const c = client(app, (await signIn(app)).cookie);
  await c('PUT', '/api/maps/abc', mapDoc('abc', 'One'), { 'if-none-match': '*' });
  await c('PUT', '/api/maps/def', mapDoc('def', 'Two'), { 'if-none-match': '*' });
  const r = await c('GET', '/api/export');
  assert.equal(r.headers['content-type'], 'application/zip');
  assert.equal(r.rawPayload.subarray(0, 2).toString(), 'PK');
});

test('rate limits answer 429 with Retry-After', async () => {
  const { app } = await setup();
  let last;
  for (let i = 0; i < 11; i++) last = await app.inject('/auth/dev?email=nobody@example.com');
  assert.equal(last.statusCode, 429); assert.ok(Number(last.headers['retry-after']) > 0);
});

test('revision housekeeping keeps hourly, then daily snapshots', async () => {
  const { app, db } = await setup();
  const c = client(app, (await signIn(app)).cookie);
  await c('PUT', '/api/maps/abc', mapDoc('abc'), { 'if-none-match': '*' });
  const owner = db.prepare('SELECT id FROM users').get().id, now = Date.now();
  const add = db.prepare("INSERT INTO map_revisions (owner_id, map_id, version, doc, reason, created_at) VALUES (?, 'abc', 1, '{}', 'autosave', ?)");
  for (let m = 0; m < 6 * 60; m += 10) add.run(owner, new Date(now - 2 * 86_400_000 - m * 60_000).toISOString()); // 36 within 6 hours, two days ago
  add.run(owner, new Date(now - 100 * 86_400_000).toISOString()); // too old
  housekeeping(db, now);
  const n = db.prepare('SELECT COUNT(*) n FROM map_revisions').get().n;
  assert.ok(n >= 6 && n <= 7, `kept ${n}`);
});

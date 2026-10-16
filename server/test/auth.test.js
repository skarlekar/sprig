// Sign-in with Google, Facebook and X, using fake providers so no network is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/app.js';

const ORIGIN = 'http://localhost:8080';
const OWNER = 'owner@example.com';

function fakeProvider(id) {
  const profiles = new Map();
  return {
    profiles,
    authUrl: ({ state }) => `https://${id}.test/authorize?state=${state}`,
    async exchange(code) { const p = profiles.get(code); if (!p) throw new Error('bad code'); return p; },
  };
}
async function setup(env = {}) {
  const config = loadConfig({
    PUBLIC_URL: ORIGIN, ALLOWED_EMAILS: `${OWNER},friend@example.com`, OWNER_EMAIL: OWNER,
    GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'g', FACEBOOK_CLIENT_ID: 'f', FACEBOOK_CLIENT_SECRET: 'f', X_CLIENT_ID: 'x', X_CLIENT_SECRET: 'x',
    SESSION_SECRET: 'x'.repeat(40), SHARE_KEY: 'ab'.repeat(32), DB_FILE: ':memory:', LOG_LEVEL: 'silent', ...env,
  });
  // a fake for each provider the config turns on, as buildProviders would make for real ones
  const fakes = Object.fromEntries(Object.keys(config.providers).map(id => [id, fakeProvider(id)]));
  const db = openDb(config);
  const app = await buildApp(config, { db, providers: fakes });
  return { app, db, fakes };
}
const cookieOf = res => [].concat(res.headers['set-cookie'] || []).map(c => c.split(';')[0]).filter(c => !c.endsWith('=')).join('; ');
const join = (...c) => c.filter(Boolean).join('; ');
let n = 0;

// Runs one provider round trip: start, provider redirect, callback.
async function viaProvider(app, fakes, provider, profile, session = '') {
  const start = await app.inject({ url: `/auth/${provider}`, headers: { cookie: session } });
  const state = new URL(start.headers.location).searchParams.get('state');
  const code = 'code' + (++n); fakes[provider].profiles.set(code, profile);
  const cb = await app.inject({ url: `/auth/${provider}/callback?code=${code}&state=${state}`, headers: { cookie: join(session, cookieOf(start)) } });
  return { res: cb, cookie: cookieOf(cb) };
}
async function connect(app, fakes, provider, profile, session) {
  const start = await app.inject({ method: 'POST', url: `/api/me/identities/${provider}`, headers: { cookie: session, origin: ORIGIN } });
  assert.equal(start.statusCode, 200);
  const state = new URL(start.json().url).searchParams.get('state');
  const code = 'code' + (++n); fakes[provider].profiles.set(code, profile);
  return app.inject({ url: `/auth/${provider}/callback?code=${code}&state=${state}`, headers: { cookie: join(session, cookieOf(start)) } });
}
const me = (app, cookie) => app.inject({ url: '/api/me', headers: { cookie } }).then(r => r.json());
const profile = (subject, email, extra = {}) => ({ subject, email, emailVerified: true, name: 'Owner', picture: null, ...extra });

test('the sign-in page shows a button for each provider that is set up', async () => {
  const { app } = await setup({ FACEBOOK_CLIENT_ID: '', FACEBOOK_CLIENT_SECRET: '' });
  const page = (await app.inject('/login')).body;
  assert.match(page, /Continue with Google/); assert.match(page, /Continue with X/);
  assert.doesNotMatch(page, /Continue with Facebook/);
  assert.equal((await app.inject('/auth/facebook')).statusCode, 404);
});

test('Google and X can open an account for an allowed, confirmed email', async () => {
  for (const provider of ['google', 'x']) {
    const { app, fakes } = await setup();
    const { res, cookie } = await viaProvider(app, fakes, provider, profile(provider + '-1', 'Owner@Example.com'));
    assert.equal(res.headers.location, '/', provider);
    const m = await me(app, cookie);
    assert.equal(m.email, OWNER); assert.equal(m.role, 'owner');
    assert.deepEqual(m.identities.map(i => i.provider), [provider]);
  }
});

test('Facebook cannot open or find an account by email, even an allowed one; it must be connected first', async () => {
  const { app, fakes, db } = await setup();
  const first = await viaProvider(app, fakes, 'facebook', profile('fb-1', OWNER));
  assert.equal(first.res.statusCode, 403); assert.match(first.res.body, /Connect Facebook first/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 0);
  const g = await viaProvider(app, fakes, 'google', profile('g-1', OWNER));
  const again = await viaProvider(app, fakes, 'facebook', profile('fb-1', OWNER, { emailVerified: false }));
  assert.equal(again.res.statusCode, 403, 'a matching email still does not let Facebook in');
  assert.equal((await connect(app, fakes, 'facebook', profile('fb-1', OWNER, { emailVerified: false }), g.cookie)).headers.location, '/?connected=facebook');
  const now = await viaProvider(app, fakes, 'facebook', profile('fb-1', 'whatever@example.com', { emailVerified: false }));
  assert.equal(now.res.headers.location, '/'); assert.equal((await me(app, now.cookie)).email, OWNER);
});

test('refusals: not on the allowlist, no confirmed email, bad state, cancelled', async () => {
  const { app, fakes, db } = await setup();
  const stranger = await viaProvider(app, fakes, 'x', profile('x-9', 'stranger@example.com'));
  assert.equal(stranger.res.headers.location, '/denied');
  const noEmail = await viaProvider(app, fakes, 'x', profile('x-8', undefined, { emailVerified: false }));
  assert.equal(noEmail.res.statusCode, 403); assert.match(noEmail.res.body, /did not share a confirmed email/);
  const unconfirmed = await viaProvider(app, fakes, 'google', profile('g-9', OWNER, { emailVerified: false }));
  assert.equal(unconfirmed.res.statusCode, 403);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 0);

  const start = await app.inject('/auth/google');
  const bad = await app.inject({ url: '/auth/google/callback?code=x&state=wrong', headers: { cookie: cookieOf(start) } });
  assert.equal(bad.headers.location, '/login?error=failed');
  const crossed = await app.inject({ url: `/auth/x/callback?code=x&state=${new URL(start.headers.location).searchParams.get('state')}`, headers: { cookie: cookieOf(start) } });
  assert.equal(crossed.headers.location, '/login?error=failed', 'a Google state cannot finish an X sign-in');
  const cancel = await app.inject({ url: '/auth/x/callback?error=access_denied', headers: { cookie: cookieOf(await app.inject('/auth/x')) } });
  assert.equal(cancel.headers.location, '/login?error=cancelled');
});

test('a second provider with the same email is not attached silently; it is connected from the account', async () => {
  const { app, fakes } = await setup();
  const g = await viaProvider(app, fakes, 'google', profile('g-1', OWNER));
  const xFirst = await viaProvider(app, fakes, 'x', profile('x-1', OWNER));
  assert.equal(xFirst.res.statusCode, 403); assert.match(xFirst.res.body, /Connect X first/);

  // connect X while signed in with Google; the X email may differ
  const linked = await connect(app, fakes, 'x', profile('x-1', 'another@address.com'), g.cookie);
  assert.equal(linked.headers.location, '/?connected=x');
  assert.deepEqual((await me(app, g.cookie)).identities.map(i => i.provider).sort(), ['google', 'x']);

  // now X signs in to the same account
  const xNow = await viaProvider(app, fakes, 'x', profile('x-1', 'another@address.com'));
  assert.equal(xNow.res.headers.location, '/');
  assert.equal((await me(app, xNow.cookie)).email, OWNER);

  // disconnect Google, keep X
  const del = await app.inject({ method: 'DELETE', url: '/api/me/identities/google', headers: { cookie: xNow.cookie, origin: ORIGIN } });
  assert.equal(del.statusCode, 204);
  const last = await app.inject({ method: 'DELETE', url: '/api/me/identities/x', headers: { cookie: xNow.cookie, origin: ORIGIN } });
  assert.equal(last.statusCode, 409, 'the last sign-in method cannot be removed');
});

test('a provider account already used by someone else cannot be connected', async () => {
  const { app, fakes } = await setup();
  const a = await viaProvider(app, fakes, 'google', profile('g-a', OWNER));
  const b = await viaProvider(app, fakes, 'google', profile('g-b', 'friend@example.com'));
  await connect(app, fakes, 'facebook', profile('fb-b', 'friend@example.com'), b.cookie);
  const steal = await connect(app, fakes, 'facebook', profile('fb-b', 'friend@example.com'), a.cookie);
  assert.equal(steal.statusCode, 409); assert.match(steal.body, /already connected to a different Sprig account/);
});

test('connecting needs a signed-in session and a request from this site', async () => {
  const { app } = await setup();
  assert.equal((await app.inject({ method: 'POST', url: '/api/me/identities/x', headers: { origin: ORIGIN } })).statusCode, 401);
  const { app: app2, fakes } = await setup();
  const g = await viaProvider(app2, fakes, 'google', profile('g-1', OWNER));
  assert.equal((await app2.inject({ method: 'POST', url: '/api/me/identities/x', headers: { cookie: g.cookie, origin: 'https://evil.example' } })).statusCode, 403);
});

test('a removed address is refused through any of its connected providers', async () => {
  // models a restart after OWNER was taken off ALLOWED_EMAILS: the account and its X identity still exist
  const { app, fakes, db } = await setup({ ALLOWED_EMAILS: 'someone@else.com', OWNER_EMAIL: 'someone@else.com' });
  db.prepare("INSERT INTO users (id, email, role, created_at) VALUES ('u1', ?, 'owner', '2026-01-01')").run(OWNER);
  db.prepare("INSERT INTO identities VALUES ('i1', 'u1', 'x', 'x-1', 'other@address.com', '2026-01-01')").run();
  const x = await viaProvider(app, fakes, 'x', profile('x-1', 'other@address.com'));
  assert.equal(x.res.headers.location, '/denied');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
});

// The real provider adapters, with fetch stubbed: checks the URLs they build and the requests they send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProviders } from '../src/providers.js';

const config = {
  publicUrl: 'https://sprig.example.com',
  providers: { google: { clientId: 'gid', clientSecret: 'gsec' }, facebook: { clientId: 'fid', clientSecret: 'fsec', version: 'v26.0' }, x: { clientId: 'xid', clientSecret: 'xsec' } },
};
const P = buildProviders(config);
const params = u => Object.fromEntries(new URL(u).searchParams);

function stubFetch(routes) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); calls.push({ url: u, opts });
    const hit = Object.entries(routes).find(([k]) => u.startsWith(k));
    if (!hit) throw new Error('unexpected fetch ' + u);
    return new Response(JSON.stringify(hit[1]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

test('authorization URLs carry the right endpoint, redirect, scopes, state and PKCE', () => {
  const g = params(P.google.authUrl({ state: 's1', nonce: 'n1', challenge: 'c1' }));
  assert.match(P.google.authUrl({ state: 's', nonce: 'n', challenge: 'c' }), /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  assert.equal(g.redirect_uri, 'https://sprig.example.com/auth/google/callback');
  assert.equal(g.scope, 'openid email profile'); assert.equal(g.code_challenge_method, 'S256'); assert.equal(g.nonce, 'n1');

  const f = P.facebook.authUrl({ state: 's2', nonce: 'n', challenge: 'c' });
  assert.match(f, /^https:\/\/www\.facebook\.com\/v26\.0\/dialog\/oauth\?/);
  assert.equal(params(f).redirect_uri, 'https://sprig.example.com/auth/facebook/callback');
  assert.equal(params(f).scope, 'email,public_profile'); assert.equal(params(f).state, 's2');

  const x = P.x.authUrl({ state: 's3', nonce: 'n', challenge: 'c3' });
  assert.match(x, /^https:\/\/x\.com\/i\/oauth2\/authorize\?/);
  assert.equal(params(x).redirect_uri, 'https://sprig.example.com/auth/x/callback');
  assert.equal(params(x).scope, 'users.read users.email tweet.read');
  assert.equal(params(x).code_challenge, 'c3'); assert.equal(params(x).code_challenge_method, 'S256');
});

test('Facebook: exchanges the code, signs the profile request, and reads the email', async () => {
  const s = stubFetch({
    'https://graph.facebook.com/v26.0/oauth/access_token': { access_token: 'fbtoken', token_type: 'bearer' },
    'https://graph.facebook.com/v26.0/me': { id: '123', name: 'Srini', email: 'owner@example.com', picture: { data: { url: 'https://pic' } } },
  });
  try {
    const p = await P.facebook.exchange('thecode', { verifier: 'v' });
    assert.deepEqual(p, { subject: '123', email: 'owner@example.com', emailVerified: false, name: 'Srini', picture: 'https://pic' }, 'Facebook emails are never treated as verified');
    const tok = params(s.calls[0].url);
    assert.deepEqual([tok.client_id, tok.client_secret, tok.code, tok.redirect_uri], ['fid', 'fsec', 'thecode', 'https://sprig.example.com/auth/facebook/callback']);
    const me = params(s.calls[1].url);
    assert.equal(me.fields, 'id,name,email,picture.width(96)'); assert.equal(me.access_token, 'fbtoken');
    assert.match(me.appsecret_proof, /^[0-9a-f]{64}$/);
  } finally { s.restore(); }
});

test('Facebook: no email means no confirmed email', async () => {
  const s = stubFetch({ 'https://graph.facebook.com/v26.0/oauth/access_token': { access_token: 't' }, 'https://graph.facebook.com/v26.0/me': { id: '9', name: 'No Mail' } });
  try { const p = await P.facebook.exchange('c', {}); assert.equal(p.emailVerified, false); assert.equal(p.email, undefined); }
  finally { s.restore(); }
});

test('X: Basic auth token exchange with the PKCE verifier, then confirmed_email from /2/users/me', async () => {
  const s = stubFetch({
    'https://api.x.com/2/oauth2/token': { access_token: 'xtoken', token_type: 'bearer' },
    'https://api.x.com/2/users/me': { data: { id: '42', name: 'Srini', username: 'srini', confirmed_email: 'owner@example.com', profile_image_url: 'https://img' } },
  });
  try {
    const p = await P.x.exchange('xcode', { verifier: 'the-verifier' });
    assert.deepEqual(p, { subject: '42', email: 'owner@example.com', emailVerified: true, name: 'Srini', picture: 'https://img' });
    const t = s.calls[0];
    assert.equal(t.opts.method, 'POST');
    assert.equal(t.opts.headers.authorization, 'Basic ' + Buffer.from('xid:xsec').toString('base64'));
    const body = Object.fromEntries(new URLSearchParams(t.opts.body));
    assert.deepEqual([body.grant_type, body.code, body.code_verifier, body.redirect_uri], ['authorization_code', 'xcode', 'the-verifier', 'https://sprig.example.com/auth/x/callback']);
    assert.match(s.calls[1].url, /user\.fields=confirmed_email/);
    assert.equal(s.calls[1].opts.headers.authorization, 'Bearer xtoken');
  } finally { s.restore(); }
});

test('X: an account without a confirmed email is not trusted', async () => {
  const s = stubFetch({ 'https://api.x.com/2/oauth2/token': { access_token: 't' }, 'https://api.x.com/2/users/me': { data: { id: '7', username: 'nomail' } } });
  try { const p = await P.x.exchange('c', { verifier: 'v' }); assert.equal(p.emailVerified, false); assert.equal(p.name, 'nomail'); }
  finally { s.restore(); }
});

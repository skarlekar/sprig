// Social sign-in providers. Each turns an authorization code into one normalised profile:
// { subject, email, emailVerified, name, picture }. Sprig only trusts emails the provider confirms.
import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const PROVIDER_NAMES = { google: 'Google', facebook: 'Facebook', x: 'X' };

async function json(res, what) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${what} failed with ${res.status}: ${JSON.stringify(body).slice(0, 1000)}`);
  return body;
}

// Google: OpenID Connect with PKCE; the ID token is verified against Google's published keys.
function google({ clientId, clientSecret }, redirectUri) {
  const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  return {
    authUrl({ state, nonce, challenge }) {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
        state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' });
      return u.toString();
    },
    async exchange(code, { verifier, nonce }) {
      const { id_token } = await json(await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
      }), 'Google token exchange');
      const { payload: c } = await jwtVerify(id_token, jwks, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId });
      if (c.nonce !== nonce) throw new Error('Google nonce did not match');
      return { subject: String(c.sub), email: c.email, emailVerified: c.email_verified === true, name: c.name, picture: c.picture };
    },
  };
}

// Facebook Login (manual flow). Facebook does not say whether the email it returns is verified, so it is never
// trusted to open or find an account: Facebook works only after being connected from a signed-in account.
function facebook({ clientId, clientSecret, version }, redirectUri) {
  const graph = `https://graph.facebook.com/${version}`;
  return {
    authUrl({ state }) {
      const u = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
      u.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state, response_type: 'code', scope: 'email,public_profile' });
      return u.toString();
    },
    async exchange(code) {
      const t = new URL(`${graph}/oauth/access_token`);
      t.search = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code });
      const { access_token } = await json(await fetch(t), 'Facebook token exchange');
      const proof = crypto.createHmac('sha256', clientSecret).update(access_token).digest('hex');
      const me = new URL(`${graph}/me`);
      me.search = new URLSearchParams({ fields: 'id,name,email,picture.width(96)', access_token, appsecret_proof: proof });
      const p = await json(await fetch(me), 'Facebook profile');
      return { subject: String(p.id), email: p.email, emailVerified: false, name: p.name, picture: p.picture && p.picture.data && p.picture.data.url };
    },
  };
}

// X (Twitter) OAuth 2.0 with PKCE. The users.email scope returns confirmed_email for the signed-in account.
function x({ clientId, clientSecret }, redirectUri) {
  return {
    authUrl({ state, challenge }) {
      const u = new URL('https://x.com/i/oauth2/authorize');
      u.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
        scope: 'users.read users.email tweet.read', state, code_challenge: challenge, code_challenge_method: 'S256' });
      return u.toString();
    },
    async exchange(code, { verifier }) {
      const basic = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64');
      const { access_token } = await json(await fetch('https://api.x.com/2/oauth2/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
        body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier }),
      }), 'X token exchange');
      const { data } = await json(await fetch('https://api.x.com/2/users/me?user.fields=confirmed_email,name,profile_image_url,username', {
        headers: { authorization: `Bearer ${access_token}` },
      }), 'X profile');
      return { subject: String(data.id), email: data.confirmed_email, emailVerified: !!data.confirmed_email, name: data.name || data.username, picture: data.profile_image_url };
    },
  };
}

export function buildProviders(config) {
  const make = { google, facebook, x };
  const out = {};
  for (const [id, creds] of Object.entries(config.providers)) out[id] = make[id](creds, `${config.publicUrl}/auth/${id}/callback`);
  return out;
}

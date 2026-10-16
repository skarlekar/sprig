// Small server-rendered pages: sign-in, access refused, and dead share links. No scripts.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LOGO = `<svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="var(--accent)"/><path d="M15.6 10C18 7.6 19.4 6.8 21 6.6M15.6 14c2.4 2.4 3.8 3.2 5.4 3.4M8.4 10C6 7.6 4.6 6.8 3 6.6M8.4 14C6 16.4 4.6 17.2 3 17.4" stroke="var(--accent)" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`;

function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Jost:wght@600&display=swap">
<style>
:root{--bg:#f2f3f1;--card:#fcfdfd;--line:#dbe2e1;--ink:#1c2524;--ink-2:#5b6867;--accent:#16756e;--accent-ink:#fff;--danger:#b8402c}
@media (prefers-color-scheme: dark){:root{--bg:#141817;--card:#1a1f1f;--line:#323b3b;--ink:#e6eeed;--ink-2:#a2b0ae;--accent:#4dbdb2;--accent-ink:#0d2220;--danger:#ea7a62;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 Figtree,-apple-system,"Segoe UI",system-ui,sans-serif;padding:24px 16px}
main{width:min(400px,100%);background:var(--card);border:1px solid var(--line);border-radius:16px;padding:32px 28px;text-align:center;display:grid;gap:14px;justify-items:center}
h1{font:600 26px/1.15 Jost,Futura,"Avenir Next",sans-serif;margin:0}
p{margin:0;color:var(--ink-2)}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:11px 16px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-weight:600;text-decoration:none}
.btn:hover{border-color:var(--ink-2)}
.pri{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.err{color:var(--danger)}
small{color:var(--ink-2)}
code{font-size:13px}
</style></head><body><main>${body}</main></body></html>`;
}

const GOOGLE_G = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

const ICONS = {
  google: GOOGLE_G,
  facebook: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path fill="#fff" d="M15.1 15.5l.5-3.5h-3.3V9.8c0-1 .5-1.9 2-1.9h1.5V5c0 0-1.4-.2-2.7-.2-2.8 0-4.5 1.7-4.5 4.7V12H5.5v3.5h3.1V24c.6.1 1.2.1 1.9.1s1.2 0 1.8-.1v-8.5h2.8z"/></svg>`,
  x: `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.3 5.5-6.3zm-1.2 17.9h1.9L6.7 4.2H4.7z"/></svg>`,
};
const LABELS = { google: 'Continue with Google', facebook: 'Continue with Facebook', x: 'Continue with X' };

export function loginPage({ providers = [], devLogin, owner, error }) {
  const msg = error === 'cancelled' ? '<p class="err">Sign-in was cancelled.</p>'
    : error ? '<p class="err">Sign-in did not work. Please try again.</p>' : '';
  const buttons = providers.map(p => `<a class="btn" href="/auth/${p}">${ICONS[p] || ''}${LABELS[p] || p}</a>`).join('');
  return page('Sign in · Sprig', `${LOGO}<h1>Sprig</h1><p>Sign in to open your mind maps.</p>${msg}${buttons}
    ${devLogin ? `<a class="btn pri" href="/auth/dev">Continue as ${esc(owner)} (local test)</a><small>Local test sign-in is on. It only works on localhost.</small>` : ''}
    ${!providers.length && !devLogin ? '<p class="err">No sign-in method is set up on this server.</p>' : ''}`);
}

export function deniedPage(email) {
  return page('Access not granted · Sprig', `${LOGO}<h1>Access not granted</h1>
    <p>${email ? `<strong>${esc(email)}</strong> is not allowed to use this Sprig server.` : 'This account is not allowed to use this Sprig server.'}</p>
    <a class="btn" href="/login">Try a different account</a>`);
}

export function messagePage(title, text) {
  return page(`${title} · Sprig`, `${LOGO}<h1>${esc(title)}</h1><p>${esc(text)}</p><a class="btn" href="/">Go to Sprig</a>`);
}

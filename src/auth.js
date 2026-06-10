/**
 * Keyless browser login for the LOCAL (stdio) Kolbo MCP server.
 *
 * When the server runs on the user's machine with no KOLBO_API_KEY and no
 * stored credential, the first tool call triggers this: we open the browser to
 * Kolbo's OAuth login (the same server that powers the remote connector), the
 * user clicks Allow, and we capture a token via a loopback redirect — no API
 * key to create or paste. The token is cached so every later run is silent.
 *
 * Standard "native app" OAuth: authorization-code + PKCE with a
 * http://localhost:<port>/callback redirect (already allow-listed by the Kolbo
 * OAuth server). This path is NOT used by the remote connector (it always
 * injects the caller's key, and passes allowBrowserLogin:false).
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function openBrowser(url) {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  try { exec(cmd, () => {}); } catch (_) { /* best effort */ }
}

// Where we cache the token — same location + shape that client.js reads back
// (`<xdg-data>/kolbo/auth.json` → { "kolbo@<host>": { type: 'api', key } }).
function authStorePath() {
  const dataDir =
    process.env.XDG_DATA_HOME ||
    (process.platform === 'win32'
      ? (process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'))
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.local', 'share'));
  return path.join(dataDir, 'kolbo', 'auth.json');
}

function storeKey(apiHost, key) {
  try {
    const file = authStorePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let store = {};
    try { store = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
    store[`kolbo@${apiHost}`] = { type: 'api', key, savedAt: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(store, null, 2), { mode: 0o600 });
  } catch (_) { /* non-fatal — the key still works for this process */ }
}

function donePage(ok) {
  const title = ok ? 'Connected to Kolbo' : 'Connection cancelled';
  const sub = ok ? 'You can close this tab and return to your app.' : 'You can close this tab.';
  const mark = ok ? '✓' : '✕';
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
    `<body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#05050f;color:#fff;` +
    `display:flex;align-items:center;justify-content:center;height:100vh">` +
    `<div style="text-align:center"><div style="font-size:42px;color:#8B5CF6;margin-bottom:8px">${mark}</div>` +
    `<h2 style="margin:0 0 6px">${title}</h2><p style="opacity:.55;font-size:14px">${sub}</p></div></body>`;
}

/**
 * Run the interactive browser login. Resolves with the kolbo_live_ key.
 * @param {object} opts
 * @param {string} opts.apiBase  e.g. https://api.kolbo.ai/api
 */
async function browserLogin({ apiBase }) {
  // The OAuth endpoints live at the host root, not under /api.
  const oauthBase = apiBase.replace(/\/api\/?$/, '');
  let apiHost = 'api.kolbo.ai';
  try { apiHost = new URL(apiBase).host; } catch (_) {}

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  // Loopback callback server on a random free port.
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const redirectUri = `http://localhost:${port}/callback`;

  try {
    // 1. Dynamic client registration (public + PKCE).
    const regRes = await fetch(`${oauthBase}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Kolbo MCP (local)', redirect_uris: [redirectUri] }),
    });
    if (!regRes.ok) throw new Error(`client registration failed (${regRes.status})`);
    const { client_id } = await regRes.json();

    // 2. Wait for the browser redirect to hit our loopback server.
    const codePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('login timed out (5 min)')), 5 * 60 * 1000);
      server.on('request', (req, resp) => {
        let u;
        try { u = new URL(req.url, redirectUri); } catch (_) { resp.writeHead(400); resp.end(); return; }
        if (u.pathname !== '/callback') { resp.writeHead(404); resp.end(); return; }
        clearTimeout(timer);
        const code = u.searchParams.get('code');
        const st = u.searchParams.get('state');
        const err = u.searchParams.get('error');
        resp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        resp.end(donePage(!err && !!code));
        if (err) return reject(new Error(`login denied: ${err}`));
        if (!code || st !== state) return reject(new Error('login: invalid callback'));
        resolve(code);
      });
    });

    // 3. Open the consent/login page.
    const authUrl =
      `${oauthBase}/oauth/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${challenge}` +
      `&code_challenge_method=S256&state=${state}&scope=kolbo`;
    openBrowser(authUrl);
    process.stderr.write(
      `\n[kolbo] Connect your Kolbo account in the browser. If it didn't open, visit:\n${authUrl}\n\n`
    );

    const code = await codePromise;

    // 4. Exchange the code (with the PKCE verifier) for the token.
    const tokRes = await fetch(`${oauthBase}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id,
      }),
    });
    if (!tokRes.ok) throw new Error(`token exchange failed (${tokRes.status})`);
    const tok = await tokRes.json();
    if (!tok.access_token) throw new Error('login: no access_token returned');

    storeKey(apiHost, tok.access_token);
    return tok.access_token;
  } finally {
    try { server.close(); } catch (_) {}
  }
}

module.exports = { browserLogin };

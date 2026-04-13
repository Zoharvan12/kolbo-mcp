const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Kolbo API HTTP client wrapper
 *
 * Auth resolution (first match wins):
 *   1. KOLBO_API_KEY env var          — explicit key, always honored
 *   2. CLI auth store (auth.json)     — auto-shared with `kolbo auth login`
 *
 * API base resolution (mirrors CLI partner.ts):
 *   1. KOLBO_API_URL env var          — explicit override
 *   2. KOLBO_API_BASE env var         — same as CLI
 *   3. partner.json on disk           — whitelabel config
 *   4. https://api.kolbo.ai/api       — default
 */

class KolboApiError extends Error {
  constructor(message, { code, status, data } = {}) {
    super(message);
    this.name = 'KolboApiError';
    this.code = code || null;
    this.status = status || null;
    this.data = data || null;
  }
}

// ---------------------------------------------------------------------------
// Partner / whitelabel resolution (mirrors CLI's brand/partner.ts)
// ---------------------------------------------------------------------------

function readJsonSync(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Resolve the API base URL, checking the same sources as the CLI:
 *   1. KOLBO_API_URL / KOLBO_API_BASE env vars
 *   2. partner.json files (KOLBO_PARTNER_PROFILE, XDG_CONFIG_HOME, ~/.config)
 *   3. Default: https://api.kolbo.ai/api
 */
function resolveApiBase() {
  // Env vars take priority
  const fromEnv = process.env.KOLBO_API_URL || process.env.KOLBO_API_BASE;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  // Partner profile files (same order as CLI)
  const candidates = [];
  if (process.env.KOLBO_PARTNER_PROFILE) {
    candidates.push(process.env.KOLBO_PARTNER_PROFILE);
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || (
    process.platform === 'win32'
      ? path.join(os.homedir(), '.config')
      : path.join(os.homedir(), '.config')
  );
  candidates.push(path.join(xdgConfig, 'kolbo', 'partner.json'));

  for (const file of candidates) {
    const data = readJsonSync(file);
    if (data && data.apiBase) return data.apiBase.replace(/\/$/, '');
  }

  return 'https://api.kolbo.ai/api';
}

// ---------------------------------------------------------------------------
// CLI auth store reader
// ---------------------------------------------------------------------------

/**
 * XDG data dir — same logic as the `xdg-basedir` npm package the CLI uses.
 * On Windows with Git Bash / MSYS2 this resolves to ~/.local/share (matching
 * what the CLI actually writes to).
 */
function xdgDataDir() {
  if (process.env.XDG_DATA_HOME) return process.env.XDG_DATA_HOME;
  if (process.platform === 'win32') {
    // xdg-basedir on Windows: LOCALAPPDATA → ~/.local/share fallback
    return process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return path.join(os.homedir(), '.local', 'share');
}

/**
 * Read the Kolbo Code auth store. Kolbo Code writes credentials to
 * <xdg-data>/kolbo/auth.json after device-code login.
 *
 * On Windows (Git Bash / MSYS2) xdg-basedir resolves to ~/.local/share,
 * so we check multiple candidates to be safe.
 */
function readCliAuthKey() {
  const dataDir = xdgDataDir();
  const candidates = [
    path.join(dataDir, 'kolbo', 'auth.json'),
  ];
  // Windows fallback: also check ~/.local/share if LOCALAPPDATA was primary
  if (process.platform === 'win32' && dataDir !== path.join(os.homedir(), '.local', 'share')) {
    candidates.push(path.join(os.homedir(), '.local', 'share', 'kolbo', 'auth.json'));
  }

  // Determine the API host for namespaced auth lookup
  const apiBase = process.env.KOLBO_API_URL || process.env.KOLBO_API_BASE || '';
  let apiHost = null;
  try { apiHost = new URL(apiBase).host; } catch (_) {}
  if (!apiHost) {
    // Check partner.json for the API host
    const partnerCandidates = [];
    if (process.env.KOLBO_PARTNER_PROFILE) partnerCandidates.push(process.env.KOLBO_PARTNER_PROFILE);
    const xdgCfg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    partnerCandidates.push(path.join(xdgCfg, 'kolbo', 'partner.json'));
    for (const f of partnerCandidates) {
      const p = readJsonSync(f);
      if (p && p.apiBase) { try { apiHost = new URL(p.apiBase).host; } catch (_) {} break; }
    }
  }
  if (!apiHost) apiHost = 'api.kolbo.ai';

  for (const file of candidates) {
    try {
      const auth = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Try namespaced key first (e.g. "kolbo@api.kolbo.ai"), then bare "kolbo"
      const entry = auth[`kolbo@${apiHost}`] || auth.kolbo;
      if (!entry) continue;
      if (entry.type === 'oauth' && entry.refresh) return entry.refresh;
      if (entry.type === 'api' && entry.key) return entry.key;
    } catch (_) {
      // File doesn't exist or isn't valid JSON — try next
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

class KolboClient {
  constructor() {
    this.baseUrl = resolveApiBase();
    this._envKey = process.env.KOLBO_API_KEY || null;
    this._authStoreKey = null; // lazy-loaded
    this.apiKey = this._envKey || this._readAuthStore();

    if (!this.apiKey) {
      throw new Error(
        'Kolbo API key not found.\n' +
        'Fix: Run "kolbo auth login" in the terminal, then restart this editor.\n' +
        'Or: Get an API key at https://app.kolbo.ai/developer and set KOLBO_API_KEY env var.'
      );
    }
  }

  _readAuthStore() {
    this._authStoreKey = readCliAuthKey();
    return this._authStoreKey;
  }

  /**
   * On 401, re-read the CLI auth store in case the user re-authenticated
   * since the MCP server started. Returns true if a new key was found.
   */
  _tryRefreshKey() {
    if (this._envKey) {
      // Env var is set but invalid — can't override it, but try auth store
      const fresh = readCliAuthKey();
      if (fresh && fresh !== this._envKey) {
        this.apiKey = fresh;
        return true;
      }
      return false;
    }
    const fresh = readCliAuthKey();
    if (fresh && fresh !== this.apiKey) {
      this.apiKey = fresh;
      return true;
    }
    return false;
  }

  async request(method, reqPath, body = null) {
    const result = await this._doRequest(method, reqPath, body);

    // On 401, try re-reading auth store and retry once
    if (result._status === 401 && this._tryRefreshKey()) {
      return this._doRequest(method, reqPath, body);
    }
    return result;
  }

  async _doRequest(method, reqPath, body = null) {
    const url = `${this.baseUrl}${reqPath}`;
    const options = {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new KolboApiError(`API error: ${response.status} ${response.statusText}`, {
        status: response.status,
        data: null
      });
    }

    if (!response.ok || data.success === false) {
      const message = data.error || data.message || `API error: ${response.status}`;
      const code = data.code || null;
      let fullMessage = code ? `${message} [${code}]` : message;
      if (response.status === 401) {
        // Tag the response so the retry logic in request() can see it
        data._status = 401;
        fullMessage += '\n\nAPI key is invalid or expired. Fix: run "kolbo auth login" in the terminal, then restart this editor. Or get a new key at https://app.kolbo.ai/developer';
      }
      throw new KolboApiError(fullMessage, {
        code,
        status: response.status,
        data
      });
    }

    return data;
  }

  async post(reqPath, body) {
    return this.request('POST', reqPath, body);
  }

  async get(reqPath) {
    return this.request('GET', reqPath);
  }

  async delete(reqPath) {
    return this.request('DELETE', reqPath);
  }

  async postMultipart(reqPath, formData) {
    const result = await this._doMultipart(reqPath, formData);
    if (result._status === 401 && this._tryRefreshKey()) {
      return this._doMultipart(reqPath, formData);
    }
    return result;
  }

  async _doMultipart(reqPath, formData) {
    const url = `${this.baseUrl}${reqPath}`;
    const headers = {
      'X-API-Key': this.apiKey,
      ...formData.getHeaders()
    };

    // Serialize form-data to a Buffer before passing to fetch(). Node's
    // built-in fetch (undici) can't consume legacy Node.js streams from
    // the `form-data` package, causing "fetch failed" on local file uploads.
    const body = formData.getBuffer();
    headers['Content-Length'] = String(body.length);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body
    });

    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new KolboApiError(`API error: ${response.status} ${response.statusText}`, {
        status: response.status,
        data: null
      });
    }

    if (!response.ok || data.success === false) {
      const message = data.error || data.message || `API error: ${response.status}`;
      const code = data.code || null;
      let fullMessage = code ? `${message} [${code}]` : message;
      if (response.status === 401) {
        data._status = 401;
        fullMessage += '\n\nAPI key is invalid or expired. Fix: run "kolbo auth login" in the terminal, then restart this editor. Or get a new key at https://app.kolbo.ai/developer';
      }
      throw new KolboApiError(fullMessage, {
        code,
        status: response.status,
        data
      });
    }

    return data;
  }
}

module.exports = KolboClient;
module.exports.KolboApiError = KolboApiError;

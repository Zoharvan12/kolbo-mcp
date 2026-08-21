const fs = require('fs');
const path = require('path');
const os = require('os');
const progress = require('./progress');
const { rewriteTree } = require('./cdn');

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

// Per-REQUEST ceilings. These are not the generation timeouts — a long job is a
// poll LOOP of many short requests, and pollUntilDone only checks its own
// deadline BETWEEN polls. So an individual request that never settles hangs the
// whole tool straight past its declared window, with no error, forever. Bound
// each request instead; the loop keeps its own budget.
const REQUEST_TIMEOUT_MS = Number(process.env.KOLBO_HTTP_TIMEOUT_MS) || 120000;
// Uploads legitimately run long — up to 25MB/file over a slow uplink.
const UPLOAD_TIMEOUT_MS = Number(process.env.KOLBO_UPLOAD_TIMEOUT_MS) || 600000;

// AbortSignal.timeout is Node 18+; package engines already require >=18.
function timeoutSignal(ms) {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(ms)
    : undefined;
}

function isAbortError(err) {
  return err && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

function composeSignals(signals) {
  const active = signals.filter(Boolean);
  if (active.length === 0) return { signal: undefined, cleanup: () => {} };
  if (active.length === 1) return { signal: active[0], cleanup: () => {} };

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const item of active) {
    if (item.aborted) {
      controller.abort();
      break;
    }
    item.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => active.forEach(item => item.removeEventListener('abort', onAbort))
  };
}

// ---------------------------------------------------------------------------
// 429 handling
// ---------------------------------------------------------------------------
// A 429 is rejected by the rate-limit middleware BEFORE the handler runs: no
// credits spent, no generation started, nothing half-done. That makes it the
// one status it is safe to replay — but only ONCE, and only when the server
// told us how long to wait. An unbounded backoff loop would hide a real
// capacity problem and stall the tool call past the host's own timeout.
const RETRY_429_MAX_WAIT_S = 65;

function retryAfterSeconds(response) {
  const raw = response.headers.get('retry-after');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function retryOnce429(attempt) {
  try {
    return await attempt();
  } catch (err) {
    const wait = err && err.status === 429 ? err.retryAfterSeconds : null;
    if (wait === null || wait === undefined || wait > RETRY_429_MAX_WAIT_S) throw err;
    await progress.tick(); // keepalive — the wait can be up to a minute
    await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
    return attempt();
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
  /**
   * @param {object} [opts]
   * @param {string} [opts.apiKey]  Explicit key. Takes precedence over env +
   *   auth store. Used by a remote HTTP host that injects the caller's key per
   *   request (one KolboClient per request) instead of reading a process-wide
   *   env var. When set, the auth-store 401 refresh path is disabled — the host
   *   owns the key lifecycle.
   * @param {string} [opts.apiBase] Explicit API base URL override.
   */
  constructor(opts = {}) {
    this.baseUrl = opts.apiBase ? String(opts.apiBase).replace(/\/$/, '') : resolveApiBase();
    this._explicitKey = opts.apiKey || null;
    this._envKey = process.env.KOLBO_API_KEY || null;
    this._authStoreKey = null; // lazy-loaded
    // Local stdio servers (raw `npx @kolbo/mcp` in Claude Desktop / Code / Cursor)
    // may start with no key and log in via the browser on first use. Disabled when:
    //   - the host opts out (remote HTTP connector passes allowBrowserLogin:false —
    //     it always injects the caller's key, and opening a browser on a server is
    //     nonsensical), or
    //   - we're spawned by Kolbo Code (it sets KOLBO_CALLER_SESSION_ID and runs its
    //     OWN in-app sign-in off the [KOLBO_AUTH_MISSING] error — don't double up).
    this._allowBrowserLogin =
      opts.allowBrowserLogin !== undefined
        ? opts.allowBrowserLogin
        : !process.env.KOLBO_CALLER_SESSION_ID;
    this._loginPromise = null;
    this.apiKey = this._explicitKey || this._envKey || this._readAuthStore();

    if (!this.apiKey && !this._allowBrowserLogin) {
      throw new Error(
        'Kolbo API key not found. Sign in to Kolbo to continue. [KOLBO_AUTH_MISSING]'
      );
    }
    // When allowBrowserLogin is on and there's no key yet, we DON'T throw —
    // the first request triggers an interactive browser login (see _ensureLogin).
  }

  /**
   * Ensure we have a key before a request. If none, run the one-time browser
   * login (single-flight so concurrent first calls share one login window).
   */
  async _ensureLogin() {
    if (this.apiKey) return;
    if (!this._allowBrowserLogin) {
      throw new Error('Kolbo API key not found. Sign in to Kolbo to continue. [KOLBO_AUTH_MISSING]');
    }
    if (!this._loginPromise) {
      const { browserLogin } = require('./auth');
      this._loginPromise = browserLogin({ apiBase: this.baseUrl })
        .then((key) => { this.apiKey = key; this._explicitKey = key; return key; })
        .catch((err) => { this._loginPromise = null; throw err; });
    }
    await this._loginPromise;
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
    // Host-injected per-request key is authoritative — never override it from
    // the local CLI auth store (which may not even exist in a server context).
    if (this._explicitKey) return false;
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

  async request(method, reqPath, body = null, requestOptions = {}) {
    if (!this.apiKey) await this._ensureLogin();
    const result = await this._doRequest(method, reqPath, body, requestOptions);

    // On 401, try re-reading auth store and retry once
    if (result._status === 401 && this._tryRefreshKey()) {
      return this._doRequest(method, reqPath, body, requestOptions);
    }
    return result;
  }

  async _doRequest(method, reqPath, body = null, requestOptions = {}) {
    const url = `${this.baseUrl}${reqPath}`;
    const headers = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json'
    };
    // Stable per-app-launch identifier from the parent process (Kolbo Code
    // sets this in the MCP env when spawning us). kolbo-api tags every
    // CreditUsage record with it so the desktop UI and the get_session_usage
    // tool can aggregate spend without enumerating individual generations.
    const callerSessionId = process.env.KOLBO_CALLER_SESSION_ID;
    if (callerSessionId) {
      headers['X-Kolbo-Caller-Session-Id'] = callerSessionId;
    }
    const options = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const callerSignal = requestOptions.ignoreCallerSignal ? null : progress.signal();
    const requestTimeoutMs = requestOptions.timeoutMs || REQUEST_TIMEOUT_MS;
    const composed = composeSignals([callerSignal, timeoutSignal(requestTimeoutMs)]);
    options.signal = composed.signal;

    let response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      if (isAbortError(err)) {
        if (callerSignal?.aborted) {
          throw new KolboApiError(
            `Request cancelled by caller: ${method} ${reqPath}`,
            { code: 'REQUEST_CANCELLED', status: 499 }
          );
        }
        throw new KolboApiError(
          `Request timed out after ${requestTimeoutMs / 1000}s: ${method} ${reqPath}. ` +
          'The job may still be running server-side — poll get_generation_status before retrying. ' +
          'Raise KOLBO_HTTP_TIMEOUT_MS if this is a legitimately slow endpoint.',
          { code: 'REQUEST_TIMEOUT', status: 504 }
        );
      }
      throw err;
    } finally {
      composed.cleanup();
    }

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
        // Tag the response so the retry logic in request() can see it AND so
        // the Kolbo Code parent process can intercept this error before the
        // agent sees it — trigger the in-app reconnect flow, refresh the key,
        // and transparently retry the tool call. Never instruct the user to
        // open a terminal: most users run Kolbo Code as a desktop / web app
        // and have no terminal context.
        data._status = 401;
        data._kolbo_auth_expired = true;
        fullMessage = `${fullMessage} [KOLBO_AUTH_EXPIRED]`;
      }
      const apiError = new KolboApiError(fullMessage, {
        code,
        status: response.status,
        data
      });
      if (response.status === 429) apiError.retryAfterSeconds = retryAfterSeconds(response);
      throw apiError;
    }

    const generationId = data?.generation_id || data?.generationId;
    if (method === 'POST' && generationId) {
      await progress.generation(generationId);
      if (!requestOptions.suppressGenerationTracking) {
        progress.trackGeneration(generationId, () => this._cancelAfterCallerAbort(generationId));
      }
    }
    return rewriteTree(data);
  }

  async _cancelAfterCallerAbort(generationId) {
    try {
      await this._doRequest(
        'POST',
        `/v1/generate/${encodeURIComponent(generationId)}/cancel`,
        {},
        {
          ignoreCallerSignal: true,
          suppressGenerationTracking: true,
          timeoutMs: 30000
        }
      );
    } catch (_) {
      // The host has already cancelled the visible tool call. This is a
      // best-effort cleanup and must never become an unhandled rejection.
    }
  }

  async post(reqPath, body, requestOptions) {
    return this.request('POST', reqPath, body, requestOptions);
  }

  async get(reqPath, requestOptions) {
    return this.request('GET', reqPath, null, requestOptions);
  }

  async put(reqPath, body = null) {
    return this.request('PUT', reqPath, body);
  }

  async patch(reqPath, body = null) {
    return this.request('PATCH', reqPath, body);
  }

  async delete(reqPath, body = null) {
    return this.request('DELETE', reqPath, body);
  }

  // Uploads are the one thing agents genuinely do in a tight loop (`upload_media`
  // per file), and /v1/media/upload shares the per-minute SDK generation bucket —
  // so a batch trips 429 long before the user's patience does. Absorb exactly one
  // of those, honouring the server's Retry-After. Everything else (including the
  // poll loop, which does its own capped backoff in polling.js) still surfaces
  // the 429 straight to the caller, now with the wait spelled out in the message.
  async postMultipart(reqPath, formData) {
    return this._multipart('POST', reqPath, formData);
  }

  async putMultipart(reqPath, formData) {
    return this._multipart('PUT', reqPath, formData);
  }

  async _multipart(method, reqPath, formData) {
    if (!this.apiKey) await this._ensureLogin();
    return retryOnce429(async () => {
      const result = await this._doMultipart(method, reqPath, formData);
      if (result._status === 401 && this._tryRefreshKey()) {
        return this._doMultipart(method, reqPath, formData);
      }
      return result;
    });
  }

  async _doMultipart(method, reqPath, formData) {
    const url = `${this.baseUrl}${reqPath}`;
    const headers = {
      'X-API-Key': this.apiKey,
      ...formData.getHeaders()
    };
    // Same caller-session header as JSON requests — see _doRequest.
    const callerSessionId = process.env.KOLBO_CALLER_SESSION_ID;
    if (callerSessionId) {
      headers['X-Kolbo-Caller-Session-Id'] = callerSessionId;
    }

    // Serialize form-data to a Buffer before passing to fetch(). Node's
    // built-in fetch (undici) can't consume legacy Node.js streams from
    // the `form-data` package, causing "fetch failed" on local file uploads.
    const body = formData.getBuffer();
    headers['Content-Length'] = String(body.length);

    const callerSignal = progress.signal();
    const composed = composeSignals([callerSignal, timeoutSignal(UPLOAD_TIMEOUT_MS)]);
    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: composed.signal
      });
    } catch (err) {
      if (isAbortError(err)) {
        if (callerSignal?.aborted) {
          throw new KolboApiError(
            `Upload cancelled by caller: ${method} ${reqPath}`,
            { code: 'REQUEST_CANCELLED', status: 499 }
          );
        }
        throw new KolboApiError(
          `Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s: ${method} ${reqPath} ` +
          `(${Math.round(body.length / 1024)}KB). Raise KOLBO_UPLOAD_TIMEOUT_MS for slow links.`,
          { code: 'UPLOAD_TIMEOUT', status: 504 }
        );
      }
      throw err;
    } finally {
      composed.cleanup();
    }

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
        // Multipart uploads: same auth-expired contract as _doRequest. The
        // Kolbo Code parent process intercepts [KOLBO_AUTH_EXPIRED] and runs
        // the in-app reconnect flow — no terminal command needed.
        data._status = 401;
        data._kolbo_auth_expired = true;
        fullMessage = `${fullMessage} [KOLBO_AUTH_EXPIRED]`;
      }
      const apiError = new KolboApiError(fullMessage, {
        code,
        status: response.status,
        data
      });
      if (response.status === 429) apiError.retryAfterSeconds = retryAfterSeconds(response);
      throw apiError;
    }

    const generationId = data?.generation_id || data?.generationId;
    if (generationId) {
      await progress.generation(generationId);
      progress.trackGeneration(generationId, () => this._cancelAfterCallerAbort(generationId));
    }
    return rewriteTree(data);
  }
}

module.exports = KolboClient;
module.exports.KolboApiError = KolboApiError;

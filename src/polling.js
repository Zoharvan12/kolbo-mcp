/**
 * Poll a generation until it reaches a terminal state
 */

const progress = require('./progress');

class PollingTimeoutError extends Error {
  constructor(generationId, timeoutMs) {
    const seconds = Math.round(timeoutMs / 1000);
    super(
      `Generation timed out after ${seconds}s of polling. The generation may STILL be running on the server — ` +
      `call get_generation_status with generation_id="${generationId}" to check its current state. ` +
      `Videos, deep-think chat, and large batches can take longer than the default polling window.`
    );
    this.name = 'PollingTimeoutError';
    this.generationId = generationId;
    this.timeoutMs = timeoutMs;
    this.timedOut = true;
  }
}

class GenerationFailedError extends Error {
  constructor(generationId, reason) {
    super(`Generation failed: ${reason || 'unknown error'} (generation_id="${generationId}")`);
    this.name = 'GenerationFailedError';
    this.generationId = generationId;
  }
}

// HTTP status codes / fetch failure modes we treat as transient when
// polling. The job is almost always still running on the server (or about
// to come back up) — bailing out makes the agent give up on a generation
// that completes 2 seconds later.
const TRANSIENT_STATUS_CODES = new Set([0, 408, 425, 429, 500, 502, 503, 504, 522, 524]);

function isTransientPollError(err) {
  if (!err) return false;
  // fetch() rejects with a TypeError on network failure (ECONNREFUSED,
  // ECONNRESET, DNS failure, kolbo-api restart, etc.) — no `status` on
  // the error object.
  if (err.name === 'TypeError') return true;
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'EPIPE') return true;
  // KolboApiError tags status on the options object.
  const status = err.status ?? err.options?.status;
  if (typeof status === 'number' && TRANSIENT_STATUS_CODES.has(status)) return true;
  return false;
}

async function pollUntilDone(client, generationId, options = {}) {
  const {
    interval = 5000,
    timeout = 300000, // 5 minutes default
    statusUrl
  } = options;

  const startTime = Date.now();
  const url = statusUrl || `/v1/generate/${encodeURIComponent(generationId)}/status`;
  let transientFailures = 0;

  while (true) {
    if (Date.now() - startTime > timeout) {
      throw new PollingTimeoutError(generationId, timeout);
    }

    let result;
    try {
      result = await client.get(url);
      transientFailures = 0; // reset on successful poll
    } catch (err) {
      // kolbo-api restart, transient network blip, rate-limit, 5xx —
      // the job is still alive on the server (or coming back). Don't
      // abandon the polling loop just because one status check failed:
      // wait a bit longer and try again. After ~30 consecutive failures
      // (~2.5 minutes at the 5s base interval) we still surface the
      // last error so a truly dead backend doesn't loop forever.
      if (isTransientPollError(err)) {
        transientFailures++;
        if (transientFailures > 30) {
          throw err;
        }
        const backoff = Math.min(interval * Math.pow(1.5, Math.min(transientFailures - 1, 5)), 30000);
        await progress.tick(); // same keepalive as the normal path — backoff waits up to 30s
        await progress.wait(backoff);
        continue;
      }
      // Non-transient (auth, 4xx other than 408/425/429) — bubble up.
      throw err;
    }

    if (result.state === 'completed') {
      return result;
    }

    if (result.state === 'failed') {
      throw new GenerationFailedError(generationId, result.error);
    }

    if (result.state === 'cancelled') {
      throw new GenerationFailedError(generationId, 'generation was cancelled');
    }

    // Still running: put a byte on the wire before going quiet again, so no
    // intermediary mistakes a long wait for a dead connection.
    await progress.tick();

    // Wait before next poll — but never past the deadline. The check at the top
    // of the loop only runs BETWEEN sleeps, so an unclamped sleep let the call
    // overshoot `timeout` by up to a full interval (a 45s window with a 15s
    // cadence could return at 60s). That is the difference between landing
    // inside the caller's transport window and blowing straight through it.
    const remaining = timeout - (Date.now() - startTime);
    await progress.wait(Math.max(0, Math.min(interval, remaining)));
  }
}

// ─── Blocking-wait window for the STATUS tools ──────────────────────────────
// How long get_generation_status / get_creative_director_status may block
// inside ONE tool call before handing back a non-terminal result the caller
// re-issues. This is NOT the generation's lifetime — the job keeps running
// server-side either way.
//
// It used to be a flat 180s, which over the remote HTTP connector no caller
// could ever reach: there the whole tool call has to fit inside a single
// POST /mcp response, and every hop in front of us has a shorter fuse.
//
//   • MCP client request timeout — 60s (SDK DEFAULT_REQUEST_TIMEOUT_MSEC), and
//     it only resets on a progress notification when the client opted into
//     resetTimeoutOnProgress, whose SDK default is false. We cannot make that
//     choice on the host's behalf, so this is the ceiling we must respect.
//   • Cloudflare origin read — 100s. api.kolbo.ai is Cloudflare-proxied.
//   • kolbo-api httpServer.timeout — 120s. Measured against the production
//     settings: a SILENT stream is RST at exactly 120.0s, while a 15s write
//     cadence survives 200s. So progress.tick() does defeat this hop — but no
//     amount of ticking defeats a client timeout that does not reset.
//
// Net effect of the old 180s: a 185s music generation made wait=true fail with
// "the connector's server isn't responding" every single time, on a perfectly
// healthy paid generation. Returning early with state:"processing" is strictly
// better than erroring — the caller re-issues and nothing is lost.
//
// stdio hosts have no hop in between and do reset on our ticks, so they keep
// the long window. KOLBO_MCP_WAIT_MS overrides both without a release, if a
// host ever proves tighter still.
const TRANSPORT_CEILING_MS = 60000;
// Headroom for everything that happens AFTER the last poll and before the
// response is on the wire: the final status read, addDisplayNames' catalog
// lookups, JSON serialization.
const RESULT_ASSEMBLY_BUDGET_MS = 10000;
const REMOTE_WAIT_MS = 45000;
const STDIO_WAIT_MS = 180000;

/**
 * @param {object} [options] tool options; `apps === true` is the remote-HTTP
 *   transport signal (set only by kolbo-api's connector).
 */
function waitWindowMs(options = {}) {
  const override = Number(process.env.KOLBO_MCP_WAIT_MS);
  if (Number.isFinite(override) && override > 0) return override;
  return options.apps === true ? REMOTE_WAIT_MS : STDIO_WAIT_MS;
}

module.exports = {
  pollUntilDone,
  PollingTimeoutError,
  GenerationFailedError,
  waitWindowMs,
  TRANSPORT_CEILING_MS,
  RESULT_ASSEMBLY_BUDGET_MS,
  REMOTE_WAIT_MS,
};

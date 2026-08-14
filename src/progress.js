const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

async function run(extra, fn) {
  return storage.run(extra, async () => {
    try {
      return await fn();
    } finally {
      if (extra?.signal && extra.__kolboAbortListener) {
        extra.signal.removeEventListener('abort', extra.__kolboAbortListener);
      }
      if (extra) {
        delete extra.__kolboAbortListener;
        delete extra.__kolboTrackedGenerations;
      }
    }
  });
}

function signal() {
  return storage.getStore()?.signal;
}

function abortError() {
  const error = new Error('The MCP tool call was cancelled by the caller.');
  error.name = 'AbortError';
  return error;
}

/** Wait without keeping a cancelled tool call alive until the next poll tick. */
function wait(ms) {
  const callerSignal = signal();
  if (!callerSignal) return new Promise(resolve => setTimeout(resolve, ms));
  if (callerSignal.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      callerSignal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      callerSignal.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    callerSignal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Associate a submitted backend generation with the current MCP tool call.
 * If Kolbo Code, Claude, or another MCP host cancels the tool while it is
 * polling, every submitted generation is cancelled server-side as well.
 */
function trackGeneration(id, cancel) {
  const extra = storage.getStore();
  if (!extra?.signal || !id || typeof cancel !== 'function') return;

  if (!extra.__kolboTrackedGenerations) extra.__kolboTrackedGenerations = new Map();
  extra.__kolboTrackedGenerations.set(String(id), cancel);

  const cancelTracked = () => {
    const tracked = extra.__kolboTrackedGenerations;
    if (!tracked) return;
    extra.__kolboTrackedGenerations = new Map();
    for (const cancelOne of tracked.values()) {
      Promise.resolve().then(cancelOne).catch(() => {});
    }
  };

  if (!extra.__kolboAbortListener) {
    extra.__kolboAbortListener = cancelTracked;
    extra.signal.addEventListener('abort', cancelTracked, { once: true });
  }

  if (extra.signal.aborted) cancelTracked();
}

async function generation(id) {
  const extra = storage.getStore();
  const token = extra?._meta?.progressToken;
  if (!id || token === undefined) return;
  // A progress notification is a courtesy — the generation is already submitted
  // and paid for. If the send fails (host cancelled the request, transport
  // already closed), swallowing it is mandatory: letting it reject would turn a
  // running generation into a tool error and make the user pay twice.
  try {
    await sendGenerationProgress(extra, token, id);
  } catch (_) { /* notification-only; never fail the tool */ }
}

/**
 * Keepalive. A tool that waits out a long generation holds one request open and
 * puts NOTHING on the wire for up to 3 minutes (get_generation_status wait=true
 * is a GET, so not even the submit notification fires). Intermediaries that
 * treat a silent connection as a dead one — corporate proxies, VPNs, some load
 * balancers — hang up, and the user reports it as "Kolbo disconnected". Every
 * poll iteration ticks, so the connection is never quiet for longer than one
 * poll interval (5-15s). No timer to leak: the poll loop IS the clock.
 */
async function tick() {
  const extra = storage.getStore();
  const token = extra?._meta?.progressToken;
  if (token === undefined) return;
  extra.__kolboProgress = (extra.__kolboProgress || 0) + 1;
  try {
    await extra.sendNotification({
      method: 'notifications/progress',
      params: { progressToken: token, progress: extra.__kolboProgress }
    });
  } catch (_) { /* keepalive only; never fail the tool */ }
}

async function sendGenerationProgress(extra, token, id) {
  await extra.sendNotification({
    method: 'notifications/progress',
    params: {
      progressToken: token,
      progress: 0,
      message: JSON.stringify({ generation_id: id })
    }
  });
}

module.exports = { run, generation, tick, signal, wait, trackGeneration };

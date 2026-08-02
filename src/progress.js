const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function run(extra, fn) {
  return storage.run(extra, fn);
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

module.exports = { run, generation, tick };

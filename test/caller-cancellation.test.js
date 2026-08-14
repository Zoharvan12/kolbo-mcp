const test = require('node:test');
const assert = require('node:assert/strict');

const KolboClient = require('../src/client');
const progress = require('../src/progress');

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => data,
  };
}

test('aborting an MCP tool call cancels every generation submitted by that call', async (t) => {
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/v1/generate/image')) {
      return jsonResponse({ success: true, generation_id: 'generation-123' });
    }
    if (url.endsWith('/v1/generate/generation-123/cancel')) {
      return jsonResponse({ success: true, generation_id: 'generation-123', state: 'cancelled' });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  const controller = new AbortController();
  const client = new KolboClient({ apiKey: 'test-key', apiBase: 'https://example.test/api' });

  await progress.run({ signal: controller.signal }, async () => {
    await client.post('/v1/generate/image', { prompt: 'test' });
    controller.abort();
    await new Promise(resolve => setImmediate(resolve));
  });

  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /\/v1\/generate\/generation-123\/cancel$/);
  assert.equal(requests[1].options.signal.aborted, false, 'cleanup cancel must ignore the already-aborted caller signal');
});

test('poll waits reject immediately when the MCP caller cancels', async () => {
  const controller = new AbortController();
  const started = Date.now();

  await assert.rejects(
    progress.run({ signal: controller.signal }, async () => {
      const waiting = progress.wait(10_000);
      controller.abort();
      await waiting;
    }),
    { name: 'AbortError' }
  );

  assert.ok(Date.now() - started < 1000, 'cancel should not wait for the next poll interval');
});

test('multipart generation submissions are also cancelled with their MCP call', async (t) => {
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/v1/generate/elements')) {
      return jsonResponse({ success: true, generation_id: 'elements-456' });
    }
    if (url.endsWith('/v1/generate/elements-456/cancel')) {
      return jsonResponse({ success: true, generation_id: 'elements-456', state: 'cancelled' });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  const controller = new AbortController();
  const client = new KolboClient({ apiKey: 'test-key', apiBase: 'https://example.test/api' });
  const formData = {
    getHeaders: () => ({ 'content-type': 'multipart/form-data; boundary=test' }),
    getBuffer: () => Buffer.from('payload'),
  };

  await progress.run({ signal: controller.signal }, async () => {
    await client.postMultipart('/v1/generate/elements', formData);
    controller.abort();
    await new Promise(resolve => setImmediate(resolve));
  });

  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /\/v1\/generate\/elements-456\/cancel$/);
});

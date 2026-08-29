const test = require('node:test');
const assert = require('node:assert/strict');

const KolboClient = require('../src/client');

function jsonResponse(data, status = 400) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    headers: { get: () => null },
    json: async () => data,
  };
}

test('MCP errors hide upstream names and internal financial details', async (t) => {
  t.mock.method(global, 'fetch', async () => jsonResponse({
    success: false,
    code: 'UPSTREAM_FAILED',
    error: 'toapi: request failed at api.toapis.com',
    provider_cost_usd: 0.64,
    pricing_details: { margin: -20 },
    failure: { provider: 'toapi', category: 'server_error', retryable: true },
  }));

  const client = new KolboClient({ apiKey: 'test-key', apiBase: 'https://example.test/api' });
  await assert.rejects(
    client.get('/v1/example'),
    (error) => {
      assert.doesNotMatch(error.message, /toapi|provider_cost|margin/i);
      assert.deepEqual(error.data, {
        code: 'UPSTREAM_FAILED',
        failure: { category: 'server_error', retryable: true },
      });
      return true;
    }
  );
});

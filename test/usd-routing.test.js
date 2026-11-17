'use strict';
const test = require('node:test');
const assert = require('node:assert');
const usd = require('../src/usd');

const client = { apiKey: 'kolbo_live_test', baseUrl: 'https://api.test/api' };
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const model = { id: 'z-image/turbo', quoteSupported: true, types: ['text_to_img'], pricing: { unit: 'image', tiers: [{ usdPerUnit: 0.01 }] },
  quoteCapabilities: { operation: 'text_to_image', resolutions: ['1K'], aspectRatios: ['1:1'], qualities: [] } };

function mockFetch(routes) {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    const path = url.replace(`${client.baseUrl}/developer-console`, '');
    calls.push(`${init.method} ${path}`);
    const route = routes[`${init.method} ${path.split('?')[0]}`];
    return route ? route(init) : json(404, { error: { code: 'NOT_FOUND' } });
  };
  return calls;
}

test('credit keys are not routed', async () => {
  usd._reset();
  mockFetch({ 'GET /account': () => json(403, { error: { code: 'USD_KEY_REQUIRED' } }) });
  assert.strictEqual(await usd.isUsd(client), false);
  assert.strictEqual(usd.routed(client), false);
  assert.ok(usd.refusal(new Error('USD API key is restricted to the developer console API [KOLBO_AUTH_EXPIRED]')));
  assert.ok(!usd.refusal(new Error('Invalid API key')));
});

test('USD key: unsupported tool, then quote, then confirmed job', async () => {
  usd._reset();
  const calls = mockFetch({
    'GET /account': () => json(200, { account: { id: 'user:abc' }, balance: {} }),
    'GET /catalog': () => json(200, { models: [model], nextPage: null }),
    'POST /quotes': init => json(200, { id: 'q1', account: 'user:abc', request: JSON.parse(init.body), amountMicroUsd: 10000, expiresAt: new Date(Date.now() + 600000).toISOString() }),
    'POST /jobs': init => { assert.deepStrictEqual(Object.keys(JSON.parse(init.body)), ['quoteId', 'expectedAccount', 'idempotencyKey']); return json(202, { id: 'job1', status: 'queued' }); },
    'GET /jobs/job1': () => json(200, { id: 'job1', status: 'completed', amountMicroUsd: 10000, chargedMicroUsd: 10000, result: { url: 'https://media.kolbo.ai/x.png' } }),
  });
  assert.strictEqual(await usd.isUsd(client), true);
  assert.strictEqual(usd.routed(client), true);
  const blocked = await usd.call('list_media', {}, client);
  assert.ok(blocked.isError && /not available on USD API plans yet/.test(blocked.content[0].text));
  const args = { prompt: 'apple', model: 'z-image/turbo' };
  const quoted = JSON.parse((await usd.call('generate_image', args, client)).content[0].text);
  assert.strictEqual(quoted.state, 'quoted');
  assert.strictEqual(quoted.price_usd, '$0.0100');
  assert.ok(!calls.includes('POST /jobs'), 'a quote alone never submits');
  const done = JSON.parse((await usd.call('generate_image', args, client)).content[0].text);
  assert.strictEqual(done.state, 'completed');
  assert.strictEqual(done.charged_usd, '$0.0100');
  assert.strictEqual(calls.filter(c => c === 'POST /jobs').length, 1);
});

'use strict';
// Social Planner automations, contacts and inbox: local guards and routing (no network).
const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { registerSocialTools } = require('../src/tools/social');

function setup() {
  const reg = {};
  const calls = [];
  const server = { _registeredTools: reg, tool(name, _desc, shape, fn) { reg[name] = { shape, fn }; } };
  const rec = (method) => async (path, body) => { calls.push([method, path, body]); return { success: true }; };
  registerSocialTools(server, { get: rec('GET'), post: rec('POST'), patch: rec('PATCH'), put: rec('PUT'), delete: rec('DELETE') });
  const call = (name, args) => reg[name].fn(z.object(reg[name].shape).parse(args));
  const valid = (name, args) => z.object(reg[name].shape).safeParse(args).success;
  return { calls, call, valid };
}
const ID = 'a'.repeat(24);

test('create_social_automation refuses locally without steps or dm_text', async () => {
  const { calls, call } = setup();
  const r = await call('create_social_automation', { account_id: ID });
  assert.equal(r.isError, true);
  assert.equal(calls.length, 0);
  await call('create_social_automation', { account_id: ID, dm_text: 'legacy' });
  await call('create_social_automation', { account_id: ID, trigger: { type: 'dm_keyword' }, steps: [{ type: 'send_dm', text: 'Hi {first_name}' }] });
  assert.deepEqual(calls.map((c) => c[0] + ' ' + c[1]), ['POST /v1/social/automations', 'POST /v1/social/automations']);
});

test('step schema enforces https buttons, limits and known types', () => {
  const { valid } = setup();
  const ok = (steps) => valid('create_social_automation', { account_id: ID, steps });
  assert.ok(ok([{ type: 'send_dm', text: 'x', buttons: [{ title: 'Open', url: 'https://kolbo.ai/x' }] }, { type: 'delay', minutes: 1380 }]));
  assert.ok(!ok([{ type: 'send_dm', text: 'x', buttons: [{ title: 'Open', url: 'http://kolbo.ai/x' }] }]));
  assert.ok(!ok([{ type: 'send_dm', text: 'x', buttons: [{ title: 'x'.repeat(21), url: 'https://kolbo.ai' }] }]));
  assert.ok(!ok([{ type: 'delay', minutes: 1381 }]));
  assert.ok(!ok([{ type: 'public_reply', replies: [] }]));
  assert.ok(!ok([{ type: 'webhook' }]));
});

test('list_social_conversations without account_id reads the merged inbox; after needs account_id', async () => {
  const { calls, call } = setup();
  assert.equal((await call('list_social_conversations', { after: 'c1' })).isError, true);
  await call('list_social_conversations', {});
  await call('list_social_conversations', { account_id: ID, after: 'c1' });
  assert.deepEqual(calls.map((c) => c[1]), ['/v1/social/inbox', `/v1/social/accounts/${ID}/conversations?after=c1`]);
});

test('tag_social_contact needs a tag change', async () => {
  const { calls, call } = setup();
  assert.equal((await call('tag_social_contact', { contact_id: ID })).isError, true);
  await call('tag_social_contact', { contact_id: ID, remove_tags: ['lead'] });
  assert.deepEqual(calls, [['PATCH', `/v1/social/contacts/${ID}`, { add_tags: undefined, remove_tags: ['lead'] }]]);
});

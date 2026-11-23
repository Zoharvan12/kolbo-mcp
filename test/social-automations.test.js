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

test('create_social_broadcast previews unless confirm is true', async () => {
  const { calls, call } = setup();
  const r = await call('create_social_broadcast', { account_id: ID, text: 'Hi', tags: ['lead'], tag_match: 'all' });
  assert.match(JSON.parse(r.content[0].text).note, /Nothing was sent/);
  await call('create_social_broadcast', { account_id: ID, text: 'Hi', confirm: false });
  await call('create_social_broadcast', { account_id: ID, text: 'Hi', variations: ['Hey'], confirm: true });
  assert.deepEqual(calls, [
    ['POST', '/v1/social/broadcasts/preview', { account_id: ID, tags: ['lead'], tag_match: 'all' }],
    ['POST', '/v1/social/broadcasts/preview', { account_id: ID, tags: undefined, tag_match: undefined }],
    ['POST', '/v1/social/broadcasts', { account_id: ID, text: 'Hi', variations: ['Hey'] }],
  ]);
});

test('broadcast read, cancel and automation logs routes', async () => {
  const { calls, call } = setup();
  await call('get_social_broadcast', { broadcast_id: ID });
  await call('get_social_broadcast', { account_id: ID });
  await call('cancel_social_broadcast', { broadcast_id: ID });
  await call('get_social_automation_logs', { automation_id: ID, days: 30 });
  assert.deepEqual(calls.map((c) => c[0] + ' ' + c[1]), [
    `GET /v1/social/broadcasts/${ID}`, `GET /v1/social/broadcasts?account_id=${ID}`,
    `POST /v1/social/broadcasts/${ID}/cancel`, `GET /v1/social/automations/${ID}/logs?days=30`,
  ]);
});

test('v2 trigger, step and automation fields', () => {
  const { valid } = setup();
  const ok = (extra) => valid('create_social_automation', { account_id: ID, ...extra });
  assert.ok(ok({ trigger: { type: 'comment_keyword', keywords: ['guide'], match: 'word', exclude_keywords: ['spam'], typo_tolerance: true },
    steps: [{ type: 'send_dm', text: 'a', variations: ['b', 'c', 'd', 'e'] }, { type: 'like_comment' }],
    repeat_policy: 'once_per_post', link_tracking: { enabled: true, click_tag: 'guide-click', utm_campaign: 'bf.2026' } }));
  assert.ok(!ok({ steps: [{ type: 'send_dm', text: 'a', variations: ['b', 'c', 'd', 'e', 'f'] }] }));
  assert.ok(!ok({ repeat_policy: 'once_per_day', steps: [{ type: 'like_comment' }] }));
  assert.ok(!ok({ link_tracking: { utm_campaign: 'has space' }, steps: [{ type: 'like_comment' }] }));
  assert.ok(!ok({ link_tracking: { click_tag: 'a$' }, steps: [{ type: 'like_comment' }] }));
  assert.ok(!valid('get_social_automation_logs', { automation_id: ID, days: 31 }));
  assert.ok(!valid('create_social_broadcast', { account_id: ID, text: 'x', tags: Array(11).fill('t') }));
});

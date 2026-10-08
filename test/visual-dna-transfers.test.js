const test = require('node:test');
const assert = require('node:assert/strict');
const { registerVisualDnaTools } = require('../src/tools/visual_dna');

test('DNA transfer tools preserve explicit move choice, filter inventory and encode response ids', async () => {
  const tools = new Map();
  const calls = [];
  const client = Object.fromEntries(['get', 'post', 'delete'].map(method => [method, async (...args) => {
    calls.push([method, ...args]);
    return { transfer: { id: 'transfer' }, transfers: [] };
  }]));
  registerVisualDnaTools({ tool(name, description, schema, handler) { tools.set(name, { schema, handler }); } }, client);
  await tools.get('transfer_visual_dna').handler({ visual_dna_ids: ['owned'], email: 'recipient@example.com', keep_sender_copy: false });
  assert.deepEqual(calls.pop(), ['post', '/v1/visual-dna-transfers', { visual_dna_ids: ['owned'], email: 'recipient@example.com', keep_sender_copy: false }]);
  await tools.get('list_visual_dna_transfers').handler({ direction: 'outgoing', status: 'pending' });
  assert.deepEqual(calls.pop(), ['get', '/v1/visual-dna-transfers?direction=outgoing&status=pending']);
  for (const action of ['accept', 'decline', 'cancel']) {
    await tools.get('respond_visual_dna_transfer').handler({ transfer_id: 'id/with?reserved', action });
    assert.deepEqual(calls.pop(), action === 'cancel'
      ? ['delete', '/v1/visual-dna-transfers/id%2Fwith%3Freserved']
      : ['post', `/v1/visual-dna-transfers/id%2Fwith%3Freserved/${action}`, {}]);
  }
  assert.equal(tools.get('respond_visual_dna_transfer').schema.action.safeParse('delete').success, false);
  assert.equal(tools.get('transfer_visual_dna').schema.visual_dna_ids.safeParse([]).success, false);
});

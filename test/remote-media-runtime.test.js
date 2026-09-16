const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns').promises;
const { Agent, MockAgent } = require('undici/index.js');
const { safeFetch, resolveToBuffer } = require('../src/tools/_shared');
const { registerVisualDnaTools } = require('../src/tools/visual_dna');

// Node network fixtures. Packaged Bun is checked separately with a real public
// download: its MockAgent stream behavior differs. No customer API writes here.
async function network(run) {
  const lookup = dns.lookup;
  const dispatch = Agent.prototype.dispatch;
  const close = Agent.prototype.close;
  const agent = new Agent();
  agent.dispatch = dispatch.bind(agent);
  const mock = new MockAgent({ agent });
  mock.disableNetConnect();
  dns.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  Agent.prototype.dispatch = function (opts, handler) { return mock.dispatch(opts, handler); };
  try { await run(mock); }
  finally {
    dns.lookup = lookup;
    Agent.prototype.dispatch = dispatch;
    Agent.prototype.close = close;
    await mock.close();
  }
}

test('installed Agent implements dispatch and close under the desktop Bun runtime', async () => {
  const agent = new Agent();
  assert.equal(typeof agent.dispatch, 'function');
  assert.equal(typeof agent.close, 'function');
  await agent.close();
});

test('public URL resolves into a buffer, including a public redirect', () => network(async (mock) => {
  const pool = mock.get('https://media.example.com');
  pool.intercept({ path: '/redirect' }).reply(302, '', { headers: { location: '/sheet.png' } });
  pool.intercept({ path: '/sheet.png' }).reply(200, 'sheet', { headers: { 'content-type': 'image/png' } });
  const result = await resolveToBuffer('https://media.example.com/redirect', 'image');
  assert.equal(result.buffer.toString(), 'sheet');
  assert.equal(result.contentType, 'image/png');
}));

test('redirects to private literals and private DNS remain blocked', () => network(async (mock) => {
  const pool = mock.get('https://media.example.com');
  pool.intercept({ path: '/literal' }).reply(302, '', { headers: { location: 'http://127.0.0.1/secret' } });
  await assert.rejects(safeFetch('https://media.example.com/literal'), /private/);
  pool.intercept({ path: '/dns' }).reply(302, '', { headers: { location: 'https://private.example.com/secret' } });
  dns.lookup = async (host) => [{ address: host === 'private.example.com' ? '10.0.0.1' : '93.184.216.34', family: 4 }];
  await assert.rejects(safeFetch('https://media.example.com/dns'), /private/);
}));

test('cleanup failure cannot replace the original download failure', () => network(async (mock) => {
  mock.get('https://media.example.com').intercept({ path: '/fail' }).replyWithError(new Error('download failed'));
  Agent.prototype.close = () => { throw new Error('cleanup failed'); };
  await assert.rejects(safeFetch('https://media.example.com/fail'), (err) => {
    assert.match(String(err.cause || err), /download failed/);
    return true;
  });
}));

test('DNA creation submits downloaded references once; failed preparation never submits', () => network(async (mock) => {
  const handlers = {};
  let submitted = 0;
  registerVisualDnaTools({ tool(name, description, schema, handler) { handlers[name] = handler; } }, {
    async postMultipart(route, form) {
      submitted++;
      assert.equal(route, '/v1/visual-dna');
      assert.match(form.getBuffer().toString(), /sheet-content/);
      return { visual_dna: { id: 'created', name: 'רונית_חליפה_1', dna_type: 'character' } };
    },
  });
  mock.get('https://media.example.com').intercept({ path: '/sheet.png' }).reply(200, 'sheet-content');
  const result = await handlers.create_visual_dna({ name: 'רונית_חליפה_1', dna_type: 'character', images: ['https://media.example.com/sheet.png'] });
  assert.equal(JSON.parse(result.content[0].text).id, 'created');
  assert.equal(submitted, 1);
  await assert.rejects(handlers.create_visual_dna({ name: 'other', images: ['http://127.0.0.1/private.png'] }), /before submission; this attempt did not create a profile/);
  assert.equal(submitted, 1);
}));

test('Bun transport pins IPs, preserves Host/SNI, enforces TLS and revalidates redirects', async () => {
  const original = Object.getOwnPropertyDescriptor(process.versions, 'bun');
  const lookup = dns.lookup;
  const native = global.fetch;
  const calls = [];
  Object.defineProperty(process.versions, 'bun', { value: 'runtime-test', configurable: true });
  dns.lookup = async (host) => [{ address: host === 'private.example.com' ? '10.0.0.1' : '93.184.216.34', family: 4 }];
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return new Response(null, { status: 302, headers: { location: 'https://private.example.com/secret' } });
  };
  try {
    await assert.rejects(safeFetch('https://media.example.com:8443/ref.png?x=1'), /private/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://93.184.216.34:8443/ref.png?x=1');
    assert.equal(calls[0].opts.headers.Host, 'media.example.com:8443');
    assert.equal(calls[0].opts.tls.serverName, 'media.example.com');
    assert.equal(calls[0].opts.tls.rejectUnauthorized, true);
    assert.equal(calls[0].opts.redirect, 'manual');
    assert.equal(calls[0].opts.proxy, '');
  } finally {
    global.fetch = native;
    dns.lookup = lookup;
    if (original) Object.defineProperty(process.versions, 'bun', original);
    else delete process.versions.bun;
  }
});

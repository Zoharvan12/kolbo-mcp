const test = require('node:test');
const assert = require('node:assert/strict');

const KolboClient = require('../src/client');
const progress = require('../src/progress');
const { pollOrTimedOut } = require('../src/tools/_shared');

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => data,
  };
}

test('poll timeout does NOT cancel the generation', async (t) => {
  const requests = [];
  let statusCallCount = 0;
  
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url, options, timestamp: Date.now() });
    
    if (url.endsWith('/v1/generate/image')) {
      return jsonResponse({ 
        success: true, 
        generation_id: 'gen-timeout-test',
        poll_interval_hint: 1 // 1 second for fast test
      });
    }
    
    if (url.includes('/v1/generate/gen-timeout-test/status')) {
      statusCallCount++;
      // Return processing for all status checks (simulating a slow generation)
      return jsonResponse({ 
        state: 'processing',
        generation_id: 'gen-timeout-test'
      });
    }
    
    if (url.endsWith('/v1/generate/gen-timeout-test/cancel')) {
      throw new Error('Generation should NOT be cancelled on poll timeout');
    }
    
    throw new Error(`Unexpected request: ${url}`);
  });

  const controller = new AbortController();
  const client = new KolboClient({ apiKey: 'test-key', apiBase: 'https://example.test/api' });

  const result = await progress.run({ signal: controller.signal }, async () => {
    const gen = await client.post('/v1/generate/image', { prompt: 'test' });
    
    // Poll with a short timeout (2 seconds) to simulate timeout
    const poll = await pollOrTimedOut(client, gen.generation_id, {
      interval: 500,
      timeout: 2000
    });
    
    // Should return a timeout result, not throw
    assert.ok(poll.timedOut, 'Should return timedOut result');
    assert.equal(poll.timedOut.content[0].type, 'text');
    const parsed = JSON.parse(poll.timedOut.content[0].text);
    assert.equal(parsed.state, 'processing');
    assert.equal(parsed.generation_id, 'gen-timeout-test');
    assert.equal(parsed._timed_out, true);
    assert.ok(parsed._hint.includes('get_generation_status'));
    
    // Now abort the signal (simulating host killing the tool call)
    controller.abort();
    await new Promise(resolve => setImmediate(resolve));
    
    return poll;
  });

  // Verify the generation was NOT cancelled
  const cancelRequests = requests.filter(r => r.url.includes('/cancel'));
  assert.equal(cancelRequests.length, 0, 'No cancel requests should be made');
  
  // Verify we made status requests (polling happened)
  assert.ok(statusCallCount > 0, 'Should have polled status at least once');
});

test('regular abort (before timeout) still cancels the generation', async (t) => {
  const requests = [];
  
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url, options });
    
    if (url.endsWith('/v1/generate/image')) {
      return jsonResponse({ 
        success: true, 
        generation_id: 'gen-abort-test'
      });
    }
    
    if (url.includes('/v1/generate/gen-abort-test/status')) {
      // Slow response to give us time to abort
      await new Promise(resolve => setTimeout(resolve, 100));
      return jsonResponse({ 
        state: 'processing',
        generation_id: 'gen-abort-test'
      });
    }
    
    if (url.endsWith('/v1/generate/gen-abort-test/cancel')) {
      return jsonResponse({ 
        success: true, 
        generation_id: 'gen-abort-test',
        state: 'cancelled'
      });
    }
    
    throw new Error(`Unexpected request: ${url}`);
  });

  const controller = new AbortController();
  const client = new KolboClient({ apiKey: 'test-key', apiBase: 'https://example.test/api' });

  await progress.run({ signal: controller.signal }, async () => {
    await client.post('/v1/generate/image', { prompt: 'test' });
    
    // Abort immediately (before any polling timeout)
    controller.abort();
    await new Promise(resolve => setImmediate(resolve));
  });

  // Verify the generation WAS cancelled (because we aborted before timeout)
  const cancelRequests = requests.filter(r => r.url.includes('/cancel'));
  assert.equal(cancelRequests.length, 1, 'Should have made exactly one cancel request');
});

test('batch prompts that timeout are untracked individually', async (t) => {
  const requests = [];
  
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url, options });
    
    if (url.endsWith('/v1/generate/image')) {
      // Return unique IDs for each submit
      const submitCount = requests.filter(r => r.url.endsWith('/v1/generate/image')).length;
      return jsonResponse({ 
        success: true, 
        generation_id: `gen-batch-${submitCount}`,
        poll_interval_hint: 1
      });
    }
    
    if (url.includes('/status')) {
      // All status checks return processing (simulating slow generations)
      const id = url.match(/gen-batch-\d+/)[0];
      return jsonResponse({ 
        state: 'processing',
        generation_id: id
      });
    }
    
    if (url.includes('/cancel')) {
      throw new Error('No generations should be cancelled on batch timeout');
    }
    
    throw new Error(`Unexpected request: ${url}`);
  });

  const controller = new AbortController();
  const client = new KolboClient({ apiKey: 'test-key', apiBase: 'https://example.test/api' });

  await progress.run({ signal: controller.signal }, async () => {
    // Submit 3 generations
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const gen = await client.post('/v1/generate/image', { prompt: `test ${i}` });
      ids.push(gen.generation_id);
    }
    
    // Poll all with short timeout
    const polls = await Promise.all(
      ids.map(id => pollOrTimedOut(client, id, { interval: 500, timeout: 2000 }))
    );
    
    // All should timeout
    assert.equal(polls.filter(p => p.timedOut).length, 3, 'All 3 should timeout');
    
    // Now abort the signal
    controller.abort();
    await new Promise(resolve => setImmediate(resolve));
  });

  // Verify no cancel requests were made
  const cancelRequests = requests.filter(r => r.url.includes('/cancel'));
  assert.equal(cancelRequests.length, 0, 'No cancel requests should be made for batch timeout');
});

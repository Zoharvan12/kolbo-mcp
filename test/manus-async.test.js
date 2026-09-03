'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('dns').promises;
const { asyncGenerating, attachFileInputHints, resolveToBuffer, safeFetch, readResponseBuffer } = require('../src/tools/_shared');

test('Manus async result returns a task id and status contract without widget metadata', () => {
  const result = asyncGenerating({
    tool: 'generate_image',
    kind: 'image',
    gen: { generation_id: 'gen_123', session_id: 'session_123' },
  });

  assert.equal(result.structuredContent.status, 'submitted');
  assert.equal(result.structuredContent.poll_tool, 'get_generation_status');
  assert.deepEqual(result.structuredContent.status_args, {
    generation_id: 'gen_123',
    wait: false,
  });
  assert.equal('_meta' in result, false);
  assert.doesNotMatch(result.content[0].text, /widget|card above/i);
});

test('Manus async batch keeps every generation id in one status call', () => {
  const result = asyncGenerating({
    gen: { generation_id: 'gen_1', session_id: 'session_1' },
    generation_ids: ['gen_1', 'gen_2'],
    failed_submissions: [{ prompt: 'third', error: 'rejected' }],
  });

  assert.equal(result.structuredContent.batch, true);
  assert.deepEqual(result.structuredContent.status_args, {
    generation_ids: ['gen_1', 'gen_2'],
    wait: false,
  });
  assert.equal(result.structuredContent.failed_submissions.length, 1);
});

test('Manus overrides widget waits and names a custom status tool correctly', () => {
  const result = asyncGenerating({
    gen: { generation_id: 'director_1' },
    poll_tool: 'get_creative_director_status',
    status_args: { generation_id: 'director_1', wait: true },
  });

  assert.deepEqual(result.structuredContent.status_args, {
    generation_id: 'director_1',
    wait: false,
  });
  assert.match(result.structuredContent.next_action, /get_creative_director_status/);
  assert.doesNotMatch(result.structuredContent.next_action, /call get_generation_status/);
});

test('Manus media tools never claim browser-local paths or widgets are usable', () => {
  const server = {
    _registeredTools: {
      generate_image: { description: 'Generate an image.' },
    },
  };
  attachFileInputHints(server, { remote: true, asyncGenerations: true });
  const description = server._registeredTools.generate_image.description;

  assert.match(description, /public https:\/\//i);
  assert.match(description, /Kolbo Media Library/i);
  assert.doesNotMatch(description, /absolute local paths work/i);
  assert.doesNotMatch(description, /call `media_upload_widget`/i);
});

test('remote MCP mode cannot read files from the API host filesystem', async () => {
  await assert.rejects(
    resolveToBuffer('C:\\Windows\\win.ini', 'image', { allowLocalFiles: false }),
    /public https:\/\/ URLs only/i,
  );
});

test('remote URL fetch rejects a public hostname that resolves to a private address', async () => {
  const originalLookup = dns.lookup;
  dns.lookup = async () => [{ address: '127.0.0.1', family: 4 }];
  try {
    await assert.rejects(
      safeFetch('https://public-looking.example/file.png'),
      /private \/ loopback \/ metadata DNS target/i,
    );
  } finally {
    dns.lookup = originalLookup;
  }
});

test('remote response reader stops chunked bodies at the byte limit', async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8));
      controller.enqueue(new Uint8Array(8));
      controller.close();
    },
  }));

  await assert.rejects(readResponseBuffer(response, 10), /exceeds 10-byte limit/i);
});

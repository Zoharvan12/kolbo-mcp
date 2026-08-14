#!/usr/bin/env node
/**
 * smoke.js — simulate a real `npx -y @kolbo/mcp` install and boot the server.
 *
 * Why this is painful instead of `require('../src/index.js')`:
 *   The dev node_modules is pinned by the lockfile, so it hides exactly the
 *   bug class we were burned by in 1.2.0 — the SDK dep was declared with
 *   `^1.26.0`, locally resolved to 1.26.0, smoke passed, but `npx` resolved
 *   to 1.29.0 on users' machines and exploded on `server.tool()` because
 *   the schema shape had been broken by an SDK bump. Dev was fine, prod was
 *   dead. The only test that catches that is a FRESH install.
 *
 * What this does:
 *   1. `npm pack` — build the exact tarball that would be published.
 *   2. Extract it into a temp dir.
 *   3. `npm install --omit=dev` in that temp dir — fresh resolution, no
 *      lockfile, no dev deps. This is what `npx` does under the hood.
 *   4. Boot the server with a dummy key + stdin closed, wait for it to
 *      either fail (bad) or start blocking on stdin (good — registration
 *      succeeded and it's now waiting for the MCP transport).
 *   5. Kill it, clean up, report.
 *
 * Runs as `prepublishOnly`, so a broken install CANNOT ship.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PKG_ROOT = path.resolve(__dirname, '..');
const BOOT_WAIT_MS = 4000; // how long to wait for the server to prove it's alive

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', ...opts });
  if (res.status !== 0) {
    const out = (res.stdout || '').toString();
    const err = (res.stderr || '').toString();
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${res.status})\nstdout:\n${out}\nstderr:\n${err}`);
  }
  return (res.stdout || '').toString();
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
}

async function main() {
  // 0a. Host detection must cover both the standard MCP Apps capability and
  // Codex Desktop's current compatibility handshake, without turning Codex
  // CLI (a text surface) into an async widget client.
  {
    const { appsEnabled } = require(path.join(PKG_ROOT, 'src', 'apps'));
    const previousOverride = process.env.KOLBO_MCP_APPS;
    const previousOrigin = process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE;
    const mockServer = (caps, info) => ({ server: {
      getClientCapabilities: () => caps,
      getClientVersion: () => info,
    } });
    try {
      delete process.env.KOLBO_MCP_APPS;
      delete process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE;
      if (!appsEnabled(mockServer({ extensions: { 'io.modelcontextprotocol/ui': {} } }, { name: 'standard-host' }))) {
        throw new Error('standard MCP Apps capability was not detected');
      }
      process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = 'Codex Desktop';
      if (!appsEnabled(mockServer({}, { name: 'codex-mcp-client', title: 'Codex' }))) {
        throw new Error('Codex Desktop compatibility host was not detected');
      }
      process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = 'Codex CLI';
      if (appsEnabled(mockServer({}, { name: 'codex-mcp-client', title: 'Codex' }))) {
        throw new Error('Codex CLI was incorrectly treated as a widget host');
      }
      process.env.KOLBO_MCP_APPS = '0';
      process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = 'Codex Desktop';
      if (appsEnabled(mockServer({}, { name: 'codex-mcp-client', title: 'Codex' }))) {
        throw new Error('KOLBO_MCP_APPS=0 did not override host detection');
      }
    } finally {
      if (previousOverride === undefined) delete process.env.KOLBO_MCP_APPS;
      else process.env.KOLBO_MCP_APPS = previousOverride;
      if (previousOrigin === undefined) delete process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE;
      else process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = previousOrigin;
    }
    console.log('[smoke] MCP Apps host detection OK');
  }

  // 0b. A real Codex Desktop generation must return the submitted widget
  // contract immediately and must not enter the blocking status poll.
  {
    const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerGenerateTools } = require(path.join(PKG_ROOT, 'src', 'tools', 'generate'));
    const previousOrigin = process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE;
    const previousOverride = process.env.KOLBO_MCP_APPS;
    const server = new McpServer({ name: 'apps-smoke', version: '1.0.0' });
    server.server._clientVersion = { name: 'codex-mcp-client', title: 'Codex', version: 'smoke' };
    server.server._clientCapabilities = {};
    const statusReads = [];
    let allowStatusReads = false;
    const client = {
      apiBase: 'smoke',
      post: async (url) => ({ generation_id: url.includes('creative-director') ? 'director-1' : 'video-1', session_id: 'session-1' }),
      get: async (url) => {
        if (url === '/v1/models') return { models: [] };
        statusReads.push(url);
        if (allowStatusReads) {
          if (url.includes('/creative-director/')) {
            return { state: 'completed', scenes: [{ scene_number: 1, status: 'completed', image_urls: ['https://cdn.example/scene.png'] }] };
          }
          return { state: 'completed', result: { urls: ['https://cdn.example/video.mp4'] } };
        }
        throw new Error(`unexpected blocking status read: ${url}`);
      },
    };
    try {
      delete process.env.KOLBO_MCP_APPS;
      process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = 'Codex Desktop';
      registerGenerateTools(server, client, {});
      const video = await server._registeredTools.generate_video.handler({ prompt: 'smoke video', model: 'seedance-2' });
      const director = await server._registeredTools.generate_creative_director.handler({ prompt: 'smoke scenes', scene_count: 4, model: 'z-image/turbo' });
      const music = await server._registeredTools.generate_music.handler({ prompt: 'smoke music', model: 'suno-v5.5' });
      const speech = await server._registeredTools.generate_speech.handler({ text: 'smoke speech', model: 'eleven_v3' });
      const sound = await server._registeredTools.generate_sound.handler({ prompt: 'smoke sound', model: 'elevenlabs-sound-effects-v1' });
      if (video.structuredContent?.phase !== 'generating' || video.structuredContent?.generation_id !== 'video-1') {
        throw new Error('Codex video did not return the submitted widget contract');
      }
      if (video.structuredContent?.status_args?.wait !== true) {
        throw new Error('Codex video widget did not use the long-wait status contract');
      }
      if (director.structuredContent?.phase !== 'generating' || director.structuredContent?.poll_tool !== 'get_creative_director_status') {
        throw new Error('Codex Creative Director did not return the async widget contract');
      }
      if (director.structuredContent?.status_args?.wait !== true) {
        throw new Error('Codex Creative Director widget did not use the long-wait status contract');
      }
      for (const [name, result] of [['music', music], ['speech', speech], ['sound', sound]]) {
        if (result.structuredContent?.phase !== 'generating' ||
            result.structuredContent?.kind !== 'audio' ||
            result.structuredContent?.status_args?.wait !== true) {
          throw new Error(`Codex ${name} did not return the async audio-widget contract`);
        }
      }
      if (statusReads.length) throw new Error(`Codex widget path performed blocking status reads: ${statusReads.join(', ')}`);
      allowStatusReads = true;
      const videoStatus = await server._registeredTools.get_generation_status.handler({ generation_id: 'video-1', wait: true });
      const directorStatus = await server._registeredTools.get_creative_director_status.handler({ generation_id: 'director-1', wait: true });
      const videoStatusJson = JSON.parse(videoStatus.content[0].text);
      const directorStatusJson = JSON.parse(directorStatus.content[0].text);
      if (videoStatusJson.state !== 'completed' || directorStatusJson.state !== 'completed') {
        throw new Error('Long-wait status tools did not return terminal results');
      }
    } finally {
      if (previousOverride === undefined) delete process.env.KOLBO_MCP_APPS;
      else process.env.KOLBO_MCP_APPS = previousOverride;
      if (previousOrigin === undefined) delete process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE;
      else process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = previousOrigin;
    }
    console.log('[smoke] Codex async generation contracts OK');
  }

  // 0c-bis. get_generation_status with wait=true must OUTLIVE nothing — it must
  // fit INSIDE the transport. The old flat 180s window was longer than every hop
  // in front of the remote connector, so a 185s music generation made wait=true
  // fail with "the connector's server isn't responding" every single time, on a
  // perfectly healthy paid generation. Two things must stay true forever:
  //   1. the remote window + result assembly fits under the tightest hop, and
  //   2. a generation that outlives the window comes back as a RESULT that tells
  //      the caller to call again — never a thrown error, and never the old
  //      "call it ONCE with wait=true" advice, which is what broke.
  {
    const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerGenerateTools } = require(path.join(PKG_ROOT, 'src', 'tools', 'generate'));
    const {
      waitWindowMs, TRANSPORT_CEILING_MS, RESULT_ASSEMBLY_BUDGET_MS,
    } = require(path.join(PKG_ROOT, 'src', 'polling'));

    const remote = waitWindowMs({ apps: true });
    if (remote + RESULT_ASSEMBLY_BUDGET_MS > TRANSPORT_CEILING_MS) {
      throw new Error(
        `remote wait window ${remote}ms + ${RESULT_ASSEMBLY_BUDGET_MS}ms assembly exceeds the ` +
        `${TRANSPORT_CEILING_MS}ms transport ceiling — wait=true will fail with a transport error`
      );
    }

    const previousWait = process.env.KOLBO_MCP_WAIT_MS;
    process.env.KOLBO_MCP_WAIT_MS = '900'; // keep the gate fast; behaviour is identical
    try {
      const server = new McpServer({ name: 'wait-smoke', version: '1.0.0' });
      const client = {
        apiBase: 'smoke',
        // A generation that NEVER finishes — exactly the 185s music case.
        get: async (url) => (url === '/v1/models' ? { models: [] } : { state: 'processing', progress: 52 }),
        post: async () => ({ generation_id: 'never-1' }),
      };
      registerGenerateTools(server, client, { apps: true });

      const started = Date.now();
      const res = await server._registeredTools.get_generation_status.handler(
        { generation_ids: ['never-1', 'never-2'], wait: true }
      );
      const elapsed = Date.now() - started;
      // Must land at ~the window, NOT a whole poll interval past it — the loop
      // used to oversleep its own deadline, which is how a window sized to fit
      // the transport still overshot it.
      if (elapsed > 5000) throw new Error(`wait=true blocked ${elapsed}ms for a 900ms window — deadline overshot`);
      if (res.isError) throw new Error('wait=true surfaced an ERROR for a still-running generation');

      const json = JSON.parse(res.content[0].text);
      if (json.all_done !== false || json.still_processing.length !== 2) {
        throw new Error('wait=true did not report the still-running generations as a normal result');
      }
      // The exact advice that broke: one call, blocking until finished.
      if (/\bONCE\b/.test(json._hint) || /block until (they|it) finish/i.test(json._hint)) {
        throw new Error(`_hint still tells the caller to make a single blocking call: ${json._hint}`);
      }
      if (!/again/i.test(json._hint) || !/wait=true/.test(json._hint)) {
        throw new Error(`_hint does not tell the caller to re-issue wait=true: ${json._hint}`);
      }

      // Single-id shape keeps the same contract (the widget reads this one).
      const single = JSON.parse(
        (await server._registeredTools.get_generation_status.handler({ generation_id: 'never-1', wait: true }))
          .content[0].text
      );
      if (single.state !== 'processing' || !/again/i.test(single._hint)) {
        throw new Error('single-id wait=true did not return a re-issuable processing result');
      }
    } finally {
      if (previousWait === undefined) delete process.env.KOLBO_MCP_WAIT_MS;
      else process.env.KOLBO_MCP_WAIT_MS = previousWait;
    }
    console.log('[smoke] get_generation_status wait window fits the transport OK');
  }

  // 0d. A prompts[] batch over the cap must be REJECTED, never truncated. This
  // used to `.slice(0, 8)`: a 9-prompt call quietly produced 8 generations, no
  // error, no warning — the caller only noticed by counting the results.
  {
    const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerGenerateTools } = require(path.join(PKG_ROOT, 'src', 'tools', 'generate'));
    const submitted = [];
    const client = {
      apiBase: 'smoke',
      post: async (_url, body) => { submitted.push(body); return { generation_id: `img-${submitted.length}` }; },
      get: async (url) => (url === '/v1/models'
        ? { models: [] }
        : { state: 'completed', result: { urls: ['https://cdn.example/i.png'] } }),
    };
    const server = new McpServer({ name: 'batch-smoke', version: '1.0.0' });
    registerGenerateTools(server, client, {});
    const call = (n) => server._registeredTools.generate_image.handler({
      prompts: Array.from({ length: n }, (_, i) => `smoke prompt ${i + 1}`),
      model: 'z-image/turbo',
    });
    await call(9).then(
      () => { throw new Error('9 prompts were accepted — the batch cap is silently truncating again'); },
      (err) => {
        if (!/\b9\b/.test(err.message) || !/\b8\b/.test(err.message)) {
          throw new Error(`over-cap rejection must name the received count and the cap, got: ${err.message}`);
        }
      }
    );
    if (submitted.length) throw new Error(`a rejected batch still submitted ${submitted.length} generations`);
    await call(8);
    if (submitted.length !== 8) throw new Error(`an at-cap batch submitted ${submitted.length}/8 prompts`);

    // generate_video_from_image's items[] batch routes through the SAME guard,
    // but each item carries its own image_url next to its own prompt. Assert
    // both the cap AND the pairing — a fan-out that shuffles image against
    // prompt animates the right count of the wrong shots, and looks fine.
    submitted.length = 0;
    const frame = (i) => `https://cdn.example/frame-${i + 1}.png`;
    const animate = (n) => server._registeredTools.generate_video_from_image.handler({
      items: Array.from({ length: n }, (_, i) => ({ image_url: frame(i), prompt: `motion ${i + 1}` })),
      model: 'kling-video/v3/pro/image-to-video',
    });
    await animate(9).then(
      () => { throw new Error('9 items were accepted — the image-to-video batch cap is silently truncating'); },
      (err) => {
        if (!/\b9\b/.test(err.message) || !/\b8\b/.test(err.message)) {
          throw new Error(`over-cap items[] rejection must name the received count and the cap, got: ${err.message}`);
        }
      }
    );
    if (submitted.length) throw new Error(`a rejected items[] batch still submitted ${submitted.length} generations`);
    await animate(8);
    if (submitted.length !== 8) throw new Error(`an at-cap items[] batch submitted ${submitted.length}/8 clips`);
    submitted.forEach((body, i) => {
      if (body.image_url !== frame(i) || body.prompt !== `motion ${i + 1}`) {
        throw new Error(`items[] batch clip ${i + 1} lost its image/prompt pairing: ${JSON.stringify(body)}`);
      }
    });
    // The single-item form must still work untouched (additive change).
    submitted.length = 0;
    await server._registeredTools.generate_video_from_image.handler({
      image_url: frame(0), prompt: 'motion 1', model: 'kling-video/v3/pro/image-to-video',
    });
    if (submitted.length !== 1 || submitted[0].image_url !== frame(0)) {
      throw new Error('single-image generate_video_from_image regressed when items[] was added');
    }
    console.log('[smoke] prompts[] + items[] batch caps reject instead of truncating OK');
  }

  // 0e. A requested preset must survive the public tool contract and reach the
  // API body. This guards both creation and editing: the latter historically
  // had no preset_id field, so a host could acknowledge the request and then
  // silently submit an unstyled edit.
  {
    const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerGenerateTools } = require(path.join(PKG_ROOT, 'src', 'tools', 'generate'));
    const sent = [];
    const client = {
      apiBase: 'smoke',
      post: async (url, body) => {
        sent.push({ url, body });
        return { generation_id: `preset-${sent.length}`, session_id: 'preset-session' };
      },
      get: async (url) => (url === '/v1/models' ? { models: [] } : { state: 'processing' }),
    };
    const server = new McpServer({ name: 'preset-smoke', version: '1.0.0' });
    registerGenerateTools(server, client, { apps: true });

    if (!server._registeredTools.generate_image.inputSchema.shape.preset_id) {
      throw new Error('generate_image schema lost preset_id');
    }
    if (!server._registeredTools.generate_image_edit.inputSchema.shape.preset_id) {
      throw new Error('generate_image_edit schema does not expose preset_id');
    }

    await server._registeredTools.generate_image.handler({
      prompt: 'preset image', model: 'z-image/turbo', preset_id: 'image-preset-1',
    });
    await server._registeredTools.generate_image_edit.handler({
      prompt: 'preset edit', source_images: ['https://cdn.example/source.png'],
      model: 'z-image/turbo', preset_id: 'edit-preset-1',
    });

    if (sent[0]?.url !== '/v1/generate/image' || sent[0]?.body?.preset_id !== 'image-preset-1') {
      throw new Error(`generate_image dropped preset_id: ${JSON.stringify(sent[0])}`);
    }
    if (sent[1]?.url !== '/v1/generate/image-edit' || sent[1]?.body?.preset_id !== 'edit-preset-1') {
      throw new Error(`generate_image_edit dropped preset_id: ${JSON.stringify(sent[1])}`);
    }
    console.log('[smoke] image creation + editing preset_id contracts OK');
  }

  // 0f. `session_id` must survive the round trip on every single-output
  // generation tool: into the request body, and back out of the result. This is
  // the ONLY deterministic way an agent groups a related set — the server's
  // daily-session bucket keys on the session NAME, which the generation
  // controllers rename after the first generation, so it stops matching and
  // each further call opens a fresh session (12 clips → 12 sessions).
  {
    const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerGenerateTools } = require(path.join(PKG_ROOT, 'src', 'tools', 'generate'));
    const SESSION = 'sess-abc123';
    const sent = [];
    const client = {
      apiBase: 'smoke',
      post: async (url, body) => { sent.push({ url, body }); return { generation_id: 'gen-1', session_id: SESSION }; },
      postMultipart: async (url, form) => {
        // form-data exposes the serialized body; assert the field made it in.
        sent.push({ url, body: { session_id: form.getBuffer().toString().includes('name="session_id"') ? SESSION : undefined } });
        return { generation_id: 'gen-1', session_id: SESSION };
      },
      get: async (url) => (url === '/v1/models'
        ? { models: [] }
        : { state: 'completed', result: { urls: ['https://cdn.example/a.mp4'] } }),
    };
    const server = new McpServer({ name: 'session-smoke', version: '1.0.0' });
    registerGenerateTools(server, client, {});
    const cases = [
      ['generate_image', { prompt: 'p', model: 'z-image/turbo' }],
      ['generate_image_edit', { prompt: 'p', source_images: ['https://cdn.example/a.png'], model: 'z-image/turbo' }],
      ['generate_video', { prompt: 'p', model: 'seedance-2' }],
      ['generate_video_from_image', { image_url: 'https://cdn.example/a.png', prompt: 'p', model: 'seedance-2' }],
      ['generate_music', { prompt: 'p' }],
      ['generate_speech', { text: 'p' }],
      ['generate_sound', { prompt: 'p' }],
      ['generate_elements', { prompt: 'p', reference_images: ['https://cdn.example/a.png'] }],
      ['generate_first_last_frame', { first_frame_url: 'https://cdn.example/a.png', last_frame_url: 'https://cdn.example/b.png' }],
      ['generate_lipsync', { source: 'https://cdn.example/a.png', audio: 'https://cdn.example/a.mp3' }],
      ['generate_video_from_video', { source_video: 'https://cdn.example/a.mp4', prompt: 'p' }],
      ['transcribe_audio', { source: 'https://cdn.example/a.mp3' }],
      ['edit_image', { image_url: 'https://cdn.example/a.png', operation: 'upscale' }],
      ['edit_video', { video_url: 'https://cdn.example/a.mp4', operation: 'upscale' }],
    ];
    for (const [name, args] of cases) {
      const tool = server._registeredTools[name];
      if (!tool) throw new Error(`${name} is not registered`);
      if (!tool.inputSchema?.shape?.session_id) {
        throw new Error(`${name} no longer accepts session_id — an agent cannot group a related set through it`);
      }
      sent.length = 0;
      const result = await tool.handler({ ...args, session_id: SESSION });
      if (!sent.some(r => r.body && r.body.session_id === SESSION)) {
        throw new Error(`${name} dropped session_id on the way to the API`);
      }
      if (JSON.parse(result.content[0].text).session_id !== SESSION) {
        throw new Error(`${name} did not return session_id, so the model cannot thread it to the next call`);
      }
    }
    console.log('[smoke] session_id round-trips on every single-output generation tool OK');
  }

  // 0c. Every media-input tool must carry the transport-correct local-file
  // route in its description. A name that drifts out of FILE_INPUT_TOOLS fails
  // silently, and the tool goes back to promising "absolute local path" over a
  // remote connector — which is what makes the model answer "I can't upload
  // your file" instead of calling the upload tools.
  {
    const { createServer } = require(path.join(PKG_ROOT, 'src', 'index.js'));
    const { FILE_INPUT_TOOLS } = require(path.join(PKG_ROOT, 'src', 'tools', '_shared'));
    const previousKey = process.env.KOLBO_API_KEY;
    process.env.KOLBO_API_KEY = 'kolbo_smoke_dummy';
    try {
      for (const [label, opts, mustSay] of [
        ['remote connector', { apps: true }, 'media_upload_widget'],
        ['stdio install', {}, 'Absolute local paths work here'],
      ]) {
        const tools = createServer(opts)._registeredTools;
        for (const name of FILE_INPUT_TOOLS) {
          if (!tools[name]) throw new Error(`FILE_INPUT_TOOLS lists "${name}", which is not a registered tool`);
          if (!tools[name].description.includes(mustSay)) {
            throw new Error(`${name} is missing the ${label} local-file route in its description`);
          }
        }
      }
    } finally {
      if (previousKey === undefined) delete process.env.KOLBO_API_KEY;
      else process.env.KOLBO_API_KEY = previousKey;
    }
    console.log('[smoke] local-file routing hints attached OK');
  }

  // 0e. A long wait must never go silent on the wire. Without a keepalive the
  // connection carries zero bytes for the whole poll window (up to 3 min on
  // get_generation_status wait=true), and idle-timeout intermediaries — office
  // proxies, VPNs — hang up. The user reports that as "Kolbo disconnected".
  {
    const progress = require(path.join(PKG_ROOT, 'src', 'progress'));
    const { pollUntilDone } = require(path.join(PKG_ROOT, 'src', 'polling'));
    const sent = [];
    const extra = {
      _meta: { progressToken: 'smoke-token' },
      sendNotification: async (n) => { sent.push(n); },
    };
    let calls = 0;
    const client = { get: async () => (++calls < 3 ? { state: 'processing' } : { state: 'completed', result: {} }) };
    await progress.run(extra, () => pollUntilDone(client, 'gen-1', { interval: 1, timeout: 10000 }));
    if (sent.length !== 2) throw new Error(`expected a keepalive per pending poll, got ${sent.length}`);
    const values = sent.map(n => n.params.progress);
    if (values.some((v, i) => i > 0 && v <= values[i - 1])) {
      throw new Error(`progress values must strictly increase, got ${values.join(',')}`);
    }
    // A host that refuses the notification must not fail the generation.
    await progress.run(
      { _meta: { progressToken: 't' }, sendNotification: async () => { throw new Error('host rejected'); } },
      () => pollUntilDone({ get: async () => ({ state: 'processing' }) }, 'gen-2', { interval: 1, timeout: 30 })
    ).then(
      () => { throw new Error('poll should have timed out, not resolved'); },
      (err) => { if (!err.timedOut) throw new Error(`keepalive failure leaked out as: ${err.message}`); }
    );
    console.log('[smoke] long-wait keepalive OK');
  }

  // 0. Widget scripts must PARSE. The widgets are assembled from template
  // literals, where a quoting slip (e.g. \' collapsing to ') ships a widget
  // whose inline <script> is a syntax error → an empty card in claude.ai that
  // no server-side test notices. Caught a real production bug (v1.30.2).
  {
    const { widgetHtml, UI } = require(path.join(PKG_ROOT, 'src', 'apps'));
    for (const uri of Object.values(UI)) {
      const html = widgetHtml(uri);
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
      if (!scripts.length) throw new Error(`widget ${uri} has no inline scripts`);
      scripts.forEach((s, i) => {
        try { new Function(s); } catch (e) {
          throw new Error(`widget ${uri} script #${i} does not parse: ${e.message}`);
        }
      });
    }
    const generationHtml = widgetHtml(UI.generation);
    for (const requiredAudioContract of [
      'class="k-audio-player"',
      'data-audio-download=',
      'preload="metadata"',
      'sc.tracks && sc.tracks[i]',
    ]) {
      if (!generationHtml.includes(requiredAudioContract)) {
        throw new Error(`generation widget is missing audio preview contract: ${requiredAudioContract}`);
      }
    }
    // The card must show WHICH knobs produced the output. `quality` was dropped
    // for months: low/medium/high rendered identical settings blocks even though
    // they billed 4 / 12 / 43 credits. Both halves of that contract are checked —
    // the tool must put it in `settings`, the widget must render it.
    if (!/if \(s\.quality\)/.test(generationHtml)) {
      throw new Error('generation widget no longer renders settings.quality');
    }
    {
      const genSrc = fs.readFileSync(path.join(PKG_ROOT, 'src', 'tools', 'generate.js'), 'utf8');
      if (/settings: \{ resolution, aspect_ratio \}/.test(genSrc)) {
        throw new Error('an image tool is back to the truncated settings block — quality would be dropped from the card');
      }
    }
    console.log('[smoke] widget scripts parse OK');
  }

  // 0c. Generation cards must identify the model and voice by their CLEAN
  // catalog name + icon/portrait, never by the raw id the API round-trips
  // ("google_tts", "he-IL-Chirp3-HD-Rasalgethi"). The lookup is cached: a
  // catalog fetch per generation would put two extra round trips on every
  // submit, on the hot path, for a catalog that changes weekly.
  {
    const { uiGenerating } = require(path.join(PKG_ROOT, 'src', 'tools', '_shared'));
    const { voiceInfo } = require(path.join(PKG_ROOT, 'src', 'apps'));
    const hits = {};
    const client = {
      apiBase: 'smoke',
      async request(_m, p) {
        hits[p] = (hits[p] || 0) + 1;
        if (p === '/v1/models') return { models: [{ identifier: 'google_tts', name: 'Google TTS', avatar: 'google-gemini-icon.svg' }] };
        if (p === '/v1/voices') return { voices: [{ voice_id: 'he-IL-Chirp3-HD-Rasalgethi', name: 'Or', thumbnail: 'https://cdn.example/or.webp' }] };
        throw new Error(`unexpected catalog request ${p}`);
      },
    };
    const voice = await voiceInfo(client, 'he-IL-Chirp3-HD-Rasalgethi');
    if (!voice || voice.name !== 'Or' || !voice.thumbnail) {
      throw new Error('voice lookup no longer resolves name + thumbnail from the catalog');
    }
    if (await voiceInfo(client, 'en-US-Chirp3-HD-Rasalgethi') !== null) {
      throw new Error('voice lookup invented a record for an id the catalog does not have');
    }
    for (let i = 0; i < 3; i++) {
      const sc = (await uiGenerating({
        tool: 'generate_speech', kind: 'audio', client, model: 'google_tts',
        prompt: 'hello', voice, gen: { generation_id: `g${i}` },
      })).structuredContent;
      if (sc.model_name !== 'Google TTS') throw new Error(`model chip shows "${sc.model_name}" instead of the catalog name`);
      if (!sc.model_icon) throw new Error('model chip lost its icon');
      if (sc.voice_name !== 'Or' || !sc.voice_thumbnail) throw new Error('voice chip lost its name/portrait');
    }
    if (hits['/v1/models'] !== 1 || hits['/v1/voices'] !== 1) {
      throw new Error(`catalog lookups are not cached: ${JSON.stringify(hits)}`);
    }
    console.log('[smoke] model/voice display names resolve from the catalog (cached) OK');
  }

  // 0d. Every HTTP request must be bounded. An unbounded fetch is the failure
  // users report as "the tool never finishes": pollUntilDone only checks its
  // deadline BETWEEN polls, so one request that never settles hangs the tool
  // past its declared timeout with no error at all. Assert against a server
  // that accepts the connection and then goes silent — the exact shape of it.
  {
    const http = require('http');
    const srv = http.createServer(() => { /* deliberately never responds */ });
    await new Promise((resolve) => srv.listen(0, resolve));
    const prevUrl = process.env.KOLBO_API_URL;
    const prevKey = process.env.KOLBO_API_KEY;
    const prevTimeout = process.env.KOLBO_HTTP_TIMEOUT_MS;
    try {
      process.env.KOLBO_API_URL = `http://127.0.0.1:${srv.address().port}/api`;
      process.env.KOLBO_API_KEY = 'smoke-dummy';
      process.env.KOLBO_HTTP_TIMEOUT_MS = '1500';
      delete require.cache[require.resolve(path.join(PKG_ROOT, 'src', 'client.js'))];
      const KolboClient = require(path.join(PKG_ROOT, 'src', 'client.js'));
      const client = new KolboClient({ allowBrowserLogin: false });

      const started = Date.now();
      let code = null;
      try { await client.get('/v1/account/credits'); } catch (err) { code = err.code; }
      const elapsed = Date.now() - started;

      if (code !== 'REQUEST_TIMEOUT') {
        throw new Error(`hanging request did not time out cleanly (code=${code}) — src/client.js must bound every fetch`);
      }
      if (elapsed > 10000) {
        throw new Error(`request timeout took ${elapsed}ms — the abort signal is not being applied`);
      }
    } finally {
      srv.close();
      if (prevUrl === undefined) delete process.env.KOLBO_API_URL; else process.env.KOLBO_API_URL = prevUrl;
      if (prevKey === undefined) delete process.env.KOLBO_API_KEY; else process.env.KOLBO_API_KEY = prevKey;
      if (prevTimeout === undefined) delete process.env.KOLBO_HTTP_TIMEOUT_MS; else process.env.KOLBO_HTTP_TIMEOUT_MS = prevTimeout;
      delete require.cache[require.resolve(path.join(PKG_ROOT, 'src', 'client.js'))];
    }
    console.log('[smoke] HTTP requests are timeout-bounded OK');
  }

  // 0f. A rate limit nobody can see is a rate limit every batch trips. Two
  // halves, both real failures we shipped: the ticket must ANNOUNCE the cap so a
  // caller paces before it starts, and a 429 on the upload path must be absorbed
  // once using the server's Retry-After instead of surfacing as a failed upload.
  // Bounded on purpose — one retry, and only for a wait the server named.
  {
    const { registerMediaTools } = require(path.join(PKG_ROOT, 'src', 'tools', 'media.js'));
    const ticketTools = {};
    registerMediaTools(
      { tool: (name, description, schema, handler) => { ticketTools[name] = { description, handler }; } },
      { post: async () => ({ token: 't', upload_url: 'https://api.example/mcp/upload', expires_in: 900, rate_limit: { max_uploads: 40, per_seconds: 60 } }) }
    );
    const ticketTool = ticketTools.create_upload_ticket;
    if (!/rate limit/i.test(ticketTool.description)) {
      throw new Error('create_upload_ticket no longer states the upload rate limit — batch callers cannot pace');
    }
    const payload = JSON.parse((await ticketTool.handler({})).content[0].text);
    if (!payload.rate_limit || payload.rate_limit.max_uploads !== 40) {
      throw new Error('create_upload_ticket response dropped rate_limit — the cap is invisible again');
    }
    if (!/429/.test(payload.how_to_upload.pacing || '')) {
      throw new Error('create_upload_ticket no longer tells the caller what to do with a 429');
    }

    let calls = 0;
    const srv = require('http').createServer((req, res) => {
      calls++;
      if (calls === 1) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '1' });
        return res.end(JSON.stringify({ success: false, error: 'Too many uploads', retry_after_seconds: 1 }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, media: { url: 'https://cdn.example/x.png' } }));
    });
    await new Promise((resolve) => srv.listen(0, resolve));
    const prevUrl = process.env.KOLBO_API_URL;
    const prevKey = process.env.KOLBO_API_KEY;
    try {
      process.env.KOLBO_API_URL = `http://127.0.0.1:${srv.address().port}/api`;
      process.env.KOLBO_API_KEY = 'smoke-dummy';
      delete require.cache[require.resolve(path.join(PKG_ROOT, 'src', 'client.js'))];
      const KolboClient = require(path.join(PKG_ROOT, 'src', 'client.js'));
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', Buffer.from('x'), { filename: 'x.png', contentType: 'image/png' });
      const out = await new KolboClient({ allowBrowserLogin: false }).postMultipart('/v1/media/upload', form);
      if (!out.success || calls !== 2) {
        throw new Error(`upload did not retry once on 429 (calls=${calls}) — src/client.js must honour Retry-After`);
      }
      // ...and exactly once. A second 429 has to surface, not spin.
      calls = 0;
      const always429 = require('http').createServer((req, res) => {
        calls++;
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '1' });
        res.end(JSON.stringify({ success: false, error: 'Too many uploads' }));
      });
      await new Promise((resolve) => always429.listen(0, resolve));
      process.env.KOLBO_API_URL = `http://127.0.0.1:${always429.address().port}/api`;
      delete require.cache[require.resolve(path.join(PKG_ROOT, 'src', 'client.js'))];
      const Client2 = require(path.join(PKG_ROOT, 'src', 'client.js'));
      const form2 = new FormData();
      form2.append('file', Buffer.from('x'), { filename: 'x.png', contentType: 'image/png' });
      let status = null;
      try { await new Client2({ allowBrowserLogin: false }).postMultipart('/v1/media/upload', form2); }
      catch (err) { status = err.status; }
      always429.close();
      if (status !== 429 || calls !== 2) {
        throw new Error(`429 retry is not bounded to one attempt (calls=${calls}, status=${status})`);
      }
    } finally {
      srv.close();
      if (prevUrl === undefined) delete process.env.KOLBO_API_URL; else process.env.KOLBO_API_URL = prevUrl;
      if (prevKey === undefined) delete process.env.KOLBO_API_KEY; else process.env.KOLBO_API_KEY = prevKey;
      delete require.cache[require.resolve(path.join(PKG_ROOT, 'src', 'client.js'))];
    }
    console.log('[smoke] upload rate limit is announced + bounded-retried OK');
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kolbo-mcp-smoke-'));
  const installDir = path.join(tmpRoot, 'install');
  fs.mkdirSync(installDir, { recursive: true });

  try {
    // 1. Pack the current source into a tarball in tmpRoot.
    console.log('[smoke] packing tarball...');
    const packOut = sh('npm', ['pack', '--pack-destination', tmpRoot], { cwd: PKG_ROOT });
    // npm pack prints the filename on the last non-empty line of stdout.
    const tarballName = packOut.trim().split('\n').map(l => l.trim()).filter(Boolean).pop();
    const tarballPath = path.join(tmpRoot, tarballName);
    if (!fs.existsSync(tarballPath)) {
      throw new Error(`npm pack produced "${tarballName}" but no file at ${tarballPath}`);
    }

    // 2. Install that tarball into an empty dir — fresh resolution, no lockfile.
    //    This is the same resolution path `npx -y @kolbo/mcp` takes.
    console.log('[smoke] installing into fresh temp dir (this is the real test)...');
    fs.writeFileSync(path.join(installDir, 'package.json'), JSON.stringify({ name: 'kolbo-mcp-smoke-probe', version: '0.0.0', private: true }, null, 2));
    sh('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error', tarballPath], { cwd: installDir });

    // 3. Boot the freshly-installed server and verify registration succeeds.
    //    We can't do a full handshake without an MCP client, but we CAN
    //    verify that the process doesn't die during tool registration (which
    //    is what broke 1.2.0). Strategy: spawn, wait BOOT_WAIT_MS, check it's
    //    still alive and hasn't printed "Failed to start".
    const entry = path.join(installDir, 'node_modules', '@kolbo', 'mcp', 'src', 'index.js');
    if (!fs.existsSync(entry)) {
      throw new Error(`Installed package is missing expected entry: ${entry}`);
    }
    console.log('[smoke] booting server (pid will be killed after ~4s)...');
    const child = spawn(process.execPath, [entry], {
      cwd: installDir,
      env: { ...process.env, KOLBO_API_KEY: 'dummy_smoke_test' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.stdout.on('data', d => { stdout += d.toString(); });

    const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
    const timer = new Promise(resolve => setTimeout(() => resolve('timeout'), BOOT_WAIT_MS));
    const outcome = await Promise.race([exited, timer]);

    if (outcome !== 'timeout') {
      // Process exited before we killed it — that's a bug (it should be
      // blocking on stdio waiting for MCP JSON-RPC frames).
      throw new Error(`server exited on its own with code ${outcome}.\nstderr:\n${stderr}\nstdout:\n${stdout}`);
    }
    // Still alive → registration succeeded → we're good. Kill it.
    child.kill('SIGTERM');
    await exited.catch(() => {});

    if (/Failed to start/i.test(stderr)) {
      throw new Error(`server printed a startup error:\n${stderr}`);
    }

    console.log('[smoke] OK — fresh install boots cleanly, all tools registered.');
  } finally {
    rmrf(tmpRoot);
  }
}

main().catch(err => {
  console.error('[smoke] FAILED:', err.message || err);
  process.exit(1);
});

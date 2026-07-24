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
    console.log('[smoke] widget scripts parse OK');
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

/* Shared helpers for MCP tools. No server.tool() registrations here.
 *
 * This file centralizes the URL-or-local-path → Buffer resolver used by
 * every tool that accepts file-ish arguments (visual_dna, elements,
 * first_last_frame, lipsync, video_from_video, transcription, media upload,
 * future additions). It also owns the SSRF guard applied to any URL we
 * fetch on the user's local machine.
 *
 * SSRF defense in depth:
 *   1. Only http: / https: protocols.
 *   2. Block IP literals in private / loopback / link-local / multicast /
 *      reserved ranges (IPv4 and IPv6).
 *   3. Block common internal hostnames (localhost, *.local, *.internal,
 *      metadata.google.internal, metadata.goog).
 *   4. Manual redirect following so every hop is re-validated (a crafted
 *      public URL could 302 to 169.254.169.254 — global fetch would follow
 *      silently).
 *
 * If you add a new tool that fetches URLs, import resolveToBuffer from here
 * rather than reinventing the guard.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB — larger than visual_dna because
                                           // lipsync/v2v/transcription accept full
                                           // videos and long audio tracks.
const VISUAL_DNA_MAX_BYTES = 25 * 1024 * 1024; // kept for visual_dna backward-compat
const MAX_REDIRECTS = 5;

// THE single statement of how a local file gets into Kolbo. It is repeated to
// the model on several surfaces — the server `instructions` block (src/index.js),
// the media tool descriptions, and both local-path errors below — so it lives
// here and is imported, not retyped. It was previously pasted in five places and
// a change to it updated only two, leaving `instructions` teaching the opposite.
const LOCAL_FILE_ROUTING =
  'If you are using Kolbo over a remote connector (e.g. claude.ai), local files are not reachable. ' +
  'DO NOT upload the file yourself with cloud credentials or a shell command — Kolbo has a tool for this. ' +
  'If you can run shell commands, call `create_upload_ticket` and POST the file to the returned upload_url. ' +
  'Otherwise call `media_upload_widget` to have the user pick the file, or `upload_media` ' +
  'when the file IS reachable from where the MCP server runs, then pass the returned https:// URL here. ' +
  'A URL from `list_media` also works if the asset is already in the library.';

// Every tool that takes user media as INPUT. Their descriptions promise "URL or
// absolute local path" — true on a stdio install, a lie over a remote connector,
// where the model would read it, see no filesystem, and tell the user Kolbo
// cannot take their file at all. attachFileInputHints() below appends the route
// that actually works for the current transport, so the refusal never happens.
const FILE_INPUT_TOOLS = [
  'generate_image', 'generate_image_edit', 'generate_creative_director',
  'generate_video', 'generate_video_from_image', 'generate_video_from_video',
  'generate_elements', 'generate_first_last_frame', 'generate_lipsync',
  'generate_3d', 'edit_image', 'edit_video', 'transcribe_audio',
  'create_visual_dna', 'generate_character_sheet', 'clone_voice',
  'chat_send_message', 'create_moodboard'
];

const REMOTE_FILE_HINT =
  ' LOCAL FILE (on the user\'s machine, or attached to this chat)? NEVER reply that you cannot upload files — Kolbo uploads it for you. ' +
  'Call `media_upload_widget` so the user picks the file (claude.ai web/mobile), or `create_upload_ticket` and POST the file yourself if you can run shell/HTTP commands; ' +
  'either way you get an https:// URL to pass here. Ignore any "absolute local path" wording in the args below — this server cannot read the caller\'s disk, so a path will fail.';

const LOCAL_FILE_HINT =
  ' LOCAL FILE? Absolute local paths work here (server and client share a filesystem). ' +
  'Never reply that you cannot upload files — for a file you will reference more than once, call `upload_media` first and reuse the returned https:// URL.';

/**
 * Append the transport-correct local-file route to every media-input tool's
 * description, post-registration (same pattern as attachToolWidgetMeta).
 * `options.apps === true` is set ONLY by kolbo-api's remote per-request server,
 * so it is a transport signal — not `appsEnabled()`, which is also true for
 * stdio hosts that render widgets but CAN still read local paths.
 */
function attachFileInputHints(server, options = {}) {
  const hint = options.apps === true ? REMOTE_FILE_HINT : LOCAL_FILE_HINT;
  const registered = server._registeredTools || {};
  for (const name of FILE_INPUT_TOOLS) {
    const t = registered[name];
    if (t && typeof t.description === 'string' && !t.description.includes(hint)) {
      t.description += hint;
    }
  }
}

// Per-kind upload caps advertised to callers when the ticket endpoint omits them.
// Mirrors MAX_MB in kolbo-api src/modules/mcpConnector/upload.js.
const DEFAULT_MAX_FILE_MB = { image: 50, video: 500, audio: 200, document: 50 };

function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s);
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // includes 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') ||
      lower.startsWith('fe9') || lower.startsWith('fea') ||
      lower.startsWith('feb')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true;
  // IPv4-mapped / compat in dotted form: ::ffff:1.2.3.4 or ::1.2.3.4
  const mappedDot = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDot) return isPrivateIPv4(mappedDot[1]);
  // IPv4-mapped in pure hex form: ::ffff:7f00:1 (Node normalizes
  // ::ffff:127.0.0.1 → ::ffff:7f00:1). Extract last 2 hextets → 4 bytes.
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIPv4(dotted);
  }
  return false;
}

function isBlockedHostname(hostname) {
  // new URL('http://[::1]/').hostname returns "[::1]" (brackets kept).
  // Strip them so net.isIP and our private-range checks see the bare address.
  let host = hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const blockedNames = new Set([
    'localhost',
    'ip6-localhost',
    'ip6-loopback',
    'metadata.google.internal',
    'metadata.goog'
  ]);
  if (blockedNames.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return true;
  const ipFamily = net.isIP(host);
  if (ipFamily === 4 && isPrivateIPv4(host)) return true;
  if (ipFamily === 6 && isPrivateIPv6(host)) return true;
  return false;
}

function assertSafeUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); }
  catch (_) { throw new Error(`Invalid URL: ${rawUrl}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol "${u.protocol}" — only http/https allowed`);
  }
  if (isBlockedHostname(u.hostname)) {
    throw new Error(`Refusing to fetch from private / loopback / metadata host: ${u.hostname}`);
  }
  return u;
}

async function safeFetch(rawUrl, opts = {}) {
  let current = rawUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    assertSafeUrl(current);
    const res = await fetch(current, { redirect: 'manual', signal: opts.signal });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current).toString();
      current = next;
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects fetching ${rawUrl}`);
}

function guessFilename(source, fallbackExt) {
  if (isHttpUrl(source)) {
    try {
      const u = new URL(source);
      const base = path.basename(u.pathname) || `upload${fallbackExt}`;
      return base.includes('.') ? base : `${base}${fallbackExt}`;
    } catch (_) {
      return `upload${fallbackExt}`;
    }
  }
  return path.basename(source);
}

function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
    '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.aac': 'audio/aac'
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Resolve a URL or absolute local path into an in-memory Buffer.
 *   - URLs: fetched via safeFetch (SSRF-guarded, manual redirect handling)
 *   - Local paths: read via fs.readFileSync (must be absolute)
 *
 * @param {string} source - URL or absolute local path
 * @param {'image'|'video'|'audio'} kind - hint for default filename extension
 * @param {Object} [opts]
 * @param {number} [opts.maxBytes] - override the default size cap
 * @returns {Promise<{buffer: Buffer, filename: string, contentType: string, size: number}>}
 */
async function resolveToBuffer(source, kind, opts = {}) {
  const maxBytes = opts.maxBytes || MAX_FILE_BYTES;
  const defaultExt = kind === 'image' ? '.png' : kind === 'video' ? '.mp4' : '.mp3';

  if (isHttpUrl(source)) {
    const res = await safeFetch(source);
    if (!res.ok) throw new Error(`Failed to fetch ${source}: ${res.status} ${res.statusText}`);
    const contentLen = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLen && contentLen > maxBytes) {
      throw new Error(`File at ${source} (${contentLen} bytes) exceeds ${maxBytes}-byte limit`);
    }
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length > maxBytes) {
      throw new Error(`File at ${source} (${buffer.length} bytes) exceeds ${maxBytes}-byte limit`);
    }
    const filename = guessFilename(source, defaultExt);
    return {
      buffer,
      filename,
      contentType: res.headers.get('content-type') || guessContentType(filename),
      size: buffer.length
    };
  }

  if (!path.isAbsolute(source)) {
    // `path.isAbsolute` is platform-specific: on a POSIX server (every remote
    // connector deployment) a valid Windows path like `C:\Users\...` or
    // `\\server\share\...` returns false, so "must be absolute" is a lie that
    // sends the caller off retrying slash variants. `path.win32.isAbsolute`
    // answers the same question with Node's own grammar.
    throw new Error(
      (path.win32.isAbsolute(source)
        ? `This Kolbo server cannot read files off the calling machine, so the Windows path ${source} is unreachable from here. `
        : `Local file paths must be absolute: ${source}. `) +
      LOCAL_FILE_ROUTING
    );
  }
  let stat;
  try {
    stat = fs.statSync(source);
  } catch (err) {
    throw new Error(
      `Local file not found or unreadable: ${source}. ` +
      LOCAL_FILE_ROUTING +
      (err && err.code ? ` [${err.code}]` : '')
    );
  }
  if (stat.size > maxBytes) {
    throw new Error(`File ${source} (${stat.size} bytes) exceeds ${maxBytes}-byte limit`);
  }
  const buffer = fs.readFileSync(source);
  const filename = path.basename(source);
  return {
    buffer,
    filename,
    contentType: guessContentType(filename),
    size: buffer.length
  };
}

// ─── Universal graceful-timeout convention ───────────────────────────────────
// pollUntilDone throws PollingTimeoutError (err.timedOut === true) when the
// CLIENT-SIDE poll window elapses — the generation is almost always still
// running server-side (or already done). Originally only
// generate_creative_director caught this and returned a non-throwing
// "_timed_out" result; every other tool let it propagate, so the MCP SDK
// wrapped it as isError:true and recovery depended entirely on the calling
// LLM reading hint text. pollOrTimedOut() is the one place that decision now
// lives — every generation/chat tool routes its pollUntilDone call through
// it instead of duplicating the try/catch. Genuine failures (state
// failed/cancelled → GenerationFailedError) are NOT caught here; they still
// throw and surface as a real tool error.
const { pollUntilDone } = require('../polling');

/**
 * @returns {Promise<{result: object}|{timedOut: object}>}
 *   Callers do: `const poll = await pollOrTimedOut(...); if (poll.timedOut) return poll.timedOut; const result = poll.result;`
 */
async function pollOrTimedOut(client, generationId, pollOpts) {
  try {
    return { result: await pollUntilDone(client, generationId, pollOpts) };
  } catch (err) {
    if (!err || !err.timedOut) throw err;
    return {
      timedOut: {
        content: [{
          type: 'text',
          text: JSON.stringify({
            state: 'processing',
            generation_id: generationId,
            _timed_out: true,
            _hint: `Still running on the server after the poll window — this is NOT a failure, no credits were lost. Call get_generation_status with generation_id="${generationId}" (wait=true) to keep checking until state="completed". Do NOT re-run this tool.`
          }, null, 2)
        }]
      }
    };
  }
}

/**
 * Extract real, multiplier-adjusted credit cost from a polled getStatus
 * response. kolbo-api returns `credits_used` (final number deducted) and
 * `credits_breakdown` (per-CreditUsage detail) when the generation is
 * complete. Returns `{}` when the API didn't include them so spreading
 * the result into a tool's response object is a no-op (forward-compatible
 * with old kolbo-api versions).
 *
 * Usage in every generation tool:
 *   return {
 *     content: [{ type: 'text', text: JSON.stringify({
 *       urls: result.result.urls,
 *       model: result.result.model,
 *       ...creditFields(result),   // adds credits_used + credits_breakdown
 *       _followup_hint: '...',
 *     }, null, 2) }]
 *   };
 */
function creditFields(polledResult) {
  if (!polledResult) return {};
  const out = {};
  if (typeof polledResult.credits_used === 'number') {
    out.credits_used = polledResult.credits_used;
  }
  if (Array.isArray(polledResult.credits_breakdown) && polledResult.credits_breakdown.length) {
    out.credits_breakdown = polledResult.credits_breakdown;
  }
  return out;
}

// Shared zod schema for the optional `project_id` arg every generation tool
// accepts. Keep this in one place so the description never drifts across the
// 17 tools that use it. When omitted, the generation lands in the user's
// auto-created "API Generations" project. Call `list_projects` first to
// resolve a name → ObjectId.
const { z } = require('zod');
const projectIdField = z.string().optional().describe(
  'Project ObjectId to drop this generation into. Call `list_projects` to discover IDs (the API has no concept of project names — only ObjectIds). IMPORTANT: this is per-call, NOT sticky — once the user has named a working project, pass its id on EVERY generation call in the conversation; any call that omits it silently lands in the default "API Generations" project instead. Requires owner / edit / full permission on the project; view-only is rejected.'
);

// Read-scope variant for list/get tools that can surface a SHARED project's
// assets (a teammate's Visual DNAs / moodboards). Pass a project id you have
// edit+ on to also see that project owner's shared assets; omit to see only your
// own + global/org. View-only members and non-members get nothing extra.
const projectScopeReadField = z.string().optional().describe(
  "Project ObjectId (from `list_projects`) to ALSO surface that shared project's assets (a teammate's, when the project is shared with you). Requires edit / full / owner on the project — view-only members and non-members get only their own. Omit to see just your own + global/org."
);

// ─── Optional inline-image content blocks ────────────────────────────────────
// When a host opts in (the remote HTTP connector sets inlineImages:true), turn
// generated IMAGE urls into MCP `image` content blocks so clients render them
// inline instead of a "Show Image" link. Strictly gated + bounded:
//   - only runs when opts.enabled is true (stdio/Kolbo Code never enables it,
//     so their behavior is byte-identical: text URL only);
//   - caps the number of images and the bytes per image;
//   - ONLY embeds responses whose content-type is image/* — a video/audio URL
//     can never be base64-embedded even if mistakenly passed in;
//   - any fetch/decoding failure silently falls back to URL-only.
const INLINE_IMG_MAX_COUNT = 4;
// Cap kept conservative on purpose: a base64 image rides inside the JSON-RPC
// tool result, and chat clients (claude.ai etc.) drop the WHOLE result if it's
// too large — which looks like "no image at all". Anything over the cap is left
// to the URL in the text payload (clients render a "Show Image" affordance from
// it), so a big image degrades to a click instead of vanishing.
const INLINE_IMG_MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 MB per image
const INLINE_IMG_FETCH_TIMEOUT_MS = 8000; // never hang the tool response on a slow CDN

async function inlineImageBlocks(urls, opts = {}) {
  if (!opts || !opts.enabled) return [];
  if (!Array.isArray(urls) || urls.length === 0) return [];
  // Fetch the (≤4) images in parallel — they're independent, the cap already
  // bounds concurrency, and this sits on the connector response path right
  // after generation. Order is preserved by map-then-filter; any failure (size,
  // type, timeout, network) returns null and falls back to URL-only.
  const blocks = await Promise.all(
    urls.slice(0, INLINE_IMG_MAX_COUNT).map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), INLINE_IMG_FETCH_TIMEOUT_MS);
      try {
        if (typeof url !== 'string' || !isHttpUrl(url)) return null;
        const res = await safeFetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!contentType.startsWith('image/')) return null; // never embed non-images
        const declaredLen = Number(res.headers.get('content-length') || 0);
        if (declaredLen && declaredLen > INLINE_IMG_MAX_BYTES) return null;
        const ab = await res.arrayBuffer();
        if (ab.byteLength > INLINE_IMG_MAX_BYTES) return null;
        return { type: 'image', data: Buffer.from(ab).toString('base64'), mimeType: contentType };
      } catch (_) {
        return null;
      } finally {
        clearTimeout(timer);
      }
    })
  );
  return blocks.filter(Boolean);
}

// ─── "Open in Kolbo" deep links ───────────────────────────────────────────────
// kolbo-api submit responses include `session_id` + `project_id`. Map each MCP
// tool to the frontend page + tool slug whose session view can RESUME that
// session (mirrors kolbo-map src/constants/sessionTypes.js resumeUrl map — the
// route must match the SESSION MODEL the SDK created, per sdkSessionManager):
//   ImageSession → /image-tools?tool=text-to-image
//   imgEditSession (image_edit AND edit_image/global_image_edit) → /image-tools?tool=image-editing
//   textToVideoSession → /video-tools?tool=text-to-video
//   imgToVideoSession (video_from_image, elements, first_last_frame) → /video-tools?tool=image-to-video
//   videoToVideoSession → /video-tools?tool=video-to-video
//   lipsyncSession → /video-tools?tool=lipsync
//   MusicGeneratorSession / TextToSpeechSession / textToSoundSession /
//   speechToTextSession → /audio-tools with the matching slug
//   CreativeDirectorSession → /creative-director?session=... (no tool param)
// Intentionally ABSENT (no deep-linkable session page — widget falls back to
// plain https://app.kolbo.ai): edit_video (GlobalVideoEditSession has no
// session deep-link), generate_3d (project-scoped, no session), shorts render.
const APP_BASE_URL = 'https://app.kolbo.ai';
const OPEN_URL_ROUTES = {
  generate_image:             { path: '/image-tools', tool: 'text-to-image' },
  generate_image_edit:        { path: '/image-tools', tool: 'image-editing' },
  edit_image:                 { path: '/image-tools', tool: 'image-editing' },
  generate_video:             { path: '/video-tools', tool: 'text-to-video' },
  generate_video_from_image:  { path: '/video-tools', tool: 'image-to-video' },
  generate_elements:          { path: '/video-tools', tool: 'image-to-video' },
  generate_first_last_frame:  { path: '/video-tools', tool: 'image-to-video' },
  generate_video_from_video:  { path: '/video-tools', tool: 'video-to-video' },
  generate_lipsync:           { path: '/video-tools', tool: 'lipsync' },
  generate_music:             { path: '/audio-tools', tool: 'music-generator' },
  generate_speech:            { path: '/audio-tools', tool: 'text-to-speech' },
  generate_sound:             { path: '/audio-tools', tool: 'text-to-sound' },
  transcribe_audio:           { path: '/audio-tools', tool: 'speech-to-text' },
  generate_creative_director: { path: '/creative-director' },
};

/**
 * Build the "Open in Kolbo" deep link for a generation's actual session.
 * Returns undefined (widget falls back to app.kolbo.ai) when the tool has no
 * deep-linkable page or the submit response carried no session_id (older
 * kolbo-api, shorts render, 3D).
 */
function buildOpenUrl(tool, gen) {
  const route = OPEN_URL_ROUTES[tool];
  if (!route || !gen || !gen.session_id) return undefined;
  let url = `${APP_BASE_URL}${route.path}?session=${encodeURIComponent(gen.session_id)}`;
  if (route.tool) url += `&tool=${route.tool}`;
  if (gen.project_id) url += `&project=${encodeURIComponent(gen.project_id)}`;
  return url;
}

/**
 * Build the "Open in Kolbo" deep link for a PROJECT. Lands on the Media hub
 * (all-assets view) pre-filtered to this project, where the user sees every
 * generation/media item in it and can switch projects via the in-page selector.
 * The media page reads `?project=<id>` on load and selects it. Returns undefined
 * for a missing id or the default "API Generations" bucket (no useful landing —
 * it is the catch-all, not a real workspace the user navigates to).
 */
function buildProjectUrl(projectId, opts = {}) {
  if (!projectId || opts.is_default) return undefined;
  return `${APP_BASE_URL}/media?project=${encodeURIComponent(projectId)}`;
}

// ─── MCP Apps generation widget helpers ──────────────────────────────────────
// When the host renders MCP Apps (claude.ai via the remote connector, Claude
// Desktop over stdio), generation tools return IMMEDIATELY after submit and the
// ui://kolbo/generation.html widget takes over: live progress, inline result,
// action buttons. Text-only hosts never enter this path — their blocking
// behavior and response bytes are UNCHANGED.
const { UI, uiResult, appsEnabled, modelIcon } = require('../apps');

/**
 * Build the "submitted — widget is live" tool result for a UI host.
 * @param {object} p
 *   tool           MCP tool name (e.g. 'generate_image')
 *   kind           'image' | 'video' | 'audio' | '3d' | 'scenes'
 *   gen            the submit response ({ generation_id, poll_interval_hint })
 *   client         KolboClient (for model icon lookup)
 *   model, prompt, count, settings, reference_image, estimated_seconds
 *   poll_tool      widget-side status tool (default 'get_generation_status')
 *   status_args    args for poll_tool (default { generation_id, wait: true })
 */
async function uiGenerating(p) {
  // No ETAs anywhere — just a spinner until the poll flips to completed.
  const icon = await modelIcon(p.client, p.model).catch(() => null);
  const structured = {
    phase: 'generating',
    widget: 'generation',
    kind: p.kind,
    tool: p.tool,
    generation_id: p.gen.generation_id,
    poll_tool: p.poll_tool || 'get_generation_status',
    // Keep at most one long-wait status call in flight per widget. Without
    // wait=true, every open card calls tools/call every few seconds, flooding
    // the host's global progress/context stream and API rate limits.
    status_args: p.status_args || { generation_id: p.gen.generation_id, wait: true },
    model: p.model || 'Smart Select',
    model_icon: icon,
    prompt: p.prompt,
    count: p.count || 1,
    settings: p.settings || {},
    reference_image: p.reference_image,
    open_url: buildOpenUrl(p.tool, p.gen),
  };
  // Batch mode (prompts[] fan-out): ONE widget tracks every id in the set.
  if (Array.isArray(p.generation_ids) && p.generation_ids.length > 1) {
    structured.generation_ids = p.generation_ids;
    structured.prompts = p.prompts;
  }
  const text = JSON.stringify({
    status: 'submitted',
    generation_id: p.gen.generation_id,
    ...(Array.isArray(p.generation_ids) && p.generation_ids.length > 1
      ? { batch: true, generation_ids: p.generation_ids } : {}),
    ...(p.failed_submissions && p.failed_submissions.length
      ? { failed_submissions: p.failed_submissions } : {}),
    _widget_note: 'A live Kolbo widget is rendering this generation for the user (progress + final result + action buttons). Tell the user it is generating and the card above will update — do NOT poll in a loop. If you need the output URLs (e.g. for a follow-up edit or a report), call get_generation_status ONCE with wait=true — it blocks until done. Tracking several generations? Pass ALL their ids in generation_ids in that one call.',
  }, null, 2);
  return uiResult(UI.generation, text, structured);
}

/**
 * Wrap an already-completed generation result with the widget (used by tools
 * that stay blocking even on UI hosts, e.g. creative director).
 */
async function uiCompleted(p, textPayload) {
  const icon = await modelIcon(p.client, p.model).catch(() => null);
  const structured = {
    phase: 'completed',
    widget: 'generation',
    kind: p.kind,
    tool: p.tool,
    model: p.model || 'Smart Select',
    model_icon: icon,
    prompt: p.prompt,
    count: p.count || 1,
    settings: p.settings || {},
    reference_image: p.reference_image,
    urls: p.urls,
    thumbnail_url: p.thumbnail_url,
    title: p.title,
    duration: p.duration,
    scenes: p.scenes,
    credits_used: p.credits_used,
    open_url: buildOpenUrl(p.tool, p.gen),
  };
  return uiResult(UI.generation, textPayload, structured);
}

// ─── Text-payload budget ─────────────────────────────────────────────────────
//
// Whatever a tool returns as TEXT is what the model actually reads, and hosts
// reject or spill-to-disk anything much past this. A list tool that dumps every
// field of every row blows it instantly: list_presets measured 632,919 chars,
// get_stock_categories 257,817, list_voices 190,286 — all pretty-printed with
// `JSON.stringify(x, null, 2)` and no cap. The widget path already slims rows to
// id/title/thumbnail; the text path has to do the same or the tool is unusable
// on exactly the text hosts (Claude Code, Cursor, Codex) that depend on it.
const MAX_TEXT_CHARS = 20000;

/**
 * Build a compact text payload for a list-shaped result.
 *
 * @param {object[]} items   rows from the API
 * @param {object}   opts
 * @param {string[]} opts.fields  keys to keep per row, in order (others dropped)
 * @param {number}   [opts.cap]   max rows to include (default 50)
 * @param {number}   [opts.total] true total, so the model knows more exist
 * @param {object}   [opts.extra] extra top-level keys to merge in
 * @param {string}   [opts.note]  guidance on how to fetch the rest
 */
function compactList(items, { fields, cap = 50, total, extra, note } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const kept = rows.slice(0, cap).map((row) => {
    if (!row || typeof row !== 'object') return row;
    const out = {};
    for (const f of fields || Object.keys(row)) {
      // Drop empties — a row of nulls costs tokens and tells the model nothing.
      if (row[f] !== undefined && row[f] !== null && row[f] !== '') out[f] = row[f];
    }
    return out;
  });

  const payload = { ...(extra || {}), items: kept, count: kept.length };
  if (total != null) payload.total = total;
  const omitted = Math.max(rows.length - kept.length, 0);
  if (omitted > 0 || (total != null && total > kept.length)) {
    payload._truncated = {
      omitted_from_this_page: omitted,
      hint: note || 'Narrow with the tool\'s filter args, or page for more.',
    };
  }

  let text = JSON.stringify(payload);
  if (text.length > MAX_TEXT_CHARS) {
    // Still too big even trimmed (very long descriptions). Halve until it fits
    // rather than returning something the host will truncate at a random byte.
    let n = kept.length;
    while (n > 1 && text.length > MAX_TEXT_CHARS) {
      n = Math.floor(n / 2);
      payload.items = kept.slice(0, n);
      payload.count = n;
      payload._truncated = {
        omitted_from_this_page: rows.length - n,
        hint: note || 'Result was too large for one response; narrow with filter args.',
      };
      text = JSON.stringify(payload);
    }
  }
  return text;
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  compactList,
  VISUAL_DNA_MAX_BYTES,
  LOCAL_FILE_ROUTING,
  FILE_INPUT_TOOLS,
  attachFileInputHints,
  DEFAULT_MAX_FILE_MB,
  isHttpUrl,
  assertSafeUrl,
  safeFetch,
  guessFilename,
  guessContentType,
  resolveToBuffer,
  pollOrTimedOut,
  creditFields,
  projectIdField,
  projectScopeReadField,
  inlineImageBlocks,
  buildOpenUrl,
  buildProjectUrl,
  uiGenerating,
  uiCompleted,
  appsEnabled,
};

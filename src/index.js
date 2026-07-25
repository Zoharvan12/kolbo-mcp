/* ============================================================================
 * @kolbo/mcp — Kolbo AI MCP Server
 *
 *   ⛔  STOP.  READ THIS BEFORE TOUCHING ANY TOOL REGISTRATION.  ⛔
 *
 * This package is published to npm and installed via `npx -y @kolbo/mcp`.
 * Thousands of users have it CACHED on their machines, pinned to old versions
 * by npx's cache. Every tool name, every arg name, every response shape
 * registered below is a PUBLIC CONTRACT. Breaking it silently strands users
 * whose LLM will keep calling tool names their cached server no longer
 * registers — or worse, calls new-style args that the old server can't parse.
 *
 * THE THREE COMMANDMENTS
 *
 *   1. NEVER RENAME AN EXISTING TOOL.
 *      Not `generate_image` → `create_image`. Not `list_models` → `get_models`.
 *      Not "just cleaning up the name." Old cached clients break the instant
 *      you rename. If you must rename, keep the OLD name as an alias that
 *      forwards to the new implementation for at least one full major version.
 *
 *   2. NEVER REMOVE AN EXISTING TOOL.
 *      Deprecate it in the description ("[DEPRECATED: use X]") and keep it
 *      working. Only remove in a major version bump with release notes.
 *
 *   3. NEVER CHANGE AN EXISTING TOOL'S ARG NAMES, TYPES, OR REQUIRED STATUS
 *      IN A BACKWARD-INCOMPATIBLE WAY.
 *      Adding a new OPTIONAL arg with a sensible default is fine. Everything
 *      else below is forbidden in a minor release:
 *        - renaming `prompt` to `text`
 *        - making a previously-optional arg required
 *        - changing `aspect_ratio: string` to `aspect_ratio: { w, h }`
 *        - removing an arg (even one you think nobody uses)
 *
 * VERSION BUMPS
 *
 *   - minor (1.1.0 → 1.2.0): new tool, new optional arg, description tweak
 *   - patch (1.1.0 → 1.1.1): internal refactor, bug fix with no user impact
 *   - major (1.1.0 → 2.0.0): ANY breaking change from commandments 1–3 above,
 *     AND only after going through the deprecation path in CLAUDE.md.
 *
 * WHY THIS MATTERS
 *
 *   Users install via `npx -y @kolbo/mcp` — npx CACHES packages. A user who
 *   installed 3 months ago may still be running v1.0 until their cache
 *   invalidates. When their Claude Desktop starts the MCP server, it
 *   registers whatever tools ITS VERSION knows about. Their LLM sees that
 *   list and calls those names. You cannot force-update them.
 *
 *   The matching backend SDK routes in
 *   `kolbo-api/src/modules/sdk/index.js` are the same kind of public
 *   contract and follow the same rules — never rename, never remove.
 *
 * Full rules, deprecation path, and parity-audit instructions: CLAUDE.md
 *
 * If you are a coding agent about to rename/remove a tool or arg: STOP and
 * ask the human first. This is not optional.
 * ==========================================================================*/

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const KolboClient = require('./client');
const { registerGenerateTools } = require('./tools/generate');
const { registerModelTools } = require('./tools/models');
const { registerChatTools } = require('./tools/chat');
const { registerVisualDnaTools } = require('./tools/visual_dna');
const { registerMoodboardTools } = require('./tools/moodboards');
const { registerColorPaletteTools } = require('./tools/color_palettes');
const { registerMediaTools } = require('./tools/media');
const { registerPresetTools } = require('./tools/presets');
const { registerArtifactTools } = require('./tools/artifacts');
const { registerProjectTools } = require('./tools/projects');
const { registerAgentTools } = require('./tools/agents');
const { registerDocTools } = require('./tools/docs');
const { registerVoiceTools } = require('./tools/voices');
const { registerMusicLibraryTools } = require('./tools/music_library');
const { registerStockLibraryTools } = require('./tools/stock_library');
const { registerApps, attachToolWidgetMeta } = require('./apps');

/**
 * Build a fully-configured Kolbo MCP server (all tool groups registered)
 * WITHOUT connecting a transport. This is the reusable core shared by:
 *   - the stdio entrypoint below (npx / Kolbo Code), and
 *   - a remote HTTP host (kolbo-api) that creates one server per request with
 *     the caller's key injected via `opts.apiKey`.
 *
 * @param {object} [opts]
 * @param {string} [opts.apiKey]   Per-instance Kolbo API key (overrides env).
 * @param {string} [opts.apiBase]  API base URL override.
 * @param {boolean} [opts.apps]    Force-enable MCP Apps widget results. Set by
 *                                 the kolbo-api remote connector (claude.ai),
 *                                 whose stateless transport hides client
 *                                 capabilities. stdio hosts are auto-detected
 *                                 from the initialize handshake instead.
 * @returns {McpServer} a server ready to `.connect(transport)`.
 */
function createServer(opts = {}) {
  const client = new KolboClient(opts);

  const server = new McpServer({
    name: 'kolbo',
    title: 'Kolbo',
    version: '1.0.0',
    websiteUrl: 'https://kolbo.ai',
    // Connector avatar for hosts that render server icons (claude.ai tool
    // headers show this instead of a letter monogram).
    icons: [{ src: 'https://api.kolbo.ai/assets/kolbo-ai.png', mimeType: 'image/png', sizes: ['512x512'] }]
  }, {
    // Server-level instructions surfaced to the host model on initialize.
    // The single most common failure mode is project confusion — spell out
    // the project contract here so every client gets it without a skill file.
    instructions: [
      'PROMPT CONVENTIONS (Kolbo-specific — these change the OUTPUT, not just the metadata):',
      'A. Visual DNA: passing `visual_dna_ids` is not enough — every DNA in play must ALSO be tagged inside the prompt text as `@Name`, using the DNA name (e.g. "@Kobi walks into frame"). Moodboards are referenced the same way with `#Name`. Resolve names via `list_visual_dnas` / `list_moodboards`.',
      'B. The full Kolbo skill is available to you as MCP RESOURCES under `kolbo://skill/`. Read `kolbo://skill/SKILL.md` first — it is the core rules plus a routing index — then read the matching `kolbo://skill/references/...` file before writing prompts for a specific model or workflow (per-model prompt rules, Visual DNA workflow, Creative Director, marketing, cost validation). Do this instead of guessing; the references exist precisely because the rules differ per model.',
      'PROJECT CONTRACT (read this before generating anything):',
      'Everything in Kolbo lives inside a PROJECT — sessions, generations, and media are all project-scoped.',
      '1. When the user names a project ("in my Acme project", "for the summer campaign"), call `list_projects` ONCE to resolve the name to an id, then pass that id as `project_id` on EVERY subsequent generate_* / chat_send_message / upload_media call in the conversation. The target project is per-call, NOT sticky — any call that omits `project_id` silently lands in the default "API Generations" bucket (flagged is_default:true), which users experience as their work going to the wrong project.',
      '2. `list_projects` lists the user\'s platform projects (for generations/media/chat). Do not confuse a generation `session_id` with any other session type — they are not interchangeable.',
      '3. Misplaced work is fixable: `move_media` / `bulk_move_media` / `move_folder_contents` move media items between projects; `move_session` moves a whole session (plus its media) to another project. If the user says a generation landed in the wrong project, move it rather than regenerating.',
      '4. If the user has not mentioned any project, omit `project_id` — the default bucket is correct in that case. Do not ask which project to use unless the user\'s intent is ambiguous.',
      '5. Written deliverables (plans, briefs, scripts, research summaries) can live in Kolbo too: author them as AI Docs with `create_doc` (project-scoped, editable in the app, shareable via `share_doc`).',
      '6. TIMEOUT HANDLING (applies to EVERY generate_* / edit_* / chat_send_message / transcribe_audio tool): each tool blocks and polls internally, then gives up after its own window if the job is not yet terminal. A timeout is NOT a failure — it returns `_timed_out:true` with the `generation_id` (not an error), because the job is almost always STILL RUNNING on the server (or already finished). Call `get_generation_status` with that `generation_id` and `wait=true` to keep checking until state="completed". NEVER conclude the generation failed and re-run the same tool from scratch after a `_timed_out:true` result — that wastes the user\'s credits by paying twice. DIRECTOR / BATCH JOBS follow the same convention through a dedicated tool: generate_creative_director runs its scenes (image OR video) in parallel and only reports state="completed" once EVERY scene is terminal; on `_timed_out:true` call `get_creative_director_status` (not get_generation_status) with the returned generation_id and keep checking. If scenes already carry image_urls/video_urls, they are done; do not regenerate.',
      '7. SESSION CONTINUITY — one task, one session, always: every generation tool returns a `session_id`. For ANY follow-up, refinement, retry, or next step on the SAME task, pass that session_id back — never start fresh. BATCH RULE (critical): when a single user request produces multiple parallel generations (e.g. "animate these 5 images", "generate 3 variants"), do NOT launch them all at once without a session_id. Instead: (1) run the FIRST generation without session_id to create the session, (2) capture the session_id from its response, (3) pass that session_id to ALL remaining generations in the batch. This keeps the entire batch in one session. Exception: only omit session_id and start fresh when the user explicitly starts an unrelated new task.',
      '8. LOCAL FILES / REFERENCE MEDIA — HOW TO HANDLE EVERY CASE: (A) User has a LOCAL file (audio, video, image, document) on their machine: if you have filesystem access (Claude Desktop / Code / IDE / any stdio MCP client) → call `upload_media` with the absolute local path OR pass the path directly to tools like `transcribe_audio` which accept local paths natively. If you have NO filesystem access (claude.ai browser/mobile) → call `media_upload_widget` IMMEDIATELY, an upload card appears, the user uploads, and a `media.kolbo.ai` CDN URL comes back — use that URL for any follow-up tool call. (B) You already have a public URL (media.kolbo.ai, any CDN, any direct link) → pass it directly to the tool. All Kolbo tools accept public URLs. NEVER search for DO Spaces keys, DigitalOcean credentials, or server-side upload credentials. NEVER ask the user to put the file on Google Drive, Dropbox, or Loom. NEVER invent or guess a URL. NEVER base64 a large file — use upload_media instead.',
      '9. MODEL SELECTION: ALWAYS pass a specific `model` on every generation tool — do NOT omit it. Omitting falls back to "Smart Select" auto-routing, which we deliberately avoid because it hides the model choice from the user and often picks a generic default. Choose the model that best fits the task and the user\'s intent (quality, speed, style, capability). If you are unsure which model to use for a given type, call `list_models` with the matching `type` and pick the recommended/flagship one, then pass its `identifier`. Only use Smart Select (omit `model`) if the user EXPLICITLY asks you to auto-pick.',
      '10. IMAGE EDITING: for ANY prompt-driven / content edit of an existing image — "make it night", changing scene/lighting/colors, adding/removing/replacing objects, restyling — use `generate_image_edit` (it runs on strong dedicated editing models, same as image generation). Do NOT use `edit_image` for content edits — `edit_image` is ONLY for mechanical enhancements (upscale, reframe, remove-background, skin retouch). Its `magic_edit` operation is deprecated in favor of `generate_image_edit`.'
    ].join('\n')
  });

  // Register all tools. `inlineImages` (off by default) is opt-in: only the
  // remote HTTP host enables it, so stdio clients (Kolbo Code / Desktop / Cursor)
  // keep identical text-URL output. `apps` gates interactive widget results
  // (MCP Apps) the same way — see src/apps/index.js.
  const toolOptions = { inlineImages: !!opts.inlineImages, apps: !!opts.apps };
  registerGenerateTools(server, client, toolOptions);
  registerModelTools(server, client, toolOptions);
  registerVoiceTools(server, client, toolOptions);
  registerChatTools(server, client, toolOptions);
  registerVisualDnaTools(server, client, toolOptions);
  registerMoodboardTools(server, client, toolOptions);
  registerColorPaletteTools(server, client, toolOptions);
  registerMediaTools(server, client, toolOptions);
  registerPresetTools(server, client, toolOptions);
  registerArtifactTools(server, client, toolOptions);
  registerProjectTools(server, client, toolOptions);
  registerAgentTools(server, client, toolOptions);
  registerDocTools(server, client, toolOptions);
  registerMusicLibraryTools(server, client, toolOptions);
  registerStockLibraryTools(server, client, toolOptions);

  // MCP Apps widget resources (ui://kolbo/*). Registering resources is inert
  // for text-only hosts — they never fetch them.
  registerApps(server);
  // Serve skill/ as standard MCP resources so connector clients — which never
  // run `npx @kolbo/mcp install` — can still read the operating guidance.
  registerSkillResources(server);
  // Declaration-level `_meta['ui/resourceUri']` on every widget-carrying tool —
  // claude.ai prepares the widget iframe from tools/list, not from the result.
  attachToolWidgetMeta(server);

  return server;
}

async function main() {
  const server = createServer();

  // Start the server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Widget plumbing for HOST developers embedding Kolbo widgets themselves
// (e.g. kolbo-api's Kobi Act) — everything else in ./apps stays internal.
// UI: tool-name-agnostic resource URI map. TOOL_WIDGETS: tool name -> URI, so
// a host can resolve which widget a given tool call carries without deep-
// requiring internals. uiMeta/widgetHtml: same helpers registerApps() uses
// internally, re-exported so a host never has to re-derive them. Additive
// only — existing consumers (claude.ai, Desktop, npx) are unaffected.
const { UI, TOOL_WIDGETS, uiMeta, widgetHtml } = require('./apps');
const { registerSkillResources } = require('./skillResources');

module.exports = { main, createServer, UI, TOOL_WIDGETS, uiMeta, widgetHtml };

// Auto-run when invoked directly (e.g. `node src/index.js` or via the published
// bin/kolbo-mcp.js wrapper). Consumers that `require()` this module to embed it
// inside another process (the Kolbo Code CLI's `kolbo mcp serve` subcommand)
// should call `main()` themselves.
if (require.main === module || require.main?.filename?.endsWith('kolbo-mcp.js')) {
  main().catch(err => {
    console.error('Failed to start Kolbo MCP server:', err);
    process.exit(1);
  });
}

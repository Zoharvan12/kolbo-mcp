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
const { LOCAL_FILE_ROUTING, attachFileInputHints } = require('./tools/_shared');
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
const { registerReviewTools } = require('./tools/review');
const { registerVoiceTools } = require('./tools/voices');
const { registerMusicLibraryTools } = require('./tools/music_library');
const { registerStockLibraryTools } = require('./tools/stock_library');
const { registerApps, attachToolWidgetMeta } = require('./apps');
const { attachToolAnnotations } = require('./toolAnnotations');

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
      'LOCAL FILES: never upload a user file with your own cloud credentials, an S3/Spaces script, or a third-party host — Kolbo owns this. ' + LOCAL_FILE_ROUTING,
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
      '8. LOCAL FILES / REFERENCE MEDIA — HOW TO HANDLE EVERY CASE. (A) User has a LOCAL file (audio, video, image, document) on their machine. What matters is WHERE THIS SERVER RUNS, not what your client can do — your own filesystem access is irrelevant if the server is somewhere else. On a LOCAL stdio install (server and client share a machine) → call `upload_media` with the absolute path, or pass the path straight to tools like `transcribe_audio` that accept local paths. Over a REMOTE connector the server cannot see that path no matter how capable you are, so a local path will always fail: if you can run shell commands or issue HTTP requests → call `create_upload_ticket` and POST the file to the returned upload_url yourself (fastest, no user interaction); if you cannot → call `media_upload_widget` IMMEDIATELY, the user uploads, and a `media.kolbo.ai` CDN URL comes back for any follow-up call. (B) You already have a public URL (media.kolbo.ai, any CDN, any direct link) → pass it directly; all Kolbo tools accept public URLs. NEVER search for DO Spaces keys, DigitalOcean credentials, or server-side upload credentials. NEVER ask the user to put the file on Google Drive, Dropbox, or Loom. NEVER invent or guess a URL. NEVER base64 anything but a tiny file — it costs context in proportion to file size; use the ticket or the widget instead.',
      '9. MODEL SELECTION — ROUTE BY THE STRENGTHS SUMMARY, NEVER BY THE BADGE OR THE PRICE TAG: ALWAYS pass a specific `model` on every generation tool — do NOT omit it (omitting falls back to "Smart Select" auto-routing, which hides the choice from the user; use it ONLY if the user explicitly asks you to auto-pick). To choose: call `list_models` with the matching `type` and read each model\'s STRENGTHS SUMMARY — the "— …" clause printed after the credit cost. That summary IS the routing instruction: match it against what the user actually asked for (subject, style, motion, length, quality bar, speed), then pick the CHEAPEST model whose summary covers the task. `[NEW]` and `[RECOMMENDED]` badges, a high credit number, and "flagship"/"most intelligent" wording are NOT selection signals — never pick a model because it is newest, biggest or most expensive. Escalate to a premium/frontier model only when the user explicitly asks for maximum quality, or when no cheaper summary covers the requirement. Models printed under "Named-only" (no summary) are opt-in: use them only when the user names them. TEXT/CHAT: `chat_send_message` bills PER TOKEN, so the listed credit number is not the cost — a frontier text model (Claude Fable 5, GPT-5.6 Sol, Pro-class) costs 5-30x a mid-tier one per reply. Default ordinary chat (writing, brainstorming, Q&A, summarising) to a balanced mid-tier model and reserve the frontier tier for hard reasoning or long-form code the user asked for.',
      '10. IMAGE EDITING: for ANY prompt-driven / content edit of an existing image — "make it night", changing scene/lighting/colors, adding/removing/replacing objects, restyling — use `generate_image_edit` (it runs on strong dedicated editing models, same as image generation). Do NOT use `edit_image` for content edits — `edit_image` is ONLY for mechanical enhancements (upscale, expand/outpaint, remove-background, skin retouch). Its `magic_edit` operation is deprecated in favor of `generate_image_edit`. EXPANDING AN IMAGE: to widen/extend/uncrop an image or fit it into a wider frame while KEEPING the existing artwork, use `edit_image` with operation="zoom_out" (outpainting — original pixels preserved; size it with `zoom_out_percentage` or the `expand_left/right/top/bottom` pixel args). The "reframe" operation is NOT this: it re-generates the whole picture at a new aspect ratio and the subject comes back re-imagined. Only pick "reframe" when the user wants the shot re-taken, never when they want their image extended.'
    ].join('\n')
  });
  const progress = require('./progress');
  const tool = server.tool.bind(server);
  server.tool = (...args) => {
    const index = args.length - 1;
    const handler = args[index];
    if (typeof handler !== 'function') return tool(...args);
    args[index] = (params, extra) => progress.run(extra, () => handler(params, extra));
    return tool(...args);
  };

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
  registerReviewTools(server, client, toolOptions);
  registerMusicLibraryTools(server, client, toolOptions);
  registerStockLibraryTools(server, client, toolOptions);

  // MCP Apps widget resources (ui://kolbo/*). Registering resources is inert
  // for text-only hosts — they never fetch them.
  registerApps(server);
  // Serve skill/ as standard MCP resources so connector clients — which never
  // run `npx @kolbo/mcp install` — can still read the operating guidance.
  registerSkillResources(server);
  // Every media-input tool advertises the local-file route that works on THIS
  // transport. Without it, a remote-connector model reads "absolute local path",
  // sees no filesystem, and tells the user Kolbo cannot accept their file —
  // the single most-reported failure, despite the upload tools existing.
  attachFileInputHints(server, toolOptions);
  // OpenAI public-app review requires every exposed tool to declare the three
  // safety hints explicitly. The exact contract also fails closed when a tool
  // is added or removed without a classification.
  attachToolAnnotations(server);
  // Declaration-level `_meta['ui/resourceUri']` on every widget-carrying tool —
  // claude.ai prepares the widget iframe from tools/list, not from the result.
  attachToolWidgetMeta(server);

  return server;
}

async function main() {
  const server = createServer();

  // Node kills the process on an unhandled rejection / uncaught exception. In a
  // long-lived stdio server that is not a stack trace the user ever sees — the
  // host just reports "MCP server disconnected", mid-conversation, with the
  // generation still running server-side. A tool error is recoverable; a dead
  // process is not, so log to stderr (stdout is the JSON-RPC channel) and stay
  // up. Only the stdio entrypoint does this — an embedding host (kolbo-api)
  // keeps its own process semantics.
  process.on('unhandledRejection', (err) => {
    console.error('[kolbo-mcp] unhandled rejection (server staying up):', err);
  });
  process.on('uncaughtException', (err) => {
    console.error('[kolbo-mcp] uncaught exception (server staying up):', err);
  });

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

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
const { registerMediaTools } = require('./tools/media');
const { registerPresetTools } = require('./tools/presets');
const { registerAppBuilderTools } = require('./tools/app_builder');
const { registerArtifactTools } = require('./tools/artifacts');
const { registerProjectTools } = require('./tools/projects');
const { registerDocTools } = require('./tools/docs');
const { registerVoiceTools } = require('./tools/voices');
const { registerMusicLibraryTools } = require('./tools/music_library');
const { registerStockLibraryTools } = require('./tools/stock_library');
const { registerShortsCreatorTools } = require('./tools/shorts_creator');
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
      'PROJECT CONTRACT (read this before generating anything):',
      'Everything in Kolbo lives inside a PROJECT — sessions, generations, and media are all project-scoped.',
      '1. When the user names a project ("in my Acme project", "for the summer campaign"), call `list_projects` ONCE to resolve the name to an id, then pass that id as `project_id` on EVERY subsequent generate_* / chat_send_message / upload_media call in the conversation. The target project is per-call, NOT sticky — any call that omits `project_id` silently lands in the default "API Generations" bucket (flagged is_default:true), which users experience as their work going to the wrong project.',
      '2. `list_projects` lists the user\'s platform projects (for generations/media/chat). `app_builder_list_projects` is a DIFFERENT tool that scopes App Builder coding sessions only — never use one where the other is meant.',
      '3. Misplaced work is fixable: `move_media` / `bulk_move_media` / `move_folder_contents` move media items between projects; `move_session` moves a whole session (plus its media) to another project. If the user says a generation landed in the wrong project, move it rather than regenerating.',
      '4. If the user has not mentioned any project, omit `project_id` — the default bucket is correct in that case. Do not ask which project to use unless the user\'s intent is ambiguous.',
      '5. Written deliverables (plans, briefs, scripts, research summaries) can live in Kolbo too: author them as AI Docs with `create_doc` (project-scoped, editable in the app, shareable via `share_doc`).'
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
  registerMediaTools(server, client, toolOptions);
  registerPresetTools(server, client, toolOptions);
  registerAppBuilderTools(server, client, toolOptions);
  registerArtifactTools(server, client, toolOptions);
  registerProjectTools(server, client, toolOptions);
  registerDocTools(server, client, toolOptions);
  registerMusicLibraryTools(server, client, toolOptions);
  registerStockLibraryTools(server, client, toolOptions);
  registerShortsCreatorTools(server, client, toolOptions);

  // MCP Apps widget resources (ui://kolbo/*). Registering resources is inert
  // for text-only hosts — they never fetch them.
  registerApps(server);
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

module.exports = { main, createServer };

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

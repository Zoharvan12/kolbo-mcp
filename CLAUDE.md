# @kolbo/mcp — Kolbo AI MCP Server

## ⛔ CRITICAL: BACKWARD COMPATIBILITY RULES — READ BEFORE TOUCHING ANY TOOL

**This is a published npm package used by real people through cached `npx` installs.** Old versions stay in the wild for months. The tool surface is a PUBLIC CONTRACT — breaking it silently strands users.

### The three commandments

1. **NEVER RENAME AN EXISTING TOOL.** Not in a minor release, not in a patch. A rename looks like "just a cleanup" but it breaks every user on an older cached version — their LLM calls the old name and the server returns "tool not found." If you must rename, keep the OLD name as an alias that forwards to the new implementation for at least one full major version.

2. **NEVER REMOVE AN EXISTING TOOL.** Same reason. If a tool is truly dead, deprecate it: mark it as deprecated in the description, log a warning when called, and keep it working. Only remove in a major version bump with release notes.

3. **NEVER CHANGE AN EXISTING TOOL'S ARG NAMES OR REQUIRED FIELDS IN A BACKWARD-INCOMPATIBLE WAY.** Adding a new optional arg is fine. Making a previously-optional arg required is NOT fine. Renaming `prompt` to `text` is NOT fine. Changing the type of an existing arg is NOT fine. These are all silent breakages for cached clients.

### What IS safe (additive changes = minor bump)

- Adding a brand new tool with a new name.
- Adding a new **optional** arg to an existing tool (with a sensible default).
- Improving a tool's description text.
- Broadening accepted values (e.g., accepting more aspect ratios).
- Fixing a bug in a tool's internal implementation that doesn't change inputs/outputs.

### What REQUIRES a major version bump

- Renaming or removing a tool.
- Renaming an arg.
- Removing an arg (even if "nobody uses it").
- Making an optional arg required.
- Changing an arg's type (`string` → `number`, single value → array).
- Changing the shape of a tool's response in a way that breaks a JSON consumer.

### Why this matters more than it looks

- Users install via `npx -y @kolbo/mcp` — npx **caches packages**. A user who installed 3 months ago may still be running v1.0 until their cache invalidates.
- When Claude Desktop / Cursor / Claude Code starts the MCP server, the server registers whatever tools its version knows about. The LLM sees that list and calls those names.
- If you rename `generate_image` → `create_image` and publish as 1.2.0, users on 1.1.x will have an LLM that still says "I'll use generate_image" — and everything works for them. But anyone on the new version calling the old name gets "tool not found." **The moment we force-push breaking changes is the moment we fragment the user base.**

### Versioning cheatsheet

| Change | Version bump |
|---|---|
| New tool, new optional arg, description tweak, bug fix | **minor** (1.1.0 → 1.2.0) |
| Internal refactor, dependency update, no user-visible change | **patch** (1.1.0 → 1.1.1) |
| Rename / remove / break an existing tool or arg | **major** (1.1.0 → 2.0.0) + deprecation path + release notes |

### Deprecation path (when you actually do need to break something)

1. Add the new tool/arg/shape alongside the old one. Both work.
2. Mark the old one as deprecated in its description: `'[DEPRECATED: use new_tool_name] ...'`.
3. Ship as minor. Wait at least one cycle (months, not days).
4. In the next major version, remove the old one. Release notes explicitly call out the removal.

**If you're a coding agent and you're about to rename or remove a tool without doing all four steps: stop and ask the human first.**

## Overview

MCP server exposing Kolbo AI generation, chat, Visual DNA, and moodboard capabilities as native tools in Claude Code/Desktop. Published as `@kolbo/mcp` on npm.

## Distribution channels

This package is consumed in three ways:

1. **Kolbo plugin for Claude Code** — `Zoharvan12/kolbo-claude-plugin` is a dedicated tiny repo (~6 files) that wraps this MCP with a `userConfig` API-key prompt. Users install with `claude plugin marketplace add Zoharvan12/kolbo-claude-plugin && claude plugin install kolbo@kolbo`. The plugin executes `npx -y @kolbo/mcp`, so **any change here flows to plugin users on next `npx` cache refresh** — no plugin re-publish needed for backend tool updates. The plugin's `version` (in `kolbo-claude-plugin/.claude-plugin/plugin.json`) auto-bumps via the sync workflow in kolbo-code whenever `SKILL.md` changes; manually bump only for manifest / MCP server config changes.
2. **Kolbo Code CLI** — `kolbo-code/packages/opencode/src/mcp/wire.ts` writes a stdio MCP config that runs `npx -y @kolbo/mcp` on `kolbo auth login`.
3. **Manual setup** — Claude Desktop / Cursor / vanilla Claude Code users who edit `claude_desktop_config.json` by hand (see README).

**When adding, renaming, or changing tool behavior here, you MUST update the skill tree at `kolbo-code/packages/opencode/skills/kolbo/`** — the canonical skill loaded by both the Kolbo Code binary AND the Claude Code plugin. That tree is the only place that teaches the LLM how to route to your tool. As of skill v0.4.0 the tree uses progressive disclosure:

```
kolbo-code/packages/opencode/skills/kolbo/
├── SKILL.md                          # always-loaded core: tool inventory, hard rules, routing index
├── VERSION                           # synced to plugin manifest + SKILL.md frontmatter
└── references/
    ├── models/                       # per-model prompt rules — mirrors kolbo-api/src/config/systemPrompt.js
    │   ├── seedance.md, gpt-image.md, nano-banana.md, veo.md, creative-director.md,
    │   ├── music.md, html-presentation.md, landing-page.md, visual-code.md, prompt-copilot.md
    └── workflows/                    # cross-cutting / use-case routing
        ├── marketing-studio.md       # UGC + ad video modes — routes to generate_video*, generate_elements, generate_creative_director
        ├── dtc-ads.md                # composed brand ad images — generate_creative_director + brand-kit prompts
        ├── product-photoshoot.md     # 10 modes for brand product imagery — generate_image / generate_creative_director
        ├── marketplace-cards.md      # Amazon/Shopify listings — generate_creative_director with compliance-aware prompts
        ├── visual-dna.md, production-log.md, transcription.md, research-first.md,
        ├── media-library.md, app-builder.md, cost-and-validation.md, troubleshooting.md
```

**What to update when you change a tool:**
- New tool, new optional arg, or routing change → add a row to `SKILL.md`'s tool inventory + (if relevant) a row to the routing index pointing at the right `references/*.md`. Bump `references/models/*.md` or `references/workflows/*.md` content if the new behavior changes prompt rules or workflow shape.
- Tool description tweak only → no skill change needed (the description ships from the MCP server itself).
- New backend-only capability that needs a brand-new use case (e.g. a dedicated marketing-ad endpoint) → add a new `references/workflows/<name>.md` AND a row in SKILL.md's routing index.

CI in kolbo-code (`.github/workflows/validate-skill.yml`) enforces frontmatter, version-sync, link resolution, and the rebrand rule (zero `higgsfield` mentions). Don't get blocked by it — just keep links + frontmatter version in sync with `VERSION`.

## Architecture

```
Claude Code/Desktop → stdio → @kolbo/mcp → HTTP (X-API-Key) → api.kolbo.ai/api/v1/*
claude.ai (web)     → HTTPS → api.kolbo.ai/mcp (OAuth) → createServer({ apps:true }) per request
```

## MCP Apps — Interactive Kolbo Widgets (v1.30+, live since 2026-07-11)

Tool results render as branded, live-updating mini-apps inside claude.ai and Claude
Desktop (MCP Apps / SEP-1865). Full design: `docs/APPS-DESIGN.md`. Rules:

- **Gating**: `appsEnabled(server, options)` — `opts.apps === true` (kolbo-api remote
  connector) OR stdio client declares `io.modelcontextprotocol/ui`. `KOLBO_MCP_APPS=1|0`
  overrides locally. **Text hosts (Claude Code/Cursor) get byte-identical pre-widget
  responses — load-bearing for backward compat.**
- **Two `_meta` layers, BOTH required**: claude.ai decides to mount the iframe from the
  TOOL DECLARATION meta in tools/list (`attachToolWidgetMeta()` mutates
  `server._registeredTools` post-registration — legacy `server.tool()` has no _meta
  param) AND the RESULT carries `_meta['ui/resourceUri']` + `structuredContent`.
  New widget tool ⇒ add it to the `TOOL_WIDGETS` map in `src/apps/index.js`.
- **Generation tools on UI hosts return IMMEDIATELY** after submit; the widget polls
  `get_generation_status` (shorts: `shorts_status`) through the host bridge. Pattern:
  submit → `if (ui()) return uiGenerating({...})` → blocking-poll fallback. List tools:
  build text → `if (ui()) return uiResult(UI.mediaGrid, text, structured)`. The widget
  path must NEVER change the text payload.
- **Every result path of a TOOL_WIDGETS tool must attach structuredContent**, or rely
  on the widgets' graceful fallback (all four collapse/error on a missing contract —
  keep it that way; missing contracts used to render an eternal blank card).
- **Icons: NEVER use emoji in widget UI.** Emoji (⬇🖼🎬📄⚠✓ …) render as tofu boxes in
  many host iframes. Use the shared inline-SVG set instead: `ICONS.<name>` (download,
  upload, play, pause, check, x, warn, retry, edit, open, arrowRight, sparkle, clock,
  sound, mic, image, video, audio, document, cube, file) and `kindIcon(mediaType)`, both
  defined in the shared runtime in `src/apps/html.js` (currentColor, 1em, `.k-ic` CSS in
  theme.js). ICONS is available in every widget SCRIPT block. For icons in a static BODY
  template, leave the element empty and set `el(id).innerHTML = ICONS.x` in the script.
  Emoji is OK ONLY inside chat-message text sent via `sendMessage` (renders in Claude's
  markdown, not the iframe).
- **Model selection: steer the LLM to pass a specific `model`, never Smart Select.**
  Connector instruction #9 (`src/index.js`) + each generation tool's `model` description
  tell the model to pick a concrete model (call list_models if unsure) rather than
  omitting → auto-pick. Backend still SUPPORTS omitting (K_AUTO); we just don't encourage
  it from the MCP. Concrete provider defaults (music→Suno, TTS→eleven_v3) are fine to keep.
- **CSP**: widget iframes are deny-by-default. External assets must be allowlisted in
  `WIDGET_CSP.resourceDomains` (`src/apps/index.js`) — EXACT hosts first, wildcards
  second (not all hosts honor wildcards). New CDN bucket ⇒ add it there AND to the
  download-proxy allowlist in kolbo-api `src/modules/mcpConnector/download.js`.
- **Model icons**: bare `Model.avatar` filenames resolve to
  `kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/` — the ONLY host
  claude.ai's sandbox loads (api.kolbo.ai is blocked by our own Cloudflare bot rules;
  app.kolbo.ai's SPA catch-all returns 200 text/html for missing files). Mirroring is
  automatic: kolbo-api `src/jobs/modelIconsCdnSync.js` runs on every startup.
- **Downloads**: widget Download buttons route through
  `GET api.kolbo.ai/mcp/download?url=` (forces Content-Disposition attachment — plain
  CDN URLs open media inline). Per-item hover ⬇ button on every media cell.
- **Fullscreen** (`ui/request-display-mode`): the card goes `position:fixed inset:0`
  so media can never exceed the viewport; size-changed reports are SUPPRESSED while
  fullscreen (`kolbo.setFullscreen`) — they used to balloon the inline iframe over
  Claude's composer — and inline height is clamped to one viewport.
- **Deep links**: submit responses carry `session_id`/`project_id`; `buildOpenUrl()` in
  `_shared.js` maps tool → app route (hyphen slugs verified against kolbo-map pages;
  ProjectContext switches project from `?project=`). Tools with no session page fall
  back to app.kolbo.ai — never invent URLs.
- **Widget JS lives in template literals**: `\'` collapses to `'` and ships a syntax
  error = blank card. `npm run smoke` new-Function-parses every widget script and is
  publish-blocking. Never put `*/` inside widget block comments.
- **Zohar rules**: no ETAs/progress percentages in widgets (spinner + skeletons only);
  no tool/model COUNTS in any user-facing copy — use-case language.
- **Files**: `src/apps/index.js` (registrar, TOOL_WIDGETS, CSP, icon resolution,
  `canonicalModelId` lenient model names), `src/apps/bridge.js` (hand-rolled iframe
  JSON-RPC bridge — do NOT swap for the 337KB official bundle), `src/apps/theme.js`
  (Kolbo Liquid Glass tokens — keep in sync with kolbo-map), `src/apps/widgets/*.js`,
  `src/tools/_shared.js` (`uiGenerating` / `uiCompleted` / `buildOpenUrl`).

## Release Pipeline (the ONLY way changes reach users)

Full runbook: the `kolbo-mcp-release` skill
(`C:\Users\Zohar\.agents\skills\kolbo-mcp-release\SKILL.md`). Short form:

1. `npm pkg set version=X.Y.Z` → `npm run smoke` (publish gate) → commit →
   `git tag vX.Y.Z` → push main + tag.
2. The tag push triggers the GitHub Action → npm publish with provenance.
3. In kolbo-api: `npm install @kolbo/mcp@X.Y.Z --save` → push master (auto-deploys).
4. Verify prod: `/var/www/kolbo-api-prodution/node_modules/@kolbo/mcp/package.json`
   via prod-ssh (NOT `/var/www/kolbo-api` — wrong dir).

Operational notes: claude.ai caches a connector's tools/list — tool-declaration changes
need the user to disconnect/reconnect the connector. Widget HTML is fetched fresh per
render, BUT already-rendered cards in old chats keep their old code. The skill-sync bot
pushes `chore(skill)` commits to main — rebase before pushing.

## File Structure

```
bin/kolbo-mcp.js         — npx entry point
src/index.js             — MCP server setup (registers all tool groups)
src/client.js            — HTTP client (get, post, delete, postMultipart, X-API-Key auth)
src/polling.js           — Poll until terminal state (PollingTimeoutError carries generation_id)
src/tools/_shared.js     — Shared URL/path resolver + SSRF guards (import from any tool file)
src/tools/generate.js    — All generation tools (image, image-edit, video, video-from-image,
                            video-from-video, elements, first-last-frame, lipsync,
                            creative-director, music, speech, sound, 3d, transcribe,
                            list_voices, get_generation_status)
src/tools/models.js      — Discovery tools (list_models, check_credits)
src/tools/chat.js        — Chat tools (send, list conversations, get messages)
src/tools/visual_dna.js  — Visual DNA CRUD (thin wrapper that imports from _shared)
src/tools/moodboards.js  — Moodboard discovery (list, get)
src/tools/media.js       — Media library: media_upload_widget, upload_media, list_media, get_media, delete_media, restore_media,
                            permanently_delete_media, move_media, bulk_delete_media, bulk_restore_media,
                            bulk_permanently_delete_media, bulk_move_media, get_media_stats,
                            favorite_media, unfavorite_media, list_media_folders, create_media_folder,
                            update_media_folder, delete_media_folder, add_media_to_folder,
                            remove_media_from_folder, move_folder_contents, share_media_folder,
                            unshare_media_folder
src/tools/presets.js     — Preset discovery (list_presets — unified across catalogs)
src/tools/artifacts.js   — Artifact publishing (publish_html_artifact)
src/tools/docs.js        — AI Docs / Magic Pad (create_doc, list_docs, get_doc, update_doc, share_doc, delete_doc)
src/tools/projects.js   — Project scoping (list_projects — resolve a project name to the ObjectId you pass as project_id on any generation tool; move_session — move a session + its media between projects)
src/tools/app_builder.js — App Builder: full React app generation (preview) — create session, generate app, edit, get build status, get GitHub/Supabase credentials, list/delete sessions. Auto-provisions GitHub repo + Supabase DB + live deployment URL on first build. See `skill/references/workflows/app-builder.md` for the 4-layer mental model (project → session → app → end-users).
src/tools/agents.js      — Custom chat agents CRUD (list_agents, create_agent, update_agent, delete_agent — reusable named personas; `description` is the system instruction)
src/tools/music_library.js — Stock/production music catalog (search, analyze-script, browse, facets, track audio/related/lyrics)
src/tools/stock_library.js — Multi-source stock media (search, sources, categories, asset, analyze-script, import) over Pexels/Pixabay/Sketchfab/Music
src/tools/shorts_creator.js — Shorts Creator two-phase job flow (shorts_analyze, shorts_list_presets,
                            shorts_get_transcript, shorts_estimate, shorts_render, shorts_status, shorts_cancel)
scripts/smoke.js         — Load-time smoke test (no network)
scripts/check-parity.js  — SDK→MCP route parity audit (prepublishOnly hook)
```

## Available Tools (86)

Every generation tool below also accepts an optional `project_id` arg that routes the generation into a specific project (owner + edit/full shares). Call `list_projects` to discover IDs. Omit to fall back to the user's auto-created "API Generations" project. `project_id` is per-call, NOT sticky — pass it on every call once the user names a working project. Misplaced work is recoverable via `move_media` / `move_session`.


**Generation** (`src/tools/generate.js`)
| Tool | Route | Timeout | Composition args |
|------|-------|---------|-----------------|
| `generate_image` | `POST /v1/generate/image` | 120s | `visual_dna_ids`, `moodboard_id`, `reference_images`, `num_images`, `enable_web_search`, `resolution`, `cinematic` |
| `generate_image_edit` | `POST /v1/generate/image-edit` | 120s | `source_images`, `visual_dna_ids`, `moodboard_id`, `enable_web_search`, `resolution`, `cinematic` |
| `generate_video` | `POST /v1/generate/video` | 300s | `visual_dna_ids`, `reference_images`, `resolution`, `sound_enabled` |
| `generate_video_from_image` | `POST /v1/generate/video/from-image` | 300s | `image_url`, `visual_dna_ids`, `aspect_ratio`, `resolution`, `sound_enabled` |
| `generate_video_from_video` | `POST /v1/generate/video-from-video` | 600s | `source_video` (URL or local), optional `prompt`, `visual_dna_ids`, `resolution`; VEED Subtitles: `preset` / `source_language` / `translation_language` / `srt_content` / `srt_file_url` / `vocabulary` / `customization` |
| `generate_elements` | `POST /v1/generate/elements` | 600s | `reference_images`, `files`, `visual_dna_ids`, `motion`, `preset_id`, `resolution` |
| `generate_first_last_frame` | `POST /v1/generate/first-last-frame` | 300s | URLs OR local paths for `first_frame`/`last_frame`, `visual_dna_ids`, `resolution` |
| `generate_lipsync` | `POST /v1/generate/lipsync` | 600s | `source` (URL or local), `audio` (URL or local), `bounding_box_target`; Sync-3 only: `sync_mode`, `model_mode`, `emotion`, `temperature`, `occlusion_detection_enabled`, `active_speaker_detection` |
| `generate_creative_director` | `POST /v1/generate/creative-director` | 600s | `visual_dna_ids`, `moodboard_id`, `moodboard_ids`, `reference_images`, `scene_count`, `workflow_type`, `resolution` |
| `generate_music` | `POST /v1/generate/music` | 300s | `lyrics`, `style`, `instrumental`, `vocal_gender` |
| `generate_speech` | `POST /v1/generate/speech` | 120s | `voice` (id OR display name), `language` |
| `generate_sound` | `POST /v1/generate/sound` | 120s | `duration` |
| `generate_3d` | `POST /v1/generate/3d` | 900s | `reference_images`, `mode` (text/single/multi), `topology`, `enable_pbr` |
| `transcribe_audio` | `POST /v1/transcribe` | 1800s | `source` (URL or local audio/video) |
| `get_generation_status` | `GET /v1/generate/:id/status` | 180s w/ `wait` | single id or `generation_ids[]` batch (returns `all_done`/`still_processing`); `wait=true` blocks via pollUntilDone; single-id no-wait shape unchanged (widget contract) |
| `list_voices` | `GET /v1/voices` | — | filters: `provider`, `language`, `gender` |

**Media Library** (`src/tools/media.js`)
| Tool | Route | Notes |
|------|-------|-------|
| `media_upload_widget` | `POST /v1/media/upload-ticket` → widget POSTs files to `/mcp/upload` | Renders an in-chat upload card (MCP App) for claude.ai users to upload local files — remote MCP can't read chat attachments. Ticket-auth (short-lived, upload-only); supports image/video/audio/document, multi-file. On stdio hosts falls back to steering toward `upload_media`. |
| `upload_media` | `POST /v1/media/upload` (multipart) | Upload a local file (path or URL re-host), or inline `source_base64` + `filename`, and get a stable Kolbo CDN URL |
| `list_media` | `GET /v1/media` | Filters: `project_id`, `folder_id`, `type`, `category` (ai / uploaded / edited / favorites / training-lab), `source_type`, `sort`, `page`, `page_size`, `search` |
| `list_media_folders` | `GET /v1/media/folders` | List the user's media folders (owned + shared) |
| `create_media_folder` | `POST /v1/media/folders` | Create a folder (name + optional description / color / icon) |
| `update_media_folder` | `PUT /v1/media/folders/:id` | Update name / description / color / icon (owner only) |
| `delete_media_folder` | `DELETE /v1/media/folders/:id` | Soft-delete folder (owner only) |
| `add_media_to_folder` | `POST /v1/media/folders/:id/items` | Add up to 500 media items (idempotent) |
| `remove_media_from_folder` | `DELETE /v1/media/folders/:id/items` | Remove media items (body: `media_ids`) |
| `share_media_folder` | `POST /v1/media/folders/:id/share` | Share by email (owner only) |
| `unshare_media_folder` | `DELETE /v1/media/folders/:id/share/:user_id` | Revoke access (owner only) |
| `favorite_media` | `POST /v1/media/:id/favorite` | Mark a media item as favorited (idempotent) |
| `unfavorite_media` | `DELETE /v1/media/:id/favorite` | Remove a media item from favorites (idempotent) |
| `get_media` | `GET /v1/media/:id` | Fetch one item by id (incl. full metadata) |
| `delete_media` | `DELETE /v1/media/:id` | Soft-delete (30-day trash) |
| `restore_media` | `POST /v1/media/:id/restore` | Restore from trash |
| `permanently_delete_media` | `DELETE /v1/media/:id/permanent` | Hard-delete (S3 + DB) — NOT reversible |
| `move_media` | `PATCH /v1/media/:id/project` | Move item to a different project |
| `bulk_delete_media` | `POST /v1/media/bulk/delete` | Soft-delete ≤1000 |
| `bulk_restore_media` | `POST /v1/media/bulk/restore` | Restore ≤1000 |
| `bulk_permanently_delete_media` | `POST /v1/media/bulk/permanent` | Hard-delete ≤1000 |
| `bulk_move_media` | `POST /v1/media/bulk/move` | Move ≤1000 (atomic) |
| `move_folder_contents` | `POST /v1/media/folders/:id/move-contents` | Move all items in a folder |
| `get_media_stats` | `GET /v1/media/stats` | Counts + total bytes (optionally per project) |

**Preset Discovery** (`src/tools/presets.js`)
| Tool | Route | Notes |
|------|-------|-------|
| `list_presets` | `GET /v1/presets` | Unified across image/video/music/text_to_video; filter with `type` |
| `list_cinematic_presets` | `GET /v1/cinematic-presets` | "Cinema mode" presets grouped by dimension; ids feed the optional `cinematic` object on `generate_image` / `generate_image_edit` |

**Chat** (`src/tools/chat.js`)
| Tool | Route | Timeout | Notes |
|------|-------|---------|-------|
| `chat_send_message` | `POST /v1/chat` → polls status | 120s / 240s with `web_search` / 600s with `deep_think` | Pass `session_id` back on follow-ups. `system_prompt` only applied on new sessions. |
| `chat_list_conversations` | `GET /v1/chat/conversations` | — | Paginated |
| `chat_get_messages` | `GET /v1/chat/conversations/:sessionId/messages` | — | Paginated |

**Visual DNA** (`src/tools/visual_dna.js`)
| Tool | Route | Notes |
|------|-------|-------|
| `create_visual_dna` | `POST /v1/visual-dna` (multipart) | Accepts URLs OR absolute local paths; 25MB/file; max 4 images |
| `list_visual_dnas` | `GET /v1/visual-dna` | — |
| `get_visual_dna` | `GET /v1/visual-dna/:id` | — |
| `delete_visual_dna` | `DELETE /v1/visual-dna/:id` | — |

**App Builder (preview)** (`src/tools/app_builder.js`) — full React app generation, auto-provisions GitHub repo + Supabase DB + live deployment. **Different surface from generation tools — read `skill/references/workflows/app-builder.md` for the 4-layer mental model (project → session → app → end-users) before the first turn.**
| Tool | Route | Notes |
|------|-------|-------|
| `app_builder_list_projects` | `GET /project/lightweight` | Returns the SAME Kolbo projects as `list_projects` but via a different endpoint — use when scoping an App Builder session. NOT a substitute for `list_projects` (different shape). |
| `app_builder_create_session` | `POST /app-builder/session/:projectId` | Creates an App Builder session inside a Kolbo project. Returns a `session_id` distinct from chat/generation session ids. |
| `app_builder_generate_app` | `POST /app-builder/generation/:sessionId` → polls build-status | First build auto-generates app name, URL slug, GitHub repo, Supabase DB (when needed), and a live deployment URL. Polls until `build_status === "deployed"` (~5 min). ALWAYS surface `deployment_url` on success. |
| `app_builder_edit_app` | `PUT /app-builder/generation/:sessionId/:generationId` | Natural-language edit of an existing build. Needs the latest `generation_id` from `app_builder_list_generations`. Polls until redeployed. |
| `app_builder_get_build_status` | `GET /app-builder/:sessionId/build-status` | Manual poll — use after a `generate_app` / `edit_app` timeout or to resume a stuck build. |
| `app_builder_get_session` | `GET /app-builder/session/:sessionId` | Returns GitHub repo URL + Supabase URL + anon key for local dev. |
| `app_builder_list_sessions` | `GET /app-builder/sessions/:projectId` | All App Builder sessions in a Kolbo project. |
| `app_builder_list_generations` | `GET /app-builder/generations/:sessionId` | All builds/edits for an App Builder session, newest first — grab the latest `generation_id` before editing. |
| `app_builder_delete_session` | `DELETE /app-builder/session/:sessionId` | **IRREVERSIBLE** — wipes GitHub repo, Supabase DB (unless user-connected), deployed files, generation history. ALWAYS confirm with the user first. |

**Moodboards** (`src/tools/moodboards.js`)
| Tool | Route |
|------|-------|
| `list_moodboards` | `GET /v1/moodboards` |
| `get_moodboard` | `GET /v1/moodboards/:id` |

**Artifacts** (`src/tools/artifacts.js`)
| Tool | Route | Notes |
|------|-------|-------|
| `publish_html_artifact` | `POST /artifact/quick-share` | Publish HTML/SVG/Mermaid → public URL on `sites.kolbo.ai`. Server dedups identical content (returns same URL). Pass `share_token` from a prior publish to update that artifact in place (URL unchanged, old content moved into version history). |

**Music Library** (`src/tools/music_library.js`) — stock/production music ("Synci")
| Tool | Route | Notes |
|------|-------|-------|
| `search_music_library` | `POST /v1/music-library/search` | Keyword + genre/mood/bpm/duration filters + sort. Free (no credits). Distinct from `generate_music`. |
| `analyze_script_for_music` | `POST /v1/music-library/analyze-script` | Script → `{ query, mood, genre, keywords }` via cheap LLM call. |
| `browse_music_library` | `GET /v1/music-library/catalog` | Paginated browse, no query. |
| `get_music_library_facets` | `GET /v1/music-library/facets` | Distinct genres/moods/instruments + ranges. |
| `get_music_track_audio` | `GET /v1/music-library/track/:id/audio` | 128/320/WAV download URLs. |
| `get_music_track_related` | `GET /v1/music-library/track/:id/related` | Stems + alternate versions. |
| `get_music_track_lyrics` | `GET /v1/music-library/track/:id/lyrics` | Lyrics text + theme + explicit flag. |

**Stock Library** (`src/tools/stock_library.js`) — multi-source stock media (Pexels, Pixabay, Sketchfab 3D, Music)
| Tool | Route | Notes |
|------|-------|-------|
| `search_stock_media` | `GET /v1/stock/search` | Unified search; `source=all` interleaves providers. Free. Distinct from `generate_image`/`generate_video`. |
| `get_stock_sources` | `GET /v1/stock/sources` | Enabled sources + supported media types/filters. |
| `get_stock_categories` | `GET /v1/stock/categories` | Dynamic category chips; pass `providerParam` as `category`. |
| `get_stock_asset` | `GET /v1/stock/asset/:source/:id` | One asset + download variants + author/license/attribution. |
| `analyze_script_for_stock` | `POST /v1/stock/analyze-script` | Script → `{ queries[], mediaType, keywords }` via cheap LLM call. |
| `import_stock_asset` | `POST /v1/stock/import` | Copy asset → media library (CDN copy). Free. Music not importable here. |

**Shorts Creator** (`src/tools/shorts_creator.js`) — long video → AI-picked moments → restyled vertical shorts. Two-phase job flow (NOT the generic generation state machine): analyze → AWAITING_SELECTION → render → COMPLETED/PARTIALLY_COMPLETED. All routes return `{ status: true, data: job }`.
| Tool | Route | Timeout | Notes |
|------|-------|---------|-------|
| `shorts_analyze` | `POST /v1/generate/shorts/analyze` → polls status | 300s (poll 10s) | Flat 15 credits. `video_url` MUST be a Kolbo media-library URL (`upload_media` first). Source 30s–30 min. Returns `moments[]` (start/end/title/hook/score/accentBeats) when phase hits AWAITING_SELECTION. Errors: 402 INSUFFICIENT_CREDITS, 429 JOB_ALREADY_ACTIVE, 400 VIDEO_REQUIRED / SOURCE_TOO_LONG / SOURCE_TOO_SHORT. |
| `shorts_list_presets` | `GET /v1/generate/shorts/presets` | — | Style presets (identifier, default_mode, default_veed_preset, preview video). Also surfaced via `GET /v1/presets?type=shorts`. |
| `shorts_get_transcript` | `GET /v1/generate/shorts/:jobId/transcript` | — | Word-level Scribe transcript of the source video: `{ words, language, sourceDuration }` (word times = absolute source seconds). Base for the Review & Edit workflow (`delete_ranges` + edited `srt_content`). |
| `shorts_estimate` | `POST /v1/generate/shorts/:jobId/estimate` | — | Free pricing preview: totalCredits + perShort chunk counts. Pricing = 200 credits per restyled chunk (accents = 1-3 chunks, full = length/10s) + VEED subtitles 40cr/min (60s min). `delete_ranges` cuts reduce effective duration → cheaper. |
| `shorts_render` | `POST /v1/generate/shorts/:jobId/render` → polls status | 1500s (poll 12s) | Max 5 shorts, 15-90s each. Per short optional: `delete_ranges` ({start,end}[] absolute source seconds, server enforces ≥8s remaining) and `srt_content` (user-edited SRT, cut-timeline times, ≤200KB → `subtitles.srtContent`). Credits reserved up-front; failed shorts auto-refund. Terminal phases: COMPLETED / PARTIALLY_COMPLETED (returns successes + failures) / FAILED / CANCELLED. |
| `shorts_status` | `GET /v1/generate/shorts/:jobId/status` | — | Single job-state read — the recover path after a polling timeout. |
| `shorts_cancel` | `POST /v1/generate/shorts/:jobId/cancel` | — | Cancels + refunds unused credits. |

Selection arg shape (both estimate + render): `shorts: [{ moment_index, preset_identifier, mode?, subtitles_enabled?, subtitles_preset?, start?, end? }]` — mapped internally to the backend's camelCase (`momentIndex`, `presetIdentifier`, `subtitles: { enabled, veedPreset }`).

**Discovery & Account** (`src/tools/models.js`, `src/tools/projects.js`)
| Tool | Route |
|------|-------|
| `list_models` | `GET /v1/models` |
| `list_projects` | `GET /v1/projects` |
| `move_session` | `PATCH /v1/sessions/:sessionId/project` |
| `create_doc` / `list_docs` / `get_doc` / `update_doc` / `share_doc` / `delete_doc` | `POST/GET /v1/docs`, `GET/PUT/DELETE /v1/docs/:id`, `PATCH /v1/docs/:id/share` |
| `generate_character_sheet` | `POST /v1/visual-dna/character-sheet` |
| `*_visual_dna_folder` (5 tools) | `GET/POST /v1/visual-dna/folders`, `PUT/DELETE /v1/visual-dna/folders/:folderId`, `PUT /v1/visual-dna/:id/folder` |
| `create_project` / `update_project` / `archive_project` / `unarchive_project` | `POST /v1/projects`, `PUT /v1/projects/:id(/archive|/unarchive)` |
| `list_sessions` | `GET /v1/sessions` |
| `add_project_context` / `list_project_context` / `delete_project_context` / `get_project_profile` / `regenerate_project_profile` | `POST/GET/DELETE /v1/projects/:id/context*`, `GET/POST /v1/projects/:id/profile*` |
| `create_moodboard` / `update_moodboard` / `delete_moodboard` | `POST /v1/moodboards`, `PUT/DELETE /v1/moodboards/:id` |
| `clone_voice` / `import_elevenlabs_voice` / `delete_voice` | `POST /v1/voices/clone`, `POST /v1/voices/import-elevenlabs`, `DELETE /v1/voices/:id` |
| `trim_video` | `POST /v1/video/trim` + `GET /v1/video/trim/:jobId` |
| `check_credits` | `GET /v1/account/credits` |

**Generation flow**: POST → get `generation_id` → poll `/v1/generate/:id/status` → return `result` when `state === 'completed'`.
**Chat flow**: POST → get `message_id` → poll `/v1/generate/:message_id/status` (same endpoint, `type: 'chat'`) → return assistant content + reasoning/media URLs.
**Visual DNA create flow**: `form-data` multipart POST via `client.postMultipart()`. URLs fetched via global `fetch`; local paths read via `fs.readFileSync` (must be absolute).

## Adding a New Tool

Pick the pattern that matches — the four in the codebase cover most cases.

### Pattern A — Async generation (POST then poll)
Used by: image, video, music, speech, sound, creative-director, chat.

```js
server.tool('do_thing', 'Description', { /* params */ }, async (params) => {
  const gen = await client.post('/v1/do-thing', params);
  const result = await pollUntilDone(client, gen.generation_id, {
    interval: (gen.poll_interval_hint || 5) * 1000,
    timeout: 300000
  });
  return { content: [{ type: 'text', text: JSON.stringify(result.result, null, 2) }] };
});
```

### Pattern B — Synchronous list/CRUD
Used by: list_models, list_voices, check_credits, list_moodboards, get_moodboard, list_visual_dnas, get_visual_dna.

```js
server.tool('list_things', 'Description', { /* optional filters */ }, async (params) => {
  const qs = new URLSearchParams(params).toString();
  const result = await client.get(`/v1/things${qs ? '?' + qs : ''}`);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
```
Summarize results before returning (drop heavy fields like base64, long descriptions) to save MCP context window.

### Pattern C — DELETE
Used by: delete_visual_dna.

```js
server.tool('delete_thing', 'Description', { id: { type: 'string', description: 'ID' } }, async ({ id }) => {
  const result = await client.delete(`/v1/things/${encodeURIComponent(id)}`);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
```

### Pattern D — Multipart file upload
Used by: create_visual_dna. Requires `client.postMultipart(path, formData)` + `form-data` package.

Key rules:
- Accept **both URLs and absolute local paths** in the same arg array — users come from different contexts.
- URL fetch: global `fetch()` → `arrayBuffer()` → `Buffer.from()`. Check `content-length` before downloading.
- Local path: `fs.readFileSync` with absolute-path check (reject `~` and relative).
- Cap per-file size (currently 25MB) to prevent runaway memory.
- Use `form-data` package, not global FormData — Node fetch + global FormData has unreliable streaming behavior.

See `src/tools/visual_dna.js` for the canonical implementation.

### After adding any tool
1. Register the new tool group in `src/index.js` (if it's a new file).
2. Update the "Available Tools" tables in `README.md` and this `CLAUDE.md`.
3. Schema smoke test: `KOLBO_API_KEY=dummy node -e "require('./src/index.js')"` (will fail at API call but registration must succeed).
4. End-to-end test via Claude Desktop with a real API key before publishing.
5. `npm version minor && npm publish --access public` (new tool = minor; bug fix = patch).

## Testing

```bash
# Test client
KOLBO_API_KEY="kolbo_live_..." node -e "
const c = new (require('./src/client'))();
c.get('/v1/account/credits').then(r => console.log(r));
"

# Test server boots (Ctrl+C to stop)
KOLBO_API_KEY="kolbo_live_..." node src/index.js
```

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `KOLBO_API_KEY` | Yes | — |
| `KOLBO_API_URL` | No | `https://api.kolbo.ai/api` |

## Security

- API key via env var only — never hardcoded; sent as `X-API-Key` header (not URL/query)
- `.npmrc` with publish tokens must NEVER be committed

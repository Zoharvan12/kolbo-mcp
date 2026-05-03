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

## Architecture

```
Claude Code/Desktop → stdio → @kolbo/mcp → HTTP (X-API-Key) → api.kolbo.ai/api/v1/*
```

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
src/tools/media.js       — Media library (upload_media, list_media)
src/tools/presets.js     — Preset discovery (list_presets — unified across catalogs)
scripts/smoke.js         — Load-time smoke test (no network)
scripts/check-parity.js  — SDK→MCP route parity audit (prepublishOnly hook)
```

## Available Tools (30)

**Generation** (`src/tools/generate.js`)
| Tool | Route | Timeout | Composition args |
|------|-------|---------|-----------------|
| `generate_image` | `POST /v1/generate/image` | 120s | `visual_dna_ids`, `moodboard_id`, `reference_images`, `num_images`, `enable_web_search`, `resolution` |
| `generate_image_edit` | `POST /v1/generate/image-edit` | 120s | `source_images`, `visual_dna_ids`, `moodboard_id`, `enable_web_search`, `resolution` |
| `generate_video` | `POST /v1/generate/video` | 300s | `visual_dna_ids`, `reference_images`, `resolution` |
| `generate_video_from_image` | `POST /v1/generate/video/from-image` | 300s | `image_url`, `visual_dna_ids`, `aspect_ratio`, `resolution` |
| `generate_video_from_video` | `POST /v1/generate/video-from-video` | 600s | `source_video` (URL or local), `visual_dna_ids`, `resolution` |
| `generate_elements` | `POST /v1/generate/elements` | 600s | `reference_images`, `files`, `visual_dna_ids`, `motion`, `preset_id`, `resolution` |
| `generate_first_last_frame` | `POST /v1/generate/first-last-frame` | 300s | URLs OR local paths for `first_frame`/`last_frame`, `visual_dna_ids`, `resolution` |
| `generate_lipsync` | `POST /v1/generate/lipsync` | 600s | `source` (URL or local), `audio` (URL or local), `bounding_box_target` |
| `generate_creative_director` | `POST /v1/generate/creative-director` | 600s | `visual_dna_ids`, `moodboard_id`, `moodboard_ids`, `reference_images`, `scene_count`, `workflow_type`, `resolution` |
| `generate_music` | `POST /v1/generate/music` | 300s | `lyrics`, `style`, `instrumental`, `vocal_gender` |
| `generate_speech` | `POST /v1/generate/speech` | 120s | `voice` (id OR display name), `language` |
| `generate_sound` | `POST /v1/generate/sound` | 120s | `duration` |
| `generate_3d` | `POST /v1/generate/3d` | 900s | `reference_images`, `mode` (text/single/multi), `topology`, `enable_pbr` |
| `transcribe_audio` | `POST /v1/transcribe` | 1800s | `source` (URL or local audio/video) |
| `get_generation_status` | `GET /v1/generate/:id/status` | — | fallback for polling timeouts — error message includes `generation_id` |
| `list_voices` | `GET /v1/voices` | — | filters: `provider`, `language`, `gender` |

**Media Library** (`src/tools/media.js`)
| Tool | Route | Notes |
|------|-------|-------|
| `upload_media` | `POST /v1/media/upload` (multipart) | Upload a local file (or remote URL re-host) and get a stable Kolbo CDN URL |
| `list_media` | `GET /v1/media` | Filters: `type`, `page`, `page_size`, `search` |

**Preset Discovery** (`src/tools/presets.js`)
| Tool | Route | Notes |
|------|-------|-------|
| `list_presets` | `GET /v1/presets` | Unified across image/video/music/text_to_video; filter with `type` |

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

**Moodboards** (`src/tools/moodboards.js`)
| Tool | Route |
|------|-------|
| `list_moodboards` | `GET /v1/moodboards` |
| `get_moodboard` | `GET /v1/moodboards/:id` |

**Discovery & Account** (`src/tools/models.js`)
| Tool | Route |
|------|-------|
| `list_models` | `GET /v1/models` |
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

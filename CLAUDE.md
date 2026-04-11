# @kolbo/mcp — Kolbo AI MCP Server

## Memory
Read `C:\Users\Zohar\.claude\memory\MEMORY.md` at session start.

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
- If you rename `generate_image` → `create_image` and publish as 1.2.0, users on 1.1.x will have an LLM that still says "I'll use generate_image" — because 1.1.x still registers it — and everything works. But any code/prompt/skill file documenting the new name won't work for them. **The moment we force-push breaking changes is the moment we fragment the user base.**
- The backend `/v1/generate/*` routes are the SAME KIND of public contract. See `kolbo-api/src/modules/sdk/index.js` — never rename or delete a route there either. Only add.

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
- Backend API: `G:\Projects\Kolbo.AI\github\kolbo-api\` (SDK routes: `src/modules/sdk/`)
- Docs: `G:\Projects\Kolbo.AI\github\kolbo-docs\content\docs\developer-api\claude-code-skill.mdx`

## Architecture
```
Claude Code/Desktop → stdio → @kolbo/mcp → HTTP (X-API-Key) → api.kolbo.ai/api/v1/* → kolbo-api SDK module
```

Parity target: every route exposed in `kolbo-api/src/modules/sdk/index.js` should have a matching MCP tool. Current SDK coverage: 100% (as of v1.1.0 — chat, Visual DNA, and moodboard routes all exposed).

## File Structure
```
bin/kolbo-mcp.js         — npx entry point
src/index.js             — MCP server setup (registers all tool groups)
src/client.js            — HTTP client (get, post, delete, postMultipart, X-API-Key auth)
src/polling.js           — Poll until terminal state
src/tools/generate.js    — Generation tools (image, video, music, speech, sound, creative-director, image-edit)
src/tools/models.js      — Discovery tools (list_models, check_credits)
src/tools/chat.js        — Chat tools (send, list conversations, get messages)
src/tools/visual_dna.js  — Visual DNA CRUD (create with URL/local-path upload, list, get, delete)
src/tools/moodboards.js  — Moodboard discovery (list, get)
```

## Available Tools (21)

**Generation** (`src/tools/generate.js`)
| Tool | Backend Route | Timeout | Composition args |
|------|--------------|---------|------------------|
| `generate_image` | `POST /v1/generate/image` | 120s | `visual_dna_ids`, `moodboard_id`, `reference_images`, `num_images`, `enable_web_search` |
| `generate_image_edit` | `POST /v1/generate/image-edit` | 120s | `source_images`, `visual_dna_ids`, `moodboard_id`, `enable_web_search` |
| `generate_video` | `POST /v1/generate/video` | 300s | `visual_dna_ids`, `reference_images` |
| `generate_video_from_image` | `POST /v1/generate/video/from-image` | 300s | `image_url`, `visual_dna_ids`, `aspect_ratio` |
| `generate_creative_director` | `POST /v1/generate/creative-director` | 600s | `visual_dna_ids`, `moodboard_id`, `moodboard_ids`, `reference_images`, `scene_count`, `workflow_type` |
| `generate_music` | `POST /v1/generate/music` | 300s | `lyrics`, `style`, `instrumental`, `vocal_gender` |
| `generate_speech` | `POST /v1/generate/speech` | 120s | `voice` (id OR display name), `language` |
| `generate_sound` | `POST /v1/generate/sound` | 120s | `duration` |
| `get_generation_status` | `GET /v1/generate/:id/status` | — | (fallback for polling timeouts — error message includes `generation_id`) |
| `list_voices` | `GET /v1/voices` | — | filters: `provider`, `language`, `gender` |

**Chat** (`src/tools/chat.js`)
| Tool | Backend Route | Timeout | Notes |
|------|--------------|---------|-------|
| `chat_send_message` | `POST /v1/chat` → polls `GET /v1/generate/:id/status` | 120s default / 240s with `web_search` / 600s with `deep_think` | Pass `session_id` back on follow-ups. `system_prompt` only applied on new sessions. |
| `chat_list_conversations` | `GET /v1/chat/conversations` | — | Paginated |
| `chat_get_messages` | `GET /v1/chat/conversations/:sessionId/messages` | — | Paginated |

**Visual DNA** (`src/tools/visual_dna.js`)
| Tool | Backend Route | Notes |
|------|--------------|---------|
| `create_visual_dna` | `POST /v1/visual-dna` (multipart) | Accepts URLs OR absolute local paths; 25MB/file; max 4 images |
| `list_visual_dnas` | `GET /v1/visual-dna` | — |
| `get_visual_dna` | `GET /v1/visual-dna/:id` | — |
| `delete_visual_dna` | `DELETE /v1/visual-dna/:id` | — |

**Moodboards** (`src/tools/moodboards.js`)
| Tool | Backend Route |
|------|--------------|
| `list_moodboards` | `GET /v1/moodboards` |
| `get_moodboard` | `GET /v1/moodboards/:id` |

**Discovery & Account** (`src/tools/models.js`)
| Tool | Backend Route |
|------|--------------|
| `list_models` | `GET /v1/models` |
| `check_credits` | `GET /v1/account/credits` |

**Generation flow**: POST → get `generation_id` → poll `/v1/generate/:id/status` → return `result` when `state === 'completed'`.
**Chat flow**: POST → get `message_id` → poll `/v1/generate/:message_id/status` (same endpoint, `type: 'chat'`) → return assistant content + reasoning/media URLs.
**Visual DNA create flow**: `form-data` multipart POST via `client.postMultipart()`. URLs fetched via global `fetch`; local paths read via `fs.readFileSync` (must be absolute).

## Release Checklist — DO NOT SKIP STEPS

**When adding or changing any MCP tool, walk this list in order. Skipping steps strands users on inconsistent versions.**

### Code & local verification
- [ ] Tool added/modified in `src/tools/*.js` following one of the four patterns in "Adding a New Tool" below
- [ ] New tool group registered in `src/index.js` if it's a new file
- [ ] **Backward-compat check**: confirm you have NOT renamed/removed any existing tool or arg (see the top of `src/index.js` and the CRITICAL section at the top of this file). Additive changes only, unless it's a major version.
- [ ] Schema smoke test passes: `KOLBO_API_KEY=dummy node -e "require('./src/index.js')"` prints no errors
- [ ] End-to-end test via Claude Desktop against a real API key — every new tool exercised at least once

### Documentation — three files, all must be in sync
- [ ] `kolbo-mcp/README.md` — update the "Available Tools" tables and the tool count in the header
- [ ] `kolbo-mcp/CLAUDE.md` (this file) — update the "Available Tools" tables and the file-structure block if new files were added
- [ ] `kolbo-docs/content/docs/developer-api/claude-code-skill.mdx` — update BOTH sections:
  - The visible "Available Tools" section at the top of the page
  - The embedded skill markdown block (the `.claude/commands/kolbo.md` source)
  - Update the routing table, workflows, and tool lists — these are the sections the LLM uses to decide WHICH tool to call
  - **Note**: the Kolbo CLI auto-fetches this file live from `kolbo-docs` on every `kolbo auth login`, so updating this file IS the skill distribution step. No separate CLI release is needed.

### Publish the MCP package
```bash
cd G:\Projects\Kolbo.AI\github\kolbo-mcp
npm version minor    # new tool = minor. patch = bug fix. major = breaking (see CRITICAL rules at top of file)
npm publish --access public
npm view @kolbo/mcp version   # verify published version matches
```

### Release notes (announce somewhere users see it)
- [ ] Write release notes covering: new tools, any tool-description improvements, any bug fixes, any deprecated-but-still-working tools
- [ ] Include the force-refresh instructions for users who want the update immediately instead of waiting for npx's cache to revalidate: `npx clear-npx-cache && restart Claude Desktop`
- [ ] Note that the skill file auto-updates on next `kolbo auth login` (CLI fetches live from `kolbo-docs`) — no separate CLI release or manual re-copy needed. Only the MCP package is subject to npx caching.

### Post-publish sanity check
- [ ] Install fresh on a clean machine: `npx -y @kolbo/mcp@latest` should work with no errors
- [ ] Hit each new tool end-to-end via Claude Desktop on the published version (not local source)

### Publishing credentials (once)
- Account: `kolbo.ai` (contact@kolbo.ai), org: `@kolbo` — requires granular npm token with "bypass 2FA"
- Token management: https://www.npmjs.com/settings/kolbo.ai/tokens

### Version bump rules (quick reference — full rules at top of this file)
- **patch** (1.1.0 → 1.1.1): internal refactor, bug fix, no user-visible change
- **minor** (1.1.0 → 1.2.0): new tool, new OPTIONAL arg, description tweak, broader accepted values
- **major** (1.1.0 → 2.0.0): ANY rename/removal of a tool/arg/response field. Requires the deprecation path in the CRITICAL section. **Consult the human first.**

### Why both MCP package AND CLI must be updated together

The MCP package exposes the tools at runtime (via `tools/list`). The CLI installs the skill file (`.claude/commands/kolbo.md`) that tells the LLM WHEN to use each tool and HOW to compose them. Shipping one without the other creates split-brain installs:

- New MCP + stale skill: tools work but the LLM picks them suboptimally (hardcodes models, forgets `session_id` on chat follow-ups, doesn't know about Visual DNA).
- Old MCP + new skill: the skill describes tools that don't exist on the user's cached MCP version — the LLM calls tool names that return "not found".

The fix is to always update and release both together, and tell users in release notes to restart Claude Desktop AND re-run `kolbo auth login` to get both sides fresh.

## Adding a New Tool

Pick the pattern that matches — the four in the codebase cover most cases.

### Pattern A — Async generation (POST then poll)
Used by: image, video, music, speech, sound, creative-director, chat.

1. Backend: add route in `kolbo-api/src/modules/sdk/index.js` + controller.
2. Add tool in the relevant file (`src/tools/generate.js` for generation, `src/tools/chat.js` for chat-style):
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
3. If it's a brand new generation `type`, also add it to `GENERATION_MODELS`, `sdkSessionManager`, and `SdkGeneration` on the backend.

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
Used by: delete_visual_dna. Requires `client.delete(path)` (already defined).

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
2. Update the "Available Tools" tables in **both** `README.md` and this `CLAUDE.md`.
3. Update the skill file + tool tables in `kolbo-docs/content/docs/developer-api/claude-code-skill.mdx`.
4. Schema smoke test: `KOLBO_API_KEY=dummy node -e "require('./src/index.js')"` (will fail at API call but registration must succeed).
5. End-to-end test via Claude Desktop with a real API key before publishing.
6. `npm version minor && npm publish --access public` (new tool = minor; bug fix = patch).

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

**Testing with Claude Code** — add to `.claude/settings.json`:
```json
{ "mcpServers": { "kolbo": { "command": "node", "args": ["G:/Projects/Kolbo.AI/github/kolbo-mcp/src/index.js"], "env": { "KOLBO_API_KEY": "kolbo_live_..." } } } }
```

## Backend Sync Checklist
After backend SDK changes:
- [ ] Request params changed? → Update tool schemas in the matching `src/tools/*.js` file
- [ ] Response fields changed? → Update result extraction (check `extractResult()` in `kolbo-api/src/modules/sdk/controller.js` for the canonical shape per type)
- [ ] New SDK route? → Add matching MCP tool in the right pattern file (see "Adding a New Tool" above). **Parity target is 100% — every SDK route should have an MCP tool.**
- [ ] Route paths changed? → Update `client.get/post/delete/postMultipart` paths
- [ ] Status response format changed? → Update polling + result extraction
- [ ] New Visual DNA `dna_type` value? → Update `create_visual_dna` tool description
- [ ] New chat capability (streaming, tool use, etc.)? → Update `chat_send_message` tool args

**Status response contract (per-type):**
```json
// Image / image_edit
{ "state": "completed", "result": { "urls": [...], "prompt_used": "..." } }

// Video / video_from_image
{ "state": "completed", "result": { "urls": [...], "duration": 5, "thumbnail_url": "...", "aspect_ratio": "16:9" } }

// Music
{ "state": "completed", "result": { "urls": [...], "title": "...", "duration": 60, "lyrics": "..." } }

// Speech / sound
{ "state": "completed", "result": { "urls": [...], "duration": 12.3, "voice": "..." } }

// Chat
{ "state": "completed", "result": { "content": "...", "reasoning_content": "...", "image_urls": [...], "video_urls": [...], "audio_urls": [...], "model": "..." } }
```

**SDK parity audit**: compare `kolbo-api/src/modules/sdk/index.js` routes against `kolbo-mcp/src/tools/*.js` server.tool calls. Any route without a matching tool is a parity gap.

## Environment Variables
| Variable | Required | Default |
|----------|----------|---------|
| `KOLBO_API_KEY` | Yes | — |
| `KOLBO_API_URL` | No | `https://api.kolbo.ai/api` |

## Security
- API key via env var only — never hardcoded; sent as `X-API-Key` header (not URL/query)
- `.npmrc` with publish tokens must NEVER be committed

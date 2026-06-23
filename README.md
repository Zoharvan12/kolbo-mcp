# @kolbo/mcp

Use [Kolbo AI](https://kolbo.ai) as native tools in Claude Code and Claude Desktop via MCP (Model Context Protocol).

Generate images, videos, music, speech, sound effects, multi-scene campaigns, and conversational chat — all from natural language in your coding environment. 100+ AI models behind Smart Select routing, with reusable Visual DNA profiles for character/style consistency.

## Set up — paste one prompt, or one config block (keyless, no API key)

### Easiest: paste this prompt to your AI

Copy this and paste it to Claude, ChatGPT, Cursor, or any AI assistant — it installs Kolbo itself (picks local config or remote connector based on what it can do):

```
Connect the Kolbo AI MCP server (generate images, video, music and more).

- If you can run terminal commands (Claude Code, Cursor, Claude Desktop, or any local setup): run "npx -y @kolbo/mcp install" — it auto-configures Kolbo in the right place. If you can't run it, give me the command to run. Then I'll restart the app.
- If you're a browser chat (claude.ai, ChatGPT): add a custom connector with URL https://api.kolbo.ai/mcp under Settings → Connectors, then Connect → log in → Allow.

No API key needed — on first use a Kolbo login opens in my browser and I click Allow. When set up, confirm Kolbo is connected and offer to generate a test image of a sunset.
```

### Or set it up yourself — one command

<!--
  AI ASSISTANT SETUP INSTRUCTIONS — if you are an AI agent reading this to set up Kolbo for a user, do exactly this:
  1. If you can run a terminal command (Claude Code, Cursor, Claude Desktop): run `npx -y @kolbo/mcp install` — it writes the keyless config to the right file for every installed agent. (Don't hand-edit settings.json; the installer is deterministic.) Then tell the user to restart the app. On the first generation a Kolbo login opens in the browser — they click Allow (no API key).
  2. If you're a web chat that can't run commands (claude.ai, ChatGPT): tell the user to add the connector URL https://api.kolbo.ai/mcp under Settings → Connectors instead.
  The plugin below is an optional slash-command upgrade.
-->

Run this once — it sets up the **full** Kolbo experience (the MCP tools **and** the routing skill) for every installed agent (Claude Desktop, Claude Code, Cursor), keyless:

```bash
npx -y @kolbo/mcp install
```

Or add the config by hand — this block is identical for every MCP client and carries **no API key** (on first use it logs you in via the browser):

```json
{
  "mcpServers": {
    "kolbo": {
      "command": "npx",
      "args": ["-y", "@kolbo/mcp@latest"]
    }
  }
}
```

| Client | Where the config goes |
|--------|----------------------|
| **Claude Code** | `.claude/settings.json` (or `claude mcp add kolbo -- npx -y @kolbo/mcp@latest`) |
| **Claude Desktop** | `claude_desktop_config.json` |
| **Cursor** | `.cursor/mcp.json` |
| **Kolbo Code** | configured automatically on `kolbo auth login` |

Restart your app, then ask it to generate something. The first time, a Kolbo login opens in your browser — click **Allow** (no API key to create). _Prefer an API key? Create one at [app.kolbo.ai/developer](https://app.kolbo.ai/developer) and add `"env": { "KOLBO_API_KEY": "kolbo_live_..." }` to the block above._

### Browser-only (claude.ai / ChatGPT): the connector

No install at all — add the custom connector **`https://api.kolbo.ai/mcp`** under Settings → Connectors, then Connect → log in → Allow. Great for generating from text or URLs; to upload your own local files, use the config install above (it runs on your machine).

### Optional upgrade: add the Kolbo skill for slash-commands + smart routing

The config above is all you need. If you want one-word slash-commands (`/kolbo:marketing-studio`, `/kolbo:product-photoshoot`, …) and automatic routing to the best tool with the right defaults, install the Kolbo skill on top — it's an enhancement layer, not a requirement:

```bash
# Claude Code (also writes the MCP config for you, so you can skip Step 2 above)
claude plugin marketplace add Zoharvan12/kolbo-skills
claude plugin install kolbo@kolbo-skills

# Cursor / Codex / any agent (cross-agent installer)
npx skills add Zoharvan12/kolbo-skills
```

The skill content is the same canonical routing logic that ships inside [Kolbo Code](https://github.com/Zoharvan12/kolbo-code), so however you connect, the behavior matches. See the full setup guide at [docs.kolbo.ai/developer-api/claude-code-skill](https://docs.kolbo.ai/developer-api/claude-code-skill).

### Use it

Just ask your agent naturally:

**Generation**
- *"Generate an image of a sunset over mountains"*
- *"Create a 5-second video of waves crashing"*
- *"Build a 4-scene storyboard for a coffee shop ad"*
- *"Remove the background from this image"*
- *"Make a lo-fi hip hop beat"*
- *"Read this out loud with a British female voice"*

**Marketing & UGC**
- *"Make me a UGC ad for my sneaker brand — 9:16, talking-head style"*
- *"TV spot for my new beverage, 15 seconds, cinematic"*
- *"Unboxing video for this product photo"*

**Brand & product imagery**
- *"Pinterest pin for my candle brand, cottagecore mood"*
- *"Hero banner for my landing page, wide format"*
- *"Lifestyle shot of my product in a kitchen"*
- *"4 ad creative variants for Meta and TikTok"*

**Marketplace listings**
- *"Generate Amazon main image + 5 secondary images for my product"*
- *"Full A+ content set for my Shopify listing"*

**Analysis & utility**
- *"Ask Claude about the latest AI news with web search on"*
- *"Analyze this video and tell me what prompts are shown on screen"*
- *"What's in this image?"*
- *"Create a Visual DNA profile called 'Alex' from these images"*
- *"Use the same brand as last time"* (loads a persisted brand kit from the workspace)

Without the optional skill, the config block alone already exposes every tool — you just describe what you want. With the skill installed, each of these is also routed to the right MCP tool with the right defaults — UGC mode picks 9:16 + sound-off + no-captions, marketplace mode enforces compliance (pure white bg, no text, no props), product photoshoot mode uses the right aspect for the platform (2:3 Pinterest, 16:9 hero banner, 1:1 IG feed), etc. The routing logic is shared with [Kolbo Code](https://github.com/Zoharvan12/kolbo-code), so the behavior is identical however you connect.

## Available Tools (52)

**Generation**
| Tool | Description |
|------|-------------|
| `generate_image` | Text → image |
| `generate_image_edit` | Existing image(s) + prompt → edited image |
| `generate_video` | Text → video |
| `generate_video_from_image` | Still image + motion prompt → video |
| `generate_video_from_video` | Input video → restyled video, or burn in subtitles (video-to-video). `prompt` optional — prompt-less models (VEED Subtitles, Act Two, Wan Animate) use `preset` / `source_language` / `translation_language`, plus `srt_content` / `srt_file_url` / `vocabulary` / `customization` for VEED |
| `generate_elements` | Reference images/videos + prompt → animated video |
| `generate_first_last_frame` | First frame + last frame → interpolated video |
| `generate_lipsync` | Source image/video + audio → lipsynced video (Sync-3 adds active-speaker selection, emotion, model mode, temperature) |
| `generate_creative_director` | One brief → N coordinated scenes (image or video) |
| `generate_music` | Text (+ optional lyrics) → song |
| `generate_speech` | Text + voice → spoken audio |
| `generate_sound` | Text → sound effect |
| `generate_3d` | Text or reference images → 3D model (GLB/FBX/OBJ/USDZ) |
| `transcribe_audio` | Audio/video URL or file → text + SRT subtitles |

Every image/video/creative-director tool accepts `visual_dna_ids` and `moodboard_id` for character/style consistency across outputs — you can compose `create_visual_dna` → `generate_image` (with the DNA applied server-side) in a single agent turn. `generate_creative_director` also accepts `moodboard_ids` plural for blending.

Every generation tool also accepts an optional `resolution` arg. Images use `"1K"` (~1024px) / `"2K"` (Full HD) / `"3K"` (QHD) / `"4K"` (UHD); videos use vertical-pixel tiers like `"720p"` / `"1080p"` / `"1440p"` / `"2160p"`. Values are model-dependent — call `list_models` and read the chosen model's `supported_resolutions` and `resolutionMultipliers`. Omit to use the model default.

Every generation tool also accepts an optional `project_id` arg that routes the generation into a specific project (owned or shared with edit+). Call `list_projects` to discover IDs. When omitted, generations land in the user's auto-created "API Generations" project.

**Chat & Vision**
| Tool | Description |
|------|-------------|
| `chat_send_message` | Multi-turn chat with any Kolbo model. Pass `media_urls` to analyze images, videos, or audio — auto-routes to Gemini for vision. Supports web search and deep think. |
| `chat_list_conversations` | List past chat threads |
| `chat_get_messages` | Fetch messages in a conversation |

**Visual DNA** (reusable character/style/product profiles)
| Tool | Description |
|------|-------------|
| `create_visual_dna` | Create a profile from URLs or local files |
| `list_visual_dnas` | List your profiles |
| `get_visual_dna` | Fetch one profile |
| `delete_visual_dna` | Delete a profile |

**Moodboards**
| Tool | Description |
|------|-------------|
| `list_moodboards` | Browse presets + your moodboards |
| `get_moodboard` | Fetch one moodboard with all image URLs |

**Media Library**
| Tool | Description |
|------|-------------|
| `upload_media` | Upload a local file (or remote URL) → stable Kolbo CDN URL for reuse |
| `list_media` | Browse media library — filter by `project_id`, `folder_id`, `type`, `category` (ai / uploaded / edited / favorites / training-lab), `source_type`, `sort`, `search`, pagination |
| `list_media_folders` | List the user's media folders (owned + shared) — discover `folder_id` values to pass to `list_media` |
| `create_media_folder` | Create a new folder (name, optional description / color / icon) |
| `update_media_folder` | Rename / recolor / re-icon a folder (owner only) |
| `delete_media_folder` | Soft-delete a folder (owner only; items remain in library) |
| `add_media_to_folder` | Add up to 500 media items to a folder (idempotent) |
| `remove_media_from_folder` | Remove media items from a folder |
| `share_media_folder` | Share a folder by user email (owner only) |
| `unshare_media_folder` | Revoke a user's access to a folder (owner only) |
| `favorite_media` | Mark a media item as favorited (idempotent) — pass `media_id` from `list_media` |
| `unfavorite_media` | Remove a media item from favorites (idempotent) — pass `media_id` from `list_media` |
| `get_media` | Fetch one media item's full details by id |
| `delete_media` | Soft-delete a media item (30-day trash) |
| `restore_media` | Restore a trashed item |
| `permanently_delete_media` | Hard-delete (NOT reversible — confirm with user first) |
| `move_media` | Re-assign a media item to a different project |
| `bulk_delete_media` | Soft-delete up to 1000 items in one call |
| `bulk_restore_media` | Restore up to 1000 trashed items |
| `bulk_permanently_delete_media` | Hard-delete up to 1000 (NOT reversible) |
| `bulk_move_media` | Move up to 1000 items to a project (atomic — all-or-nothing) |
| `move_folder_contents` | Move every item in a folder to a project |
| `get_media_stats` | Counts + storage bytes per type (optionally per project) |

**Artifacts**
| Tool | Description |
|------|-------------|
| `publish_html_artifact` | Publish an HTML page, SVG, or Mermaid diagram and get a public shareable URL on `sites.kolbo.ai`. Pass `share_token` from a prior publish to update the same URL in place (old content kept in version history). |

**Music Library** (stock / production music)
| Tool | Description |
|------|-------------|
| `search_music_library` | Search the licensed stock-music catalog by keyword + genre/mood/BPM/duration filters. Find a ready-made track (distinct from `generate_music`, which composes a new song). |
| `analyze_script_for_music` | AI: turn a video/voiceover script into a music search (`query`, `mood`, `genre`, `keywords`). |
| `browse_music_library` | Browse the catalog without a query (paginated). |
| `get_music_library_facets` | List available genres, moods, instruments + BPM/duration ranges. |
| `get_music_track_audio` | Get a track's downloadable 128/320/WAV URLs by id. |
| `get_music_track_related` | Get stems + alternate versions of a track. |
| `get_music_track_lyrics` | Get lyrics text, theme, and explicit flag for a track. |

**Discovery & Account**
| Tool | Description |
|------|-------------|
| `list_models` | Current model catalog with costs and capabilities |
| `list_voices` | TTS voices (presets + cloned) |
| `list_presets` | Generation presets across image/video/music/text-to-video catalogs |
| `list_projects` | List owned + shared projects (id, name, role, is_default) — call first to resolve a project name into the `project_id` you pass to generation tools |
| `check_credits` | Check credit balance |
| `get_generation_status` | Poll a generation by ID (fallback if a tool times out) |

## Environment Variables

Both are optional — the local install logs in via the browser on first use.

| Variable | Required | Description |
|----------|----------|-------------|
| `KOLBO_API_KEY` | No | Set a `kolbo_live_` key to skip the browser login (create one at [app.kolbo.ai/developer](https://app.kolbo.ai/developer)). |
| `KOLBO_API_URL` | No | Custom API URL (default: `https://api.kolbo.ai/api`) |

## Links

- [API Documentation](https://docs.kolbo.ai/developer-api)
- [Kolbo AI Platform](https://kolbo.ai)
- [Get API Key](https://app.kolbo.ai)

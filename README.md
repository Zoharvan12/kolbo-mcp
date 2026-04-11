# @kolbo/mcp

Use [Kolbo AI](https://kolbo.ai) as native tools in Claude Code and Claude Desktop via MCP (Model Context Protocol).

Generate images, videos, music, speech, sound effects, multi-scene campaigns, and conversational chat — all from natural language in your coding environment. 100+ AI models behind Smart Select routing, with reusable Visual DNA profiles for character/style consistency.

## Quick Setup

### 1. Get an API Key

Create a key at [app.kolbo.ai](https://app.kolbo.ai) or via the [API](https://docs.kolbo.ai/developer-api).

### 2. Add to Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "kolbo": {
      "command": "npx",
      "args": ["-y", "@kolbo/mcp"],
      "env": {
        "KOLBO_API_KEY": "kolbo_live_..."
      }
    }
  }
}
```

### 3. Use it

Just ask Claude naturally:

- *"Generate an image of a sunset over mountains"*
- *"Create a 5-second video of waves crashing"*
- *"Build a 4-scene storyboard for a coffee shop ad"*
- *"Remove the background from this image"*
- *"Make a lo-fi hip hop beat"*
- *"Read this out loud with a British female voice"*
- *"Ask Claude about the latest AI news with web search on"*
- *"Create a Visual DNA profile called 'Alex' from these images"*

## Available Tools (21)

**Generation**
| Tool | Description |
|------|-------------|
| `generate_image` | Text → image |
| `generate_image_edit` | Existing image(s) + prompt → edited image |
| `generate_video` | Text → video |
| `generate_video_from_image` | Still image + motion prompt → video |
| `generate_creative_director` | One brief → N coordinated scenes (image or video) |
| `generate_music` | Text (+ optional lyrics) → song |
| `generate_speech` | Text + voice → spoken audio |
| `generate_sound` | Text → sound effect |

Every image/video/creative-director tool accepts `visual_dna_ids` and `moodboard_id` for character/style consistency across outputs — you can compose `create_visual_dna` → `generate_image` (with the DNA applied server-side) in a single agent turn. `generate_creative_director` also accepts `moodboard_ids` plural for blending.

**Chat**
| Tool | Description |
|------|-------------|
| `chat_send_message` | Multi-turn chat with any Kolbo model; supports web search and deep think |
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

**Discovery & Account**
| Tool | Description |
|------|-------------|
| `list_models` | Current model catalog with costs and capabilities |
| `list_voices` | TTS voices (presets + cloned) |
| `check_credits` | Check credit balance |
| `get_generation_status` | Poll a generation by ID (fallback if a tool times out) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `KOLBO_API_KEY` | Yes | Your Kolbo API key |
| `KOLBO_API_URL` | No | Custom API URL (default: `https://api.kolbo.ai/api`) |

## Links

- [API Documentation](https://docs.kolbo.ai/developer-api)
- [Kolbo AI Platform](https://kolbo.ai)
- [Get API Key](https://app.kolbo.ai)

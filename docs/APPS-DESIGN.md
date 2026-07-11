# Kolbo MCP Apps — Interactive Widgets Design

> Implements MCP Apps (SEP-1865, `io.modelcontextprotocol/ui`, protocol `2026-01-26`) so Kolbo tool
> results render as branded, live-updating mini-apps inside claude.ai and Claude Desktop — matching
> (and beating) the Higgsfield MCP experience. Text-only clients (Claude Code, Cursor, old cached
> installs) see EXACTLY the behavior they see today. Everything here is additive.

## Rendering targets

| Host | Transport | Widgets? |
|---|---|---|
| claude.ai (web) | kolbo-api `POST /mcp` (Streamable HTTP, stateless, OAuth) | ✅ (`apps: true` opt from kolbo-api) |
| Claude Desktop | stdio (`npx @kolbo/mcp`) | ✅ (auto-detected via `getUiCapability(clientCapabilities)`) |
| Claude Code / Cursor / others | stdio | ❌ text-only — unchanged blocking behavior |

## The two behaviors (capability-gated)

`uiEnabled(server, opts)` = `opts.apps === true` OR client declared `extensions["io.modelcontextprotocol/ui"]`.

- **UI host** → generation tools return **immediately** after submit with
  `structuredContent: { phase:'generating', generation_id, kind, params… }` + `_meta["ui/resourceUri"]`.
  The widget polls `get_generation_status` THROUGH THE HOST BRIDGE (`tools/call`) every 4s and morphs
  into the result view. Tool text says `Submitted — generation_id … the widget above will update live`
  so the model narrates correctly (Higgsfield-style).
- **Text host** → current `pollUntilDone` blocking behavior, byte-identical responses. No `_meta`, no
  structuredContent. ZERO contract change.

Sync tools (lists, search, models, transcribe-complete etc.) attach widget + structuredContent
unconditionally — harmless to text hosts (they ignore `_meta`), no behavior change.

## Widget set (all `ui://kolbo/*`, self-contained HTML assembled at runtime — no build step)

| Resource | Used by | What it shows |
|---|---|---|
| `ui://kolbo/generation.html` | all 17 generate/edit tools | Kolbo glass card: logo header, model chip (+icon), settings chips (duration/resolution/audio/count), reference thumbnail, shimmer skeletons + spinner while generating → image grid / video player / audio player / 3D file cards. Result gallery: thumbnail strip, full-size view, per-item actions **Animate · Edit · Recreate · Download · Open in Kolbo**. Creative Director renders scene sections. |
| `ui://kolbo/media-grid.html` | list_media, search_stock_media, music/stock browse, list_presets, list_voices, moodboards, visual DNA lists | responsive thumbnail/audio grid, hover play, attribution, actions (Import/Favorite/Use). |
| `ui://kolbo/catalog.html` | list_models | grouped model catalog with capability chips. |
| `ui://kolbo/transcript.html` | transcribe_audio | audio player + transcript + SRT/TXT download buttons. |

## Action buttons → `ui/message`

Buttons send a structured user message (exactly the Higgsfield trick), e.g.:

```
Animate this image into a short video
🎬 Reference image: <url>
Model: <smart select — pick the best image-to-video model>
Prompt: <user's typed prompt from the widget input>
```

Kolbo advantage: we default to Smart Select instead of forcing model names.

## Iframe bridge

Hand-rolled ~120-line JSON-RPC postMessage bridge (`src/apps/bridge.js`, injected as a string):
`ui/initialize` (appInfo/appCapabilities/protocolVersion) → `ui/notifications/initialized`; then
`tools/call`, `ui/message`, `ui/open-link`, `ui/notifications/size-changed`; listens for
`ui/notifications/tool-result`, `host-context-changed` (theme). Queues host-bound calls until the
handshake completes (avoids claude-ai-mcp#61 hidden-iframe race).

## Design system — Kolbo Liquid Glass (from kolbo-map)

Dark-first (host theme respected): bg `#0F0F0F`, card `rgba(38,38,38,.9)` + `backdrop-blur`,
border `rgba(255,255,255,.08)`, brand `#3b82f6`, text `#F5F5F2`, Inter (+JetBrains Mono chips),
radius 16px cards / 8px buttons / pills, specular top-edge `inset 0 1px 0 rgba(255,255,255,.18)`,
spring easing `cubic-bezier(.34,1.56,.64,1)`, `skeleton-sweep` shimmer, `liquid-press` on buttons.
Kolbo logo inline SVG. Model icons: `https://app.kolbo.ai/models_icons/<avatar>` when resolvable,
monogram fallback.

## Contract safety

- No tool renamed/removed; no arg changed; text-host response bytes unchanged.
- New content is additive: `structuredContent` + `_meta` only ever ADDED, and only for UI hosts
  (generation early-return) or harmlessly (sync tools).
- `registerAppResource`/`registerAppTool` from `@modelcontextprotocol/ext-apps` (peer-matched to our
  pinned SDK 1.29.0).

## kolbo-api side (1-line)

`src/modules/mcpConnector/mcp.js`: `createServer({ …, apps: true })` + bump `@kolbo/mcp` dependency.
`inlineImages` stays for backward compat but the widget supersedes it visually.

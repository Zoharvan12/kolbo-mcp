# DaVinci Resolve Workflow

Use this when the user wants Kolbo media edited, cut, titled, graded or rendered in DaVinci Resolve. There are two ways to reach Resolve; pick by what is connected.

| Path | Works from | Use it for |
|---|---|---|
| **Kolbo Resolve plugin** (`resolve_*` tools, this server) | Any agent, including ChatGPT and claude.ai | Reading the project, importing Kolbo media, building timeline edits, titles, frame checks - every change approved by the editor |
| **Blackmagic's DaVinci Resolve MCP** (their own server) | Local agents only (Claude Desktop, Claude Code, Codex) | Deep scripting, colour, LUTs/DCTLs, rendering |

Both need **DaVinci Resolve Studio**; the free edition has no plugins and no external scripting. If `resolve_list_sessions` returns a session, prefer the Kolbo plugin.

## Kolbo Resolve plugin

Everything in this section was run end to end through Kolbo MCP against DaVinci Resolve Studio 21.1.

### Connect and target safely

1. Call `resolve_list_sessions` before the first Resolve action.
2. If no session is listed, ask the user to open **Workspace → Workflow Integrations → Kolbo AI** in Resolve Studio and sign in with the same Kolbo account as this connector. **AI agents** in the plugin header connects automatically; if its dot is not green, ask them to click it.
3. One session: `session_id` may be omitted. Several: show each and ask. Keep the chosen `session_id` on every later call; re-list after Resolve or the plugin restarts.

Every tool except `resolve_list_sessions` and `resolve_get_command_status` returns a command record. Poll `resolve_get_command_status` until `succeeded`, `failed`, `denied` or `canceled`. Reads run without approval; everything else waits for **Allow once / Allow for this session / Deny** in the plugin window. `awaiting_approval` is not a polling state: tell the user to approve in the Kolbo AI window (it may be behind Resolve), then check again. `denied` is final.

### Tools

| Goal | Tool |
|---|---|
| Project name, timelines, frame rate, resolution, playhead | `resolve_get_project` |
| Clips on every track (position, start/end seconds), markers | `resolve_get_timeline` |
| Kolbo media into the Media Pool only | `resolve_import_media` |
| Build or change an edit | `resolve_edit_timeline` |
| Anything else in Resolve's scripting API | `resolve_run_script` |
| See the result | `resolve_capture_frame` → look at the returned `url` |

### Timeline edits (`resolve_edit_timeline`)

- Up to 100 operations run in order and stop at the first failure; earlier operations stay applied. Fix the failing one and continue - do not replay the batch.
- Start new work with `timeline.create` so the user's existing timelines stay untouched. It uses the project's frame rate and resolution.
- Times are seconds from the timeline start. `clip.append`: `record_seconds` = where it lands (default: end of that track), `trim_start_seconds` = seconds skipped at the head of the source, `duration_seconds` = length on the timeline (stills default to 5 s). media_type "video" keeps a clip's audio off the timeline; audio files always go to audio tracks. Missing tracks are added.
- Clips are addressed by track plus position (1 = leftmost media clip on that track; transitions do not count) or exact clip name. Clip names are file names, and a file imported again gets a short prefix, so prefer positions. Positions change after inserts and deletes - re-read with `resolve_get_timeline` when unsure.
- `clip.transition` needs handles: trim the head of the next shot (`trim_start_seconds` ≥ half the transition) or the transition will be refused.
- `audio.fade` is for clips on audio tracks. `title.add` builds the title inside that clip's Fusion comp (`position` [0.5, 0.5] = centre, y grows upward) with a fade in and out; keep it inside title-safe (x and y between 0.1 and 0.9).
- `clip.delete` is destructive; only delete what the user asked for.
- The Kolbo AI window must stay open while you work; it can sit behind Resolve.

### Scripts (`resolve_run_script`)

- `code` is an **async JavaScript function body** with `resolve`, `project`, `timeline` and `log(...)` in scope. Every Resolve call returns a promise - `await` each one - and `return` a JSON-serialisable result.
- The editor reads the exact code before approving. Give a plain `purpose`. Never touch files, the network or other projects unless the user asked for exactly that.

## Blackmagic's DaVinci Resolve MCP

Verified against DaVinci Resolve Studio 21.1.0.17.

### Requirements - check before promising anything

- **DaVinci Resolve Studio 21.1 or later.** The free edition has no MCP server and no external scripting.
- A **local** agent: Claude Desktop, Claude Code or Codex on the same computer as Resolve. Browser ChatGPT and claude.ai cannot reach this server; use the Kolbo Resolve plugin from there.
- Connect Resolve's server from **File → Setup AI Assistants** in Resolve, and set **Preferences → System → General → External scripting using** to **Local**.
- Resolve must be running; the server's `launch_resolve` tool can start it.

If neither the Kolbo plugin session nor Blackmagic's tools are available, say so and give the setup steps for the path that fits the user. Do not try to control Resolve any other way.

### Blackmagic's tools (not Kolbo's)

| Tool | Use |
|---|---|
| `get_resolve_status`, `launch_resolve` | Is Resolve running / start it |
| `get_whats_new` (`since` is required, e.g. `"21.0"`) | Features newer than your training |
| `search_scripting_api`, `get_scripting_api`, `get_scripting_docs` | Look up exact API signatures before writing a script |
| `run_script` | Sandboxed Python: Resolve API only, no files, network or processes |
| `run_script_unsafe` | Python with full system access - required for importing files or downloading media |
| `generate_lut`, `update_dctl`, `list_luts`, `list_dctls` | Colour transforms |

Scripts get `resolve` and the current `project` pre-injected and return data by assigning `result`.

### Workflow

1. **Generate or find media with Kolbo** (`generate_video`, `generate_music`, `list_media`, …) and wait for success.
2. **Get the files onto disk.** In Claude Code or Codex, download the Kolbo URLs with the shell. In Claude Desktop, download inside `run_script_unsafe` with `urllib.request`. Only download Kolbo-hosted URLs.
3. **Protect the user's work.** Call `pm.SaveProject()` first. For anything experimental, build in a new project (`pm.CreateProject(name)`) and reload the original project at the end. Projects opened in 21.1 cannot be opened in 20.x, so never convert a user's project as a side effect.
4. **Import, cut and finish** with `run_script_unsafe` (see recipe).
5. **Verify visually.** Set the playhead and call `project.ExportCurrentFrameAsStill(path)` at representative times, then look at the stills before reporting.
6. Optionally render (`AddRenderJob` / `StartRendering`) and upload the result back to Kolbo with `upload_media` so it lands in the user's library.

### Verified gotchas

- **`MediaPool.ImportMedia` needs plain path strings.** The dict form in the 21.1 stubs (`[{"FilePath": ...}]`) returned `None`. On Windows, backslash paths worked.
- **File import fails in `run_script`**; use `run_script_unsafe` for anything that touches files.
- **`Timeline.InsertFusionTitleIntoTimeline("Text+")` is a ripple insert** into every unlocked track: it splits the clips and music under the playhead. With those tracks locked it inserts nothing. For a title over a shot, build it inside that clip's Fusion comp (recipe below).
- `AppendToTimeline` `startFrame` / `endFrame` are **source frames** at the clip's own frame rate (`GetClipProperty("FPS")`). `recordFrame` is a timeline frame; timelines start at `timeline.GetStartFrame()` (86400 = 01:00:00:00 at 24 fps).
- New projects default to 24 fps and UHD output.

### Recipe: cut, transition, music fade, title

```python
pm = resolve.GetProjectManager()
original = project.GetName()
pm.SaveProject()
proj = pm.CreateProject("Kolbo Edit") or pm.LoadProject("Kolbo Edit")
mp = proj.GetMediaPool()

paths = [r"C:\media\shot1.mp4", r"C:\media\shot2.mp4", r"C:\media\music.mp3"]
items = {item.GetName(): item for item in mp.ImportMedia(paths)}
shot1, shot2, music = items["shot1.mp4"], items["shot2.mp4"], items["music.mp3"]

tl = mp.CreateEmptyTimeline("Kolbo Promo")
proj.SetCurrentTimeline(tl)
fps = float(proj.GetSetting("timelineFrameRate"))
start = tl.GetStartFrame()

def src(item, a, b):
    clip_fps = float(item.GetClipProperty("FPS") or fps)
    return int(a * clip_fps), int(b * clip_fps) - 1

s1, e1 = src(shot1, 0.5, 6.5)
s2, e2 = src(shot2, 1.0, 7.0)
clips = mp.AppendToTimeline([
    {"mediaPoolItem": shot1, "startFrame": s1, "endFrame": e1, "mediaType": 1, "trackIndex": 1, "recordFrame": start},
    {"mediaPoolItem": shot2, "startFrame": s2, "endFrame": e2, "mediaType": 1, "trackIndex": 1, "recordFrame": start + int(6 * fps)},
])
audio = mp.AppendToTimeline([{"mediaPoolItem": music, "startFrame": 0, "endFrame": int(12 * fps) - 1,
                              "mediaType": 2, "trackIndex": 1, "recordFrame": start}])

clips[0].AddTransition({"type": "Cross Dissolve", "category": "simple", "position": "end",
                        "alignment": "center", "duration": int(fps)})
audio[0].SetFades({"FadeIn": int(0.5 * fps), "FadeOut": int(2 * fps)})

# Title inside shot 1's Fusion comp, fading in and out (Blend keyframes are clip frames).
comp = clips[0].AddFusionComp()
media_in, media_out = comp.FindTool("MediaIn1"), comp.FindTool("MediaOut1")
text = comp.AddTool("TextPlus", -32768, -32768)
text.SetInput("StyledText", "KOLBO x DAVINCI RESOLVE")
text.SetInput("Size", 0.085)
text.SetInput("Font", "Arial")
text.SetInput("Style", "Bold")
merge = comp.AddTool("Merge", -32768, -32768)
merge.ConnectInput("Background", media_in)
merge.ConnectInput("Foreground", text)
media_out.ConnectInput("Input", merge)
merge.AddModifier("Blend", "BezierSpline")
for value, frame in ((0.0, 6), (1.0, 24), (1.0, 96), (0.0, 120)):
    merge.SetInput("Blend", value, frame)

pm.SaveProject()
result = {"project": proj.GetName(), "timeline": tl.GetName(), "original": original}
```

Then verify, and restore the user's project when you are done:

```python
tl = project.GetCurrentTimeline()
tl.SetCurrentTimecode("01:00:02:00")
ok = project.ExportCurrentFrameAsStill(r"C:\media\check-2s.png")
resolve.GetProjectManager().SaveProject()
resolve.GetProjectManager().LoadProject("<original project name>")
result = {"still": ok}
```

### Completion proof

- Look at exported stills at the title, the transition and the end before reporting.
- Report which project and timeline you built, that the original project was saved and restored, and where any render landed.

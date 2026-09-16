# DaVinci Resolve Workflow

Use this when the user wants Kolbo media edited, graded or rendered in DaVinci Resolve. Kolbo generates and hosts the media; **Blackmagic's own DaVinci Resolve MCP server** drives Resolve. The agent uses both connectors side by side.

Everything below was run against DaVinci Resolve Studio 21.1.0.17 through Blackmagic's server.

## Requirements - check before promising anything

- **DaVinci Resolve Studio 21.1 or later.** The free edition has no MCP server and no external scripting.
- A **local** agent: Claude Desktop, Claude Code or Codex on the same computer as Resolve. Browser ChatGPT and claude.ai can generate media with Kolbo but cannot reach Resolve.
- Connect Resolve's server from **File → Setup AI Assistants** in Resolve, and set **Preferences → System → General → External scripting using** to **Local**.
- Resolve must be running; the server's `launch_resolve` tool can start it.

If the Resolve tools are missing from the conversation, say so and give these steps. Do not try to control Resolve any other way.

## Blackmagic's tools (not Kolbo's)

| Tool | Use |
|---|---|
| `get_resolve_status`, `launch_resolve` | Is Resolve running / start it |
| `get_whats_new` (`since` is required, e.g. `"21.0"`) | Features newer than your training |
| `search_scripting_api`, `get_scripting_api`, `get_scripting_docs` | Look up exact API signatures before writing a script |
| `run_script` | Sandboxed Python: Resolve API only, no files, network or processes |
| `run_script_unsafe` | Python with full system access - required for importing files or downloading media |
| `generate_lut`, `update_dctl`, `list_luts`, `list_dctls` | Colour transforms |

Scripts get `resolve` and the current `project` pre-injected and return data by assigning `result`.

## Workflow

1. **Generate or find media with Kolbo** (`generate_video`, `generate_music`, `list_media`, …) and wait for success.
2. **Get the files onto disk.** In Claude Code or Codex, download the Kolbo URLs with the shell. In Claude Desktop, download inside `run_script_unsafe` with `urllib.request`. Only download Kolbo-hosted URLs.
3. **Protect the user's work.** Call `pm.SaveProject()` first. For anything experimental, build in a new project (`pm.CreateProject(name)`) and reload the original project at the end. Projects opened in 21.1 cannot be opened in 20.x, so never convert a user's project as a side effect.
4. **Import, cut and finish** with `run_script_unsafe` (see recipe).
5. **Verify visually.** Set the playhead and call `project.ExportCurrentFrameAsStill(path)` at representative times, then look at the stills before reporting.
6. Optionally render (`AddRenderJob` / `StartRendering`) and upload the result back to Kolbo with `upload_media` so it lands in the user's library.

## Verified gotchas

- **`MediaPool.ImportMedia` needs plain path strings.** The dict form in the 21.1 stubs (`[{"FilePath": ...}]`) returned `None`. On Windows, backslash paths worked.
- **File import fails in `run_script`**; use `run_script_unsafe` for anything that touches files.
- **`Timeline.InsertFusionTitleIntoTimeline("Text+")` is a ripple insert** into every unlocked track: it splits the clips and music under the playhead. With those tracks locked it inserts nothing. For a title over a shot, build it inside that clip's Fusion comp (recipe below).
- `AppendToTimeline` `startFrame` / `endFrame` are **source frames** at the clip's own frame rate (`GetClipProperty("FPS")`). `recordFrame` is a timeline frame; timelines start at `timeline.GetStartFrame()` (86400 = 01:00:00:00 at 24 fps).
- New projects default to 24 fps and UHD output.

## Recipe: cut, transition, music fade, title

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

## Completion proof

- Look at exported stills at the title, the transition and the end before reporting.
- Report which project and timeline you built, that the original project was saved and restored, and where any render landed.

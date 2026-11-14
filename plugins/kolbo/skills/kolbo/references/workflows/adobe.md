# Premiere Pro & After Effects Workflow

Use these rules whenever the user wants an agent to inspect, edit or animate an open Premiere Pro or After Effects project through Kolbo. The Kolbo panel inside the Adobe app is a separate desktop authority boundary: a Kolbo account is necessary, but the editor's approval inside the panel is the final gate for every change.

For motion graphics in After Effects (shape layers, animated text, effects, expressions), also read `references/workflows/after-effects-motion.md` before writing any script.

## Connect and target safely

1. Call `adobe_list_sessions` before the first Adobe action.
2. If no session is listed, ask the user to open **Window → Extensions → Kolbo Studio** in Premiere Pro or After Effects and sign in. The **AI agents** switch in the panel header connects automatically when signed in; if its dot is not green, ask them to click it. The panel must be signed into the same Kolbo account as this connector - sessions are private per account.
3. If one session is active, `session_id` may be omitted. If several are active, show each session's `name` (Premiere Pro / After Effects), `adobe_version` and id, and ask which to target. Never guess.
4. Keep the chosen `session_id` on every later Adobe call in the task. Re-list after a disconnect or app restart; ids are process-scoped.

There is no MCP logout tool. The editor turns agents off from the panel header.

## Command lifecycle and approval

Every Adobe tool except `adobe_list_sessions` and `adobe_get_command_status` returns a **command record**, not the result. Poll `adobe_get_command_status` with its `command_id` until the status is terminal: `succeeded`, `failed`, `denied` or `canceled`.

- Reads (`adobe_get_project`, `adobe_get_timeline`) run without approval. Everything else waits for **Allow once / Allow for this session / Deny** in the panel.
- `awaiting_approval` is not a polling state. Tell the user to approve or deny in the Kolbo panel, then check once more after they answer.
- `denied` is final. Do not retry the same change with cosmetic edits; ask the user what they want instead.
- "Allow for this session" lives only in the panel's memory and ends on disconnect. Never tell the user it persists and never ask them to enable it for you.
- Pass a stable `idempotency_key` when a timeout may make you retry the same command. A new intent needs a new key.

## Choosing the right tool

| Goal | Tool |
|---|---|
| See the project / active sequence or comp (tracks, clips with start/end, playhead; or comp layers) | `adobe_get_project`, `adobe_get_timeline` |
| Put a Kolbo clip in the bin, or at the Premiere playhead | `adobe_import_media`, `adobe_place_on_timeline` |
| New Premiere sequence (no dialog, copies the open sequence's settings) | `adobe_create_sequence` |
| Captions onto the active Premiere sequence | `transcribe_audio` → `adobe_import_captions` with the `.srt` URL |
| After Effects edit: comps, timed/trimmed clips, titles, solids, fades, keyframes, music | `adobe_edit_composition` |
| After Effects motion graphics beyond those operations | `adobe_run_script` (read `after-effects-motion.md`) |
| Check what it actually looks like | `adobe_capture_frame` → look at the returned `url` |

Prefer `adobe_edit_composition` whenever its operations are enough: it is validated, one undo step, and easier for the editor to approve than code.

## After Effects composition edits (`adobe_edit_composition`)

- One call applies up to 100 operations in order as **one undo step**. It stops at the first failing operation; earlier operations stay applied. Read the error, fix that operation, and continue from there - do not replay the whole batch.
- Start a new piece with `comp.create` (defaults 1920×1080, 30 fps). Later operations in the same batch target it.
- Times are **seconds on the composition timeline**. For media: `start_seconds` = where it begins, `trim_start_seconds` = seconds skipped at the head of the source, `duration_seconds` = visible length.
- Crossfade = overlap two shots by 0.3–1 s and animate the upper shot's opacity 0 → 100 across the overlap. New layers stack on top, so add the later shot after the earlier one.
- **Name every layer you will address later** and use that exact name in `layer.update` / `layer.animate`. Indexes shift as layers are added (1 = top).
- `fit: "cover"` fills the frame (default), `"contain"` letterboxes, `"none"` keeps source size. Keyframed `scale` values are absolute percentages, so animate scale on titles and solids, not on fitted media, unless you first read the fitted scale from `adobe_get_timeline`.
- Titles default to Arial Bold, white, centred. Add `stroke_width` 3–6 (black stroke) whenever text sits over bright or busy footage - white text on a light shot is invisible.
- Music: add audio with `layer.add_media`, then animate `audio_levels` from 0 dB to about −40 dB over the last 1.5–2 s for a clean fade-out.
- Solids are sent to the bottom automatically (backgrounds).

## Media rules

- Media accepts exactly one Kolbo `media_id` (preferred) or a Kolbo-owned HTTPS `url`. Third-party hosts, HTTP, private network and guessed URLs are rejected; import third-party files into Kolbo first.
- Generate first, wait for success, then pass the real media id. Never place a still-running generation.
- `adobe_place_on_timeline` has no time or track control: it uses the Premiere work sequence playhead or the active After Effects comp. For timed After Effects edits use `adobe_edit_composition`.
- `adobe_create_sequence` and `adobe_import_captions` are Premiere Pro only; `adobe_edit_composition` is After Effects only. The wrong app fails with `UNSUPPORTED_HOST`.

## Scripts (`adobe_run_script`)

- `code` is a **function body**: call `log(...)` for progress and `return` a JSON-serialisable summary. In After Effects the whole script is one undo step.
- The editor reads the exact code before approving. Keep scripts focused, named and commented; give a plain `purpose`.
- Scripts have full access to the project and the computer. Never read or write files, call `system.callSystem`, or use the network unless the user explicitly asked for exactly that.
- On `SCRIPT_ERROR` the message includes the line and the last log lines. Fix the specific problem; do not resend the same script.

## Completion proof

1. Re-read with `adobe_get_timeline` after an edit.
2. For anything visual - titles, motion graphics, layout, crossfades - call `adobe_capture_frame` at 2–4 representative times and **look at the images** before reporting. Check legibility, contrast, framing and timing.
3. Report what changed, which session was targeted, and that the editor approved it. A command is complete only when `adobe_get_command_status` shows `succeeded`.

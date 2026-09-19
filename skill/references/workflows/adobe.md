# Premiere Pro & After Effects Workflow

Use these rules whenever the user wants an agent to inspect or edit an open Premiere Pro or After Effects project through Kolbo. The Kolbo panel inside the Adobe app is a separate desktop authority boundary: a Kolbo account is necessary, but the editor's approval inside the panel is the final gate for every edit.

## Connect and target safely

1. Call `adobe_list_sessions` before the first Adobe action.
2. If no session is listed, ask the user to open **Window → Extensions → Kolbo Studio** in Premiere Pro or After Effects, sign in, and click the **AI agents** (robot) button in the panel header until its dot turns green. Do not substitute any other Kolbo tool for the panel relay.
3. If one session is active, `session_id` may be omitted. If several are active, show each session's `name` (Premiere Pro / After Effects), `adobe_version`, platform and id, and ask which to target. Never guess.
4. Keep the chosen `session_id` on every later Adobe call in the task. Re-list after a disconnect or app restart; ids are process-scoped.

There is no MCP logout tool. The editor disconnects from the panel header button.

## Inspect before changing

- Start with `adobe_get_project`, then `adobe_get_timeline` for the active Premiere sequence or After Effects composition. Both are read-only and run without approval.
- Timeline responses are bounded; pass `max_clips` when you only need the first clips.

## Command lifecycle and approval

Every Adobe tool except `adobe_list_sessions` and `adobe_get_command_status` returns a **command record**, not the result. Poll `adobe_get_command_status` with its `command_id` until the status is terminal: `succeeded`, `failed`, `denied` or `canceled`.

- `awaiting_approval` is not a polling state. Stop and tell the user to approve or deny the request in the Kolbo panel, then check once more after they answer.
- `denied` is final. Do not retry the same edit with cosmetic changes; ask the user what they want instead.
- "Allow for this session" lives only in the panel's memory and ends when the editor disconnects. Never tell the user it persists, and never ask them to enable it for you.
- Pass a stable `idempotency_key` when a timeout may cause you to retry the same command. A new intent needs a new key.

## Media, sequences and captions

- `adobe_import_media` and `adobe_place_on_timeline` accept exactly one Kolbo `media_id` (preferred) or a Kolbo-owned HTTPS `url`. Third-party hosts, HTTP, private network and guessed URLs are rejected; import third-party files into Kolbo first.
- To generate then edit: run the Kolbo generation tool, wait for its successful result, then pass the real media id. Never place a still-running generation.
- `adobe_place_on_timeline` drops the clip into a free track at the playhead of the Premiere work sequence, or into the active After Effects composition. There is no time, track, trim or transition control in v1; do not promise one. Ask the user to position the playhead first when placement matters.
- `adobe_create_sequence` and `adobe_import_captions` are Premiere Pro only. In After Effects they fail with `UNSUPPORTED_HOST`.
- For captions, create the SRT with `transcribe_audio`, then pass its Kolbo-hosted `.srt` URL to `adobe_import_captions`.
- There is no raw ExtendScript tool. If the user asks for an edit outside these commands, say it is not available through agents yet and suggest doing it in the panel or the app.

## Completion proof

1. Re-read with `adobe_get_timeline` or `adobe_get_project` after an edit.
2. Report what changed, which session was targeted, and that the editor approved it.
3. A command is complete only when `adobe_get_command_status` shows `succeeded`. An accepted enqueue is not proof the edit happened.

# Agentic Video Editor

Use these tools for a saved timeline the user can reopen and edit in Kolbo.

1. Call `list_video_editor_sessions` with the project ID, or use a session ID supplied by the user.
2. Call `get_video_editor_schema` for the current writable fields and operation schemas.
3. Call `get_video_editor_session`. Preserve its revision and stable track/item IDs.
4. Call `update_video_editor_session` with that revision as expected_revision and a bounded batch of operations. On REVISION_CONFLICT, read again and reapply the user's intent. Never blindly retry an old full timeline.
5. Read back the saved result. Export with `export_video_editor_session` only when a rendered deliverable is requested. Reuse a pending export's job_id.

For creation, `create_video_editor_session` accepts the original clips/audio/texts builder or advanced session_data, never both. Advanced data supports blank, text-only and caption-only timelines. Supply the name and authorized project ID. Import external media into Kolbo before adding its URL.

## Editing semantics

- session_flags changes isPinned, isArchived or isLocked using the same revision. A locked session requires an explicit isLocked=false request before content changes.

- session_data patches name, format, dimensions, fps, duration, background, and mediaLibrary. Supplying tracks replaces the full track array, so prefer operations for existing edits.
- Operations add/update/remove tracks and items, move items between tracks, order tracks, and order clips sequentially. Read the schema for exact argument names.
- Source trimStart and trimEnd are milliseconds removed from the source head and tail. originalDuration remains the source length. Changing trims or playbackRate recalculates timeline duration unless explicitly supplied. Fractional milliseconds are retained.
- reorder_items lays every item in one track end-to-end from the requested start. It does not move other tracks. move_item preserves duration. Track order is bottom-to-top.
- Nested settings replace the previous value. Use unset to clear an optional setting; do not merge grading presets.
- Session duration expands for new content but does not automatically shrink. Set duration explicitly to remove trailing background.
- Caption items support content, words, typography, RTL, background, stroke, shadow and captionStyle. Word startTime/endTime use absolute timeline milliseconds and must fit inside the caption item. Moving/reordering captions moves their words too. To derive captions from speech, use `transcribe_audio` first; edits themselves do not transcribe or generate media.
- Settings include transforms, opacity, visibility, audio volume/gain/fades, playback rate, grading, motion and the available text/caption effects. Consult the schema rather than inventing fields.

The tools edit saved state. An already-open browser editor must reload before manual edits continue; this is not a live browser-control channel. Revision checks protect the agent's write against changes already saved, but existing browser autosave does not participate in this revision protocol. Do not concurrently edit the same session in the browser and through tools.

Saved settings and successful exports do not prove visual parity for every renderer effect. Inspect the output before claiming visual quality. Respect the user's deployment, publishing and generation-spend boundaries.

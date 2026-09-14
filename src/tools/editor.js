'use strict';
const { z } = require('zod');

function registerEditorTools(server, client) {
  const output = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
  server.tool('get_video_editor_schema',
    'Read the full writable Video Editor schema before advanced edits. Documents every clip, track, caption and session setting, timing units, revision checks and operation semantics.', {},
    async () => output(await client.get('/v1/editor/schema')));
  server.tool('list_video_editor_sessions',
    'List saved Video Editor sessions in an accessible project. Paginated; use get_video_editor_session for full timeline data.',
    { project_id: z.string().min(1), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).max(100000).optional() },
    async args => output(await client.get(`/v1/editor/sessions?${new URLSearchParams(Object.entries(args).filter(([, value]) => value !== undefined))}`)));
  server.tool('get_video_editor_session',
    'Read an existing Video Editor timeline: stable track/item IDs, all settings, clips, captions and revision. Always read before updating.',
    { session_id: z.string().min(1).max(100) },
    async ({ session_id }) => output(await client.get(`/v1/editor/sessions/${encodeURIComponent(session_id)}`)));
  server.tool('update_video_editor_session',
    'Edit or rename a saved Video Editor session. First read get_video_editor_schema and get_video_editor_session. session_data patches settings (name, format, duration, fps, dimensions, background) or replaces tracks. operations support add/update/remove/move items and tracks, reorder_items and reorder_tracks. Full clip settings include source trims, speed, transforms, grading, audio, text and word-timed captions. Nested values replace rather than merge. All times are milliseconds. Requires the revision from the read; conflicts require re-reading. Changes save atomically without generation credits. Reload an already-open editor before manual edits.',
    { session_id: z.string().min(1).max(100), expected_revision: z.string().min(1).max(100),
      session_flags: z.object({ isPinned: z.boolean().optional(), isArchived: z.boolean().optional(), isLocked: z.boolean().optional() }).strict().optional(),
      session_data: z.record(z.unknown()).optional(), operations: z.array(z.record(z.unknown())).min(1).max(200).optional() },
    async args => output(await client.patch('/v1/editor/sessions', args)));
  server.tool('create_video_editor_session',
    'Create an editable timeline from existing Kolbo-hosted images/video, audio layers and text. No new media generation. Requires project_id with edit access. Returns session_id and editor_url. Preserve the returned ID; creation is not a polling operation.',
    {
      session_data: z.record(z.unknown()).optional().describe('Advanced initial timeline settings and tracks; read get_video_editor_schema. Use instead of clips/audio/texts. Supports blank or caption-only sessions.'),
      project_id: z.string().min(1), name: z.string().min(1).max(120),
      format: z.enum(['16:9', '9:16', '1:1', '4:5', '21:9']).optional(),
      clips: z.array(z.object({ url: z.string().url(), name: z.string().optional(), duration_ms: z.number().finite().min(0).max(1800000).optional(), trim_start_ms: z.number().finite().min(0).max(1800000).optional(), trim_end_ms: z.number().finite().min(0).max(1800000).optional(), volume: z.number().finite().min(0).max(2).optional(), muted: z.boolean().optional() })).min(1).max(60).optional(),
      audio: z.array(z.object({ url: z.string().url(), name: z.string().optional(), start_ms: z.number().finite().min(0).max(1800000).optional(), duration_ms: z.number().finite().min(0).max(1800000).optional(), volume: z.number().finite().min(0).max(2).optional(), fade_in_ms: z.number().finite().min(0).max(1800000).optional(), fade_out_ms: z.number().finite().min(0).max(1800000).optional() })).max(16).optional(),
      texts: z.array(z.object({ content: z.string().min(1).max(2000), start_ms: z.number().finite().min(0).max(1800000).optional(), duration_ms: z.number().finite().min(0).max(1800000).optional(), font_size: z.number().finite().min(8).max(512).optional(), color: z.string().optional(), vertical: z.enum(['top', 'middle', 'bottom']).optional() })).max(120).optional(),
    },
    async args => ({ content: [{ type: 'text', text: JSON.stringify(await client.post('/v1/editor/sessions', args)) }] })
  );
  server.tool('export_video_editor_session',
    'Export an owned Video Editor timeline to MP4. Identical snapshots reuse the same job. If pending, call again with the returned job_id; do not recreate the timeline. retry_failed explicitly retries a terminal failed/cancelled snapshot and cannot be combined with job_id. This exports media to the library, not a public website.',
    { session_id: z.string().min(1), quality: z.enum(['480p', '720p', '1080p']).optional(), job_id: z.string().min(1).max(100).optional(), retry_failed: z.boolean().optional() },
    async args => ({ content: [{ type: 'text', text: JSON.stringify(await client.post('/v1/editor/exports', args)) }] })
  );
}
module.exports = { registerEditorTools };

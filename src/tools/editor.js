'use strict';
const { z } = require('zod');

function registerEditorTools(server, client) {
  server.tool('create_video_editor_session',
    'Create an editable timeline from existing Kolbo-hosted images/video, audio layers and text. No new media generation. Requires project_id with edit access. Returns session_id and editor_url. Preserve the returned ID; creation is not a polling operation.',
    {
      project_id: z.string().min(1), name: z.string().min(1).max(120),
      format: z.enum(['16:9', '9:16', '1:1', '4:5', '21:9']).optional(),
      clips: z.array(z.object({ url: z.string().url(), name: z.string().optional(), duration_ms: z.number().finite().min(0).max(1800000).optional(), trim_start_ms: z.number().finite().min(0).max(1800000).optional(), trim_end_ms: z.number().finite().min(0).max(1800000).optional(), volume: z.number().finite().min(0).max(2).optional(), muted: z.boolean().optional() })).min(1).max(60),
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

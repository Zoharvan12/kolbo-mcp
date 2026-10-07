'use strict';
const { z } = require('zod');
const project = z.string().optional().describe('Authorized Kolbo project for billing; Act supplies its conversation project.');
const id = z.string().uuid().describe('Owner-scoped inspection ID returned by prepare_video_inspection.');
const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

// Additive tools. Source download and CPU-only measurements are free; provider calls
// stay explicit and billed. Never put image base64 into the language model's text.
function registerVideoInspectionTools(server, client) {
  server.tool('prepare_video_inspection',
    'Prepare a private source snapshot for adaptive video/audio investigation, including long recordings up to 2 GB. Streams the source once; returns promptly with preparing status. Poll get_video_inspection until ready. Accepts public direct media file URLs, not YouTube pages. Snapshot expires after two hours. No provider analysis or credits. Reuse the returned ID for frames, cuts and audio; refresh only when the URL content changed.',
    { video_url: z.string().url(), refresh: z.boolean().optional(), project_id: project },
    async ({ video_url, refresh }) => text(await client.post('/v1/analyze/video-inspections', { video_url, refresh })));
  server.tool('get_video_inspection', 'Check source preparation, duration, streams, dimensions, source version and limits. Do not poll unchanged status in a tight loop.',
    { inspection_id: id, project_id: project }, async ({ inspection_id }) => text(await client.get(`/v1/analyze/video-inspections/${inspection_id}`)));
  server.tool('cancel_video_inspection', 'Stop preparation/extraction and expire your private snapshot. A paid provider request already accepted may still complete and be charged. Source media in the library is unchanged.',
    { inspection_id: id, project_id: project }, async ({ inspection_id }) => text(await client.post(`/v1/analyze/video-inspections/${inspection_id}/cancel`, {})));
  server.tool('inspect_video',
    'Extract bounded evidence from a prepared recording. frames returns timestamped contact-sheet IMAGE blocks (up to12 frames,6 per sheet); frame returns one larger IMAGE. Choose explicit timestamps or evenly sampled range/frame_count. cuts measures candidate changes on a640px/8fps proxy and must be verified against nearby frames. audio/clip extracts a private interval for transcribe_video_evidence or analyze_video_evidence. audio_levels measures volume/silence only. Each cut/audio/clip/levels interval is at most120 seconds. Sparse frames are observations, never proof of continuous review. Repeated identical requests reuse evidence. No provider credits.',
    { inspection_id: id, kind: z.enum(['frames', 'frame', 'cuts', 'audio', 'clip', 'audio_levels']).optional(),
      timestamps: z.array(z.number().nonnegative()).min(1).max(12).optional(),
      start_seconds: z.number().nonnegative().optional(), end_seconds: z.number().positive().optional(),
      frame_count: z.number().int().min(1).max(12).optional(), project_id: project },
    async ({ inspection_id, project_id, ...args }) => {
      const result = await client.post(`/v1/analyze/video-inspections/${inspection_id}/evidence`, args, { timeoutMs: 115000 });
      const { images = [], ...metadata } = result;
      return { content: [{ type: 'text', text: JSON.stringify({ ...metadata, images: images.map(({ data, ...entry }) => entry) }) },
        ...images.map(img => ({ type: 'image', mimeType: img.mime_type, data: img.data }))] };
    });
  server.tool('analyze_video_evidence',
    'Run paid video, music, speech or sound understanding on a previously extracted interval only. Video focus requires clip evidence; audio focus accepts audio or clip. Useful for motion/continuity, instruments/rhythm/mood, speech context and sound design. For word timestamps/SRT use transcribe_video_evidence. Returned analysis timestamps are clip-relative: add source_offset_seconds. Real model usage is billed, and identical successful requests reuse saved analysis without new charges. An uncertain previous paid request is never automatically resubmitted.',
    { inspection_id: id, evidence_id: z.string().regex(/^[a-f0-9]{24}$/),
      focus: z.enum(['video', 'speech', 'music', 'sound']).optional(), prompt: z.string().max(2000).optional(),
      quality: z.enum(['standard', 'hq']).optional(), project_id: project },
    async ({ inspection_id, ...args }) => text(await client.post(`/v1/analyze/video-inspections/${inspection_id}/analyze`, args, { timeoutMs: 590000 })));
  server.tool('transcribe_video_evidence',
    'Transcribe an extracted audio interval using speech recognition with speaker labels, word timings and SRT. First inspect_video kind=audio for an interval up to120 seconds. Auto-detects language. Words include source_start/source_end in original recording seconds; SRT is clip-relative. Billed per rounded minute at current subtitle transcription pricing. Identical evidence/project requests reuse the transcript. For long recordings, transcribe selected windows or cover explicit consecutive windows and preserve their source offsets; never claim untranscribed audio was reviewed.',
    { inspection_id: id, evidence_id: z.string().regex(/^[a-f0-9]{24}$/), project_id: project },
    async ({ inspection_id, ...args }) => text(await client.post(`/v1/analyze/video-inspections/${inspection_id}/analyze`, { ...args, focus: 'transcription' }, { timeoutMs: 150000 })));
}
module.exports = { registerVideoInspectionTools };

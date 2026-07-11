/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { projectIdField, uiGenerating, appsEnabled } = require('./_shared');
const { UI, uiResult } = require('../apps');

/* ────────────────────────────────────────────────────────────────────────────
 * Shorts Creator — two-phase job flow (NOT the generic generation state
 * machine, so it doesn't use ../polling.js):
 *
 *   1. shorts_analyze  → POST /v1/generate/shorts/analyze (flat 15 credits)
 *      job.phase: ANALYZING → AWAITING_SELECTION (moments ready to pick)
 *   2. shorts_render   → POST /v1/generate/shorts/:jobId/render
 *      job.phase: RENDERING → COMPLETED | PARTIALLY_COMPLETED | FAILED | CANCELLED
 *
 * All routes return { status: true, data: <job or payload> }.
 * ──────────────────────────────────────────────────────────────────────────*/

const TERMINAL_PHASES = new Set(['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED']);

// Same transient-tolerance philosophy as ../polling.js: a kolbo-api restart or
// network blip mid-poll must not abandon a job that's still rendering.
const TRANSIENT_STATUS_CODES = new Set([0, 408, 425, 429, 500, 502, 503, 504, 522, 524]);
function isTransientPollError(err) {
  if (!err) return false;
  if (err.name === 'TypeError') return true;
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'EPIPE') return true;
  const status = err.status ?? err.options?.status;
  if (typeof status === 'number' && TRANSIENT_STATUS_CODES.has(status)) return true;
  return false;
}

class ShortsPollingTimeoutError extends Error {
  constructor(jobId, timeoutMs, phase) {
    const seconds = Math.round(timeoutMs / 1000);
    super(
      `Shorts job timed out after ${seconds}s of polling (last phase: ${phase || 'unknown'}). ` +
      `The job may STILL be running on the server — call shorts_status with job_id="${jobId}" to check. ` +
      `Analysis usually takes 1-3 min; rendering can take 5-20 min.`
    );
    this.name = 'ShortsPollingTimeoutError';
    this.jobId = jobId;
    this.timedOut = true;
  }
}

/**
 * Poll GET /v1/generate/shorts/:jobId/status until `until(job)` is true or
 * a terminal phase is reached. Returns the raw job object.
 */
async function pollShortsJob(client, jobId, { until, interval = 10000, timeout = 300000 } = {}) {
  const startTime = Date.now();
  let transientFailures = 0;
  let lastPhase = null;

  while (true) {
    if (Date.now() - startTime > timeout) {
      throw new ShortsPollingTimeoutError(jobId, timeout, lastPhase);
    }

    let job;
    try {
      const result = await client.get(`/v1/generate/shorts/${encodeURIComponent(jobId)}/status`);
      job = result.data || result;
      transientFailures = 0;
    } catch (err) {
      if (isTransientPollError(err)) {
        transientFailures++;
        if (transientFailures > 30) throw err;
        const backoff = Math.min(interval * Math.pow(1.5, Math.min(transientFailures - 1, 5)), 30000);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw err;
    }

    lastPhase = job.phase;
    if (until(job) || TERMINAL_PHASES.has(job.phase)) return job;

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// Compact summary of a job's rendered shorts (drop internal noise).
function summarizeShorts(shorts) {
  return (shorts || []).map((s) => ({
    moment_index: s.momentIndex,
    status: s.status,
    mode: s.mode,
    preset: s.presetIdentifier,
    final_url: s.finalUrl || null,
    duration: s.duration ?? null,
    error: s.error_message || null
  }));
}

function summarizeMoments(moments) {
  return (moments || []).map((m, i) => ({
    moment_index: i,
    start: m.start,
    end: m.end,
    title: m.title,
    hook: m.hook,
    score: m.score,
    accent_beats: (m.accentBeats || []).map((b) => ({ start: b.start, end: b.end, reason: b.reason }))
  }));
}

// Shared zod schema for the shorts selection array used by both
// shorts_estimate and shorts_render. Snake_case args (MCP house style) are
// mapped to the backend's camelCase in buildSelectionBody().
const shortsSelectionField = z.array(z.object({
  moment_index: z.number().int().min(0).describe('Index of the moment in the analysis.moments array returned by shorts_analyze / shorts_status.'),
  mode: z.enum(['accents', 'full']).optional().describe('"accents" = restyle only the strongest beats of the moment (cheaper, 1-3 restyled chunks). "full" = restyle the entire clip (pricier, one chunk per ~10s). Omit to use the preset\'s default_mode.'),
  preset_identifier: z.string().describe('Style preset identifier from shorts_list_presets (each preset has a name, description, and preview video).'),
  subtitles_enabled: z.boolean().optional().describe('Burn subtitles into the short. The restyle itself NEVER adds text — subtitles come only from this step. Default: false.'),
  subtitles_preset: z.string().optional().describe('VEED subtitle style preset name (default "glass"). Only used when subtitles_enabled is true.'),
  start: z.number().optional().describe('Optional override of the moment\'s start time in seconds (trim/extend the suggested window). Final short must be 15-90s.'),
  end: z.number().optional().describe('Optional override of the moment\'s end time in seconds. Final short must be 15-90s.'),
  delete_ranges: z.array(z.object({
    start: z.number().describe('Range start in ABSOLUTE source-video seconds.'),
    end: z.number().describe('Range end in ABSOLUTE source-video seconds.')
  })).optional().describe('Optional ranges to CUT from the short (dead air, filler, tangents). Times are absolute source seconds (same timeline as the moment\'s start/end). The server enforces at least 8s of remaining footage after cuts. Cuts shorten the effective duration, so shorts_estimate reflects a cheaper chunk count.'),
  srt_content: z.string().optional().describe('Optional user-edited SRT subtitle content (max 200KB). Timestamps must be in the CUT timeline (after delete_ranges are applied), starting at 0. Build it from shorts_get_transcript word timings. Providing this implies burned-in subtitles unless subtitles_enabled is explicitly false.')
})).min(1).max(5).describe('Up to 5 shorts to price/render, each picking one analyzed moment + a style preset.');

function buildSelectionBody(shorts) {
  return {
    shorts: shorts.map((s) => {
      const out = { momentIndex: s.moment_index, presetIdentifier: s.preset_identifier };
      if (s.mode) out.mode = s.mode;
      if (s.subtitles_enabled != null || s.subtitles_preset || s.srt_content) {
        out.subtitles = {
          // srt_content implies subtitles unless subtitles_enabled is explicitly false
          enabled: s.subtitles_enabled != null ? !!s.subtitles_enabled : !!s.srt_content,
          veedPreset: s.subtitles_preset || 'glass'
        };
        if (s.srt_content) out.subtitles.srtContent = s.srt_content;
      }
      if (s.start != null) out.start = s.start;
      if (s.end != null) out.end = s.end;
      if (Array.isArray(s.delete_ranges) && s.delete_ranges.length) {
        out.deleteRanges = s.delete_ranges.map((r) => ({ start: r.start, end: r.end }));
      }
      return out;
    })
  };
}

function registerShortsCreatorTools(server, client, options = {}) {
  // MCP Apps hosts (claude.ai remote connector, Claude Desktop) get widget
  // results; text-only hosts keep the exact blocking behavior below.
  const ui = () => appsEnabled(server, options);
  // ─── shorts_analyze ───────────────────────────────────────────
  server.tool(
    'shorts_analyze',
    'PHASE 1 of the Shorts Creator: analyze a long video (up to 30 min) and get back the AI-picked best moments for short-form clips. Costs a flat 15 credits. The video URL MUST be a Kolbo media-library URL — upload local/external files first with upload_media. This tool submits the analysis and polls until the moments are ready (usually 1-3 min), then returns the moments list: each has start/end (seconds in the source), a title, a hook, a virality score, and accent beats. NEXT STEP: show the moments to the user, pick up to 5, choose a style preset (shorts_list_presets) + mode ("accents" = cheaper, restyles only the strongest beats; "full" = pricier, restyles everything), optionally price with shorts_estimate, then start PHASE 2 with shorts_render.',
    {
      video_url: z.string().describe('Kolbo media-library URL of the source video (from upload_media / list_media). External URLs are rejected — upload first. Source must be between ~30s and 30 min.'),
      project_id: projectIdField
    },
    async ({ video_url, project_id }) => {
      const submitted = await client.post('/v1/generate/shorts/analyze', { video_url, project_id });
      const d = submitted.data || {};
      const jobId = d.jobId;

      let job;
      try {
        job = await pollShortsJob(client, jobId, {
          until: (j) => j.phase === 'AWAITING_SELECTION',
          interval: 10000,
          timeout: 300000 // ~5 min — analysis usually takes 1-3 min
        });
      } catch (err) {
        if (err.timedOut) {
          return { content: [{ type: 'text', text: `${err.message}\n\njob_id: ${jobId}` }] };
        }
        throw err;
      }

      if (job.phase === 'FAILED' || job.phase === 'CANCELLED') {
        throw new Error(`Shorts analysis ${job.phase.toLowerCase()}: ${job.error_message || 'unknown error'} (job_id="${jobId}")`);
      }

      const moments = summarizeMoments(job.analysis?.moments);
      const text = JSON.stringify({
        job_id: jobId,
        phase: job.phase,
        analysis_credits: d.analysisCredits,
        source: d.source || job.source,
        moments,
        _followup_hint: 'Show these moments to the user and let them pick up to 5. Then call shorts_list_presets for styles, optionally shorts_estimate to price the selection (free), and shorts_render to produce the shorts. Each rendered short must be 15-90s.'
      }, null, 2);

      if (ui()) return uiResult(UI.mediaGrid, text, {
        widget: 'media-grid',
        title: 'Shorts — Best Moments',
        items: moments.map((m) => {
          const duration = (m.end != null && m.start != null) ? m.end - m.start : null;
          return {
            id: String(m.moment_index),
            title: 'Moment ' + m.moment_index + (duration ? ' · ' + Math.round(duration) + 's' : ''),
            subtitle: String(m.title || m.hook || '').slice(0, 80),
            media_type: 'video',
            use_hint: `Render short for moment {ID} of shorts job ${jobId} (shorts_render). First shorts_estimate it.`
          };
        }),
        total: moments.length
      });

      return { content: [{ type: 'text', text }] };
    }
  );

  // ─── shorts_estimate ──────────────────────────────────────────
  server.tool(
    'shorts_estimate',
    'Price a Shorts Creator selection BEFORE rendering — free, no credits charged. Pass the job_id from shorts_analyze and the shorts selection (moments + presets + modes + subtitles, plus optional delete_ranges cuts / edited srt_content). delete_ranges shorten the effective duration, so the estimate gets cheaper. Returns total credits and a per-short breakdown with chunk counts. Pricing: each restyled chunk is a flat 200 credits ("accents" mode = 1-3 chunks per short, "full" mode = one chunk per ~10s of clip length); burned-in subtitles add 40 credits/min (60s minimum). Call this to confirm cost with the user before shorts_render.',
    {
      job_id: z.string().describe('The Shorts job id from shorts_analyze.'),
      shorts: shortsSelectionField
    },
    async ({ job_id, shorts }) => {
      const result = await client.post(`/v1/generate/shorts/${encodeURIComponent(job_id)}/estimate`, buildSelectionBody(shorts));
      const d = result.data || {};
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            job_id,
            total_credits: d.totalCredits,
            per_short: (d.perShort || []).map((p) => ({ moment_index: p.momentIndex, credits: p.credits, chunk_count: p.chunkCount })),
            _followup_hint: 'If the user approves the cost, call shorts_render with the SAME shorts selection.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── shorts_render ────────────────────────────────────────────
  server.tool(
    'shorts_render',
    'PHASE 2 of the Shorts Creator: render the selected shorts (max 5, each 15-90s). Credits are reserved up-front (price with shorts_estimate first); any short that fails is auto-refunded. Each short takes one analyzed moment and applies a style preset in "accents" mode (restyle only the strongest beats, cheaper) or "full" mode (restyle everything, pricier), plus optional burned-in subtitles (VEED preset, default "glass" — the restyle itself NEVER adds text). Per short you can also pass delete_ranges (cut dead air / filler, absolute source seconds, ≥8s must remain) and srt_content (user-edited SRT, cut-timeline timestamps — build it with shorts_get_transcript). This tool submits the render and polls until done (can take 5-20 min), then returns each short\'s final video URL. On PARTIALLY_COMPLETED it returns both the successes (with URLs) and the failures (with errors, refunded).',
    {
      job_id: z.string().describe('The Shorts job id from shorts_analyze (must be in AWAITING_SELECTION phase).'),
      shorts: shortsSelectionField
    },
    async ({ job_id, shorts }) => {
      await client.post(`/v1/generate/shorts/${encodeURIComponent(job_id)}/render`, buildSelectionBody(shorts));

      // UI hosts: return immediately — the generation widget polls shorts_status
      // itself (shorts_status adds widget-friendly state/result fields when
      // the job reaches a terminal phase).
      if (ui()) return uiGenerating({
        tool: 'generate_video', kind: 'video',
        gen: { generation_id: job_id }, client,
        model: 'Shorts Creator',
        prompt: 'Rendering ' + shorts.length + ' short(s)',
        count: Math.min(shorts.length, 4),
        settings: { mode: 'shorts' },
        poll_tool: 'shorts_status',
        status_args: { job_id },
      });

      let job;
      try {
        job = await pollShortsJob(client, job_id, {
          until: (j) => TERMINAL_PHASES.has(j.phase),
          interval: 12000,
          timeout: 1500000 // 25 min — rendering can take 5-20 min
        });
      } catch (err) {
        if (err.timedOut) {
          return { content: [{ type: 'text', text: `${err.message}\n\njob_id: ${job_id}` }] };
        }
        throw err;
      }

      if (job.phase === 'FAILED') {
        throw new Error(`Shorts render failed: ${job.error_message || 'all shorts failed'} (job_id="${job_id}"). Reserved credits for failed shorts are auto-refunded.`);
      }
      if (job.phase === 'CANCELLED') {
        throw new Error(`Shorts job was cancelled (job_id="${job_id}"). Unused credits were refunded.`);
      }

      const all = summarizeShorts(job.shorts);
      const succeeded = all.filter((s) => s.final_url);
      const failed = all.filter((s) => !s.final_url);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            job_id,
            phase: job.phase,
            shorts: succeeded,
            ...(failed.length ? { failed_shorts: failed, _note: 'Credits for failed shorts are automatically refunded.' } : {}),
            _followup_hint: 'Each final_url is a finished vertical short. To restyle differently, render again from the same job with a different preset/mode.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── shorts_status ────────────────────────────────────────────
  server.tool(
    'shorts_status',
    'Get the current state of a Shorts Creator job in one read (no polling). Use after a shorts_analyze / shorts_render timeout, or to resume a job later. Phases: ANALYZING → AWAITING_SELECTION (moments ready — pick and render) → RENDERING → COMPLETED / PARTIALLY_COMPLETED / FAILED / CANCELLED. Returns the moments list when awaiting selection and the shorts (with final URLs) when rendering/done.',
    {
      job_id: z.string().describe('The Shorts job id.')
    },
    async ({ job_id }) => {
      const result = await client.get(`/v1/generate/shorts/${encodeURIComponent(job_id)}/status`);
      const job = result.data || {};
      const out = { job_id, phase: job.phase };
      if (job.source) out.source = job.source;
      if (job.analysis?.moments?.length) out.moments = summarizeMoments(job.analysis.moments);
      if (job.shorts?.length) out.shorts = summarizeShorts(job.shorts);
      if (job.error_message) out.error = job.error_message;

      // ADDITIVE widget-compat fields (MCP Apps generation widget polls this
      // tool and expects lowercase state + result.urls — see
      // src/apps/widgets/generation.js poll()). Existing fields untouched.
      if (job.phase === 'COMPLETED' || job.phase === 'PARTIALLY_COMPLETED') {
        const urls = (out.shorts || []).map((s) => s.final_url).filter(Boolean);
        if (urls.length) {
          out.state = 'completed';
          out.result = { urls };
        } else {
          out.state = 'failed';
        }
      } else if (job.phase === 'FAILED') {
        out.state = 'failed';
      } else if (job.phase === 'CANCELLED') {
        out.state = 'cancelled';
      }

      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    }
  );

  // ─── shorts_get_transcript ────────────────────────────────────
  server.tool(
    'shorts_get_transcript',
    'Get the word-level transcript of a Shorts Creator job\'s source video (from the analysis-phase Scribe transcription — free, no extra credits). Returns { words, language, sourceDuration } where each word has its text and start/end times in ABSOLUTE source seconds. Use this for the Review & Edit workflow: map words to the picked moment\'s window, decide delete_ranges (filler/dead air to cut, absolute source seconds), and build an edited SRT (srt_content, timestamps in the CUT timeline) to pass in the shorts_estimate / shorts_render selection.',
    {
      job_id: z.string().describe('The Shorts job id from shorts_analyze (analysis must be complete).')
    },
    async ({ job_id }) => {
      const result = await client.get(`/v1/generate/shorts/${encodeURIComponent(job_id)}/transcript`);
      const d = result.data || {};
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            job_id,
            language: d.language || null,
            source_duration: d.sourceDuration ?? null,
            words: d.words || [],
            _followup_hint: 'Word times are absolute source seconds. To edit a short: pick delete_ranges (absolute source seconds, ≥8s must remain) and/or build an edited SRT whose timestamps are in the cut timeline (after deletions), then pass delete_ranges / srt_content per short to shorts_estimate and shorts_render.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── shorts_list_presets ──────────────────────────────────────
  server.tool(
    'shorts_list_presets',
    'List the Shorts Creator style presets — each restyles the picked moment into a distinct visual style (identifier, name, description, thumbnail, preview video, default mode, default subtitle preset, category). Call before shorts_estimate / shorts_render so the user can pick a style; pass the `identifier` as preset_identifier.',
    {},
    async () => {
      const result = await client.get('/v1/generate/shorts/presets');
      const presets = (result.data || []).map((p) => ({
        identifier: p.identifier,
        name: p.name,
        description: p.description,
        category: p.category,
        default_mode: p.default_mode,
        default_subtitle_preset: p.default_veed_preset,
        thumbnail_url: p.thumbnail_url,
        preview_video_url: p.preview_video_url
      }));
      return { content: [{ type: 'text', text: JSON.stringify({ count: presets.length, presets }, null, 2) }] };
    }
  );

  // ─── shorts_cancel ────────────────────────────────────────────
  server.tool(
    'shorts_cancel',
    'Cancel a running Shorts Creator job (analysis or render) and refund all unused reserved credits. Use when the user changes their mind or a job is stuck.',
    {
      job_id: z.string().describe('The Shorts job id to cancel.')
    },
    async ({ job_id }) => {
      const result = await client.post(`/v1/generate/shorts/${encodeURIComponent(job_id)}/cancel`, {});
      return { content: [{ type: 'text', text: JSON.stringify({ job_id, cancelled: true, ...(result.data && typeof result.data === 'object' ? result.data : {}) }, null, 2) }] };
    }
  );
}

module.exports = { registerShortsCreatorTools };

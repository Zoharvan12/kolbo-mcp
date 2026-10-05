/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

// Trends: plug-and-play generations with a hidden recipe. The caller fills the
// trend's declared inputs (photos, a clip, a name) and gets ONE final result;
// the steps in between stay private. Motion Library presets are served as
// trends too (slug "motion/<name>"). Contract: kolbo-api src/modules/trends.

const { randomUUID } = require('crypto');
const { z } = require('zod');
const { UI, uiResult } = require('../apps');

const slugField = z.string().min(1).max(200).regex(/^[\w-]+(\/[\w-]+)?$/)
  .describe('Trend slug from list_trends, e.g. "vanish" or "motion/kolbo-urban-dance-glide".');
const inputsField = z.record(z.string(), z.union([z.string().max(2048), z.array(z.string().max(2048)).min(1).max(3)]))
  .describe('Values for the trend\'s declared inputs, keyed by input `key` from get_trend. Media inputs take an https URL (upload local files with upload_media / create_upload_ticket first); a photo input with max_images > 1 also takes an ARRAY of up to that many photos of the same subject (more angles = better likeness). Text inputs take plain text.');
const dnaField = z.record(z.string(), z.string().regex(/^[a-f0-9]{24}$/i)).optional()
  .describe('Use a saved Visual DNA for a photo input: { input key: visual DNA id } (ids from list_visual_dnas). The DNA\'s own character sheet and photos are used for that input, so leave that key out of inputs.');
const previewField = z.boolean().optional()
  .describe('Run a short preview (~4 s cut of the trend, priced at its own length) instead of the full video. Only trends whose get_trend shows `preview`.');
const resolutionField = z.enum(['480p', '720p', '1080p']).optional()
  .describe('Render resolution for video trends (see resolutions in get_trend). Default: the trend\'s own. Higher costs more; quote it with estimate_trend_run.');
const projectField = z.string().min(1).max(128).optional()
  .describe('Project to run in. Omit for the default "API Generations" project.');

// Keep the slash between "motion" and the preset name; encode each segment.
const slugPath = slug => String(slug).split('/').map(encodeURIComponent).join('/');
const unwrap = r => (r && r.status === true && r.data !== undefined ? r.data : r);
const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function trendTile(t) {
  const example = (t.examples || [])[0] || {};
  const poster = t.cover?.image || example.poster;
  return {
    id: t.slug,
    title: t.name,
    subtitle: t.estimated_credits ? `~${t.estimated_credits} credits` : undefined,
    thumbnail: poster,
    url: t.cover?.video || example.output || poster,
    media_type: t.output_type === 'image' ? 'image' : 'video',
    use_hint: 'Run the "{TITLE}" trend (slug: {ID}) with my media.',
  };
}

function runTile(r) {
  return {
    id: r.run_id,
    title: r.trend_name || r.trend,
    subtitle: r.status === 'completed' ? 'Done' : r.status === 'failed' ? 'Failed' : `${r.status} · ${r.progress || 0}%`,
    thumbnail: (r.output_type === 'image' && r.output?.url) || r.trend_cover,
    url: r.output?.url || r.trend_cover,
    media_type: r.output?.type === 'image' || r.output_type === 'image' ? 'image' : 'video',
    use_hint: 'Show trend run {ID}.',
  };
}

// Poll one run until it finishes or the window closes. A closed window is NOT a
// failure: the run keeps going server-side and get_trend_run picks it up.
async function waitForRun(client, runId, maxMs) {
  const deadline = Date.now() + maxMs;
  let run;
  for (;;) {
    run = unwrap(await client.get(`/v1/trends/runs/${encodeURIComponent(runId)}`));
    if (TERMINAL.has(run.status) || Date.now() >= deadline) return run;
    await sleep(5000);
  }
}

function runResult(run) {
  if (!TERMINAL.has(run.status)) {
    run._hint = `Still running (this is normal — video trends take a few minutes). Call get_trend_run with run_id="${run.run_id}" and wait=true. Do NOT start the trend again.`;
  }
  return text(run);
}

function registerTrendTools(server, client) {
  server.tool(
    'list_trends',
    'Browse Kolbo Trends: one-click generations with a hidden recipe (e.g. put yourself in a viral clip, turn a photo into an action figure). Includes Motion Library presets (slugs starting "motion/") that restyle or recast a video. Each trend lists the inputs it needs, its output type and an estimated credit cost. Run one with run_trend.',
    {
      family: z.enum(['viral', 'image', 'swap', 'product', 'motion']).optional().describe('Filter by family. "motion" = Motion Library presets only.'),
      search: z.string().max(100).optional().describe('Case-insensitive match on name, description and tags.'),
      include_motion: z.boolean().optional().describe('Include Motion Library presets when no family is set. Default true.'),
    },
    async ({ family, search, include_motion } = {}) => {
      const wantMotion = family === 'motion' || (!family && include_motion !== false);
      const [base, motion] = await Promise.all([
        family === 'motion' ? null : client.get('/v1/trends' + (family ? `?family=${encodeURIComponent(family)}` : '')),
        wantMotion ? client.get('/v1/trends/motion') : null,
      ]);
      const baseData = unwrap(base) || {};
      const q = (search || '').trim().toLowerCase();
      const trends = [...(baseData.trends || []), ...((unwrap(motion) || {}).trends || [])]
        .filter(t => !q || [t.name, t.description, ...(t.tags || [])].some(s => s && String(s).toLowerCase().includes(q)));
      const summary = trends.map(t => ({
        slug: t.slug, name: t.name, description: t.description, family: t.family, output_type: t.output_type,
        estimated_credits: t.estimated_credits, free_trial: t.free_trial, badges: t.badges,
        inputs: (t.inputs || []).map(i => ({ key: i.key, kind: i.kind, role: i.role, label: i.label, required: i.required, ...(i.max_images && { max_images: i.max_images }) })),
        ...(t.preview && { preview: t.preview }),
      }));
      return uiResult(UI.mediaGrid, JSON.stringify({ trends: summary, count: summary.length, free_trials_left: baseData.free_trials_left ?? null }, null, 2), {
        widget: 'media-grid',
        title: family === 'motion' ? 'Motion Library' : 'Trends',
        items: trends.slice(0, 300).map(trendTile),
        total: trends.length,
        has_more: trends.length > 300,
      });
    }
  );

  server.tool(
    'get_trend',
    'Get one trend: description, the exact inputs it needs (key, kind: image/video/audio/text/choice, role: what the input is (character/pet/product/location/video/text) - a character input also takes a Visual DNA image URL, required, options), output type/aspect ratio, estimated credits, example results and whether a free trial is available.',
    { slug: slugField },
    async ({ slug }) => text(unwrap(await client.get(`/v1/trends/${slugPath(slug)}`)))
  );

  server.tool(
    'estimate_trend_run',
    'Quote a trend run before spending: returns total_credits for these exact inputs (video trends are priced by the source clip length). Free — no credits spent.',
    { slug: slugField, inputs: inputsField, dna: dnaField, preview: previewField, project_id: projectField, resolution: resolutionField },
    async ({ slug, inputs, dna, preview, project_id, resolution }) => text(unwrap(await client.post(`/v1/trends/${slugPath(slug)}/estimate`, { inputs, ...(dna && { dna }), ...(preview && { preview: true }), ...(project_id && { project_id }), ...(resolution && { resolution }) })))
  );

  server.tool(
    'run_trend',
    'Run a trend. SPENDS CREDITS (quote with estimate_trend_run first and confirm with the user unless they already agreed). Returns one final result; intermediate steps are private. Waits up to wait_seconds for the result, then returns the run so you can keep checking with get_trend_run. Reuse the same idempotency_key after an uncertain response — a new key starts (and charges) a new run.',
    {
      slug: slugField,
      inputs: inputsField,
      dna: dnaField,
      preview: previewField,
      project_id: projectField,
      resolution: resolutionField,
      max_credits: z.number().finite().min(0).optional().describe('Credit ceiling for this run. Default: the trend\'s own ceiling.'),
      free_trial: z.boolean().optional().describe('Use one of the account\'s free trend runs (only trends with free_trial: true).'),
      idempotency_key: z.string().regex(/^[A-Za-z0-9_.:-]{8,100}$/).optional().describe('8–100 chars. Omit to have one generated; pass the SAME key to retry an uncertain request.'),
      wait: z.boolean().optional().describe('Wait for the result. Default true.'),
      wait_seconds: z.number().int().min(0).max(170).optional().describe('How long to wait before returning. Default 150.'),
    },
    async ({ slug, inputs, dna, preview, project_id, resolution, max_credits, free_trial, idempotency_key, wait, wait_seconds }) => {
      const body = { inputs, ...(dna && { dna }), ...(preview && { preview: true }), idempotency_key: idempotency_key || randomUUID(), ...(project_id && { project_id }), ...(resolution && { resolution }), ...(max_credits !== undefined && { max_credits }), ...(free_trial && { free_trial: true }) };
      const started = unwrap(await client.post(`/v1/trends/${slugPath(slug)}/runs`, body));
      started.idempotency_key = body.idempotency_key;
      if (wait === false || TERMINAL.has(started.status)) return runResult(started);
      const run = await waitForRun(client, started.run_id, (wait_seconds ?? 150) * 1000);
      return runResult({ ...run, idempotency_key: body.idempotency_key });
    }
  );

  server.tool(
    'get_trend_run',
    'Check a trend run: status (running/completed/failed/cancelled), progress %, and the final output URL when done. Pass wait=true to block until it finishes (up to ~2.5 minutes) instead of polling in a loop.',
    {
      run_id: z.string().min(1).max(128),
      wait: z.boolean().optional().describe('Block until the run finishes or ~150s pass.'),
    },
    async ({ run_id, wait }) => runResult(wait ? await waitForRun(client, run_id, 150000) : unwrap(await client.get(`/v1/trends/runs/${encodeURIComponent(run_id)}`)))
  );

  server.tool(
    'list_trend_runs',
    'List the user\'s recent trend runs in a project (newest first) with status, progress and final output.',
    {
      project_id: projectField,
      limit: z.number().int().min(1).max(100).optional().describe('Default 30.'),
    },
    async ({ project_id, limit } = {}) => {
      const params = new URLSearchParams();
      if (project_id) params.set('project_id', project_id);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      const runs = (unwrap(await client.get('/v1/trends/runs' + (qs ? `?${qs}` : ''))) || {}).runs || [];
      return uiResult(UI.mediaGrid, JSON.stringify({ runs, count: runs.length }, null, 2), {
        widget: 'media-grid',
        title: 'Trend runs',
        items: runs.map(runTile),
        total: runs.length,
        has_more: false,
      });
    }
  );

  server.tool(
    'cancel_trend_run',
    'Cancel a running trend run and release its unspent credits. Free-trial runs cannot be cancelled.',
    { run_id: z.string().min(1).max(128) },
    async ({ run_id }) => text(unwrap(await client.post(`/v1/trends/runs/${encodeURIComponent(run_id)}/cancel`, {})))
  );
}

module.exports = { registerTrendTools };

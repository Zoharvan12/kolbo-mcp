'use strict';

// USD API keys (Kolbo API / developer platform) pay from a USD wallet and are
// refused on /api/v1 by kolbo-api's key boundary. For such a key the MCP routes
// the tools the developer console covers to /api/developer-console:
// catalog -> quote -> (second identical call) job -> poll -> result, priced in USD.
// Every other tool answers with a clear "not available on USD API plans yet".

const crypto = require('crypto');
const FormData = require('form-data');
const progress = require('./progress');
const { resolveToBuffer } = require('./tools/_shared');

const SUPPORTED = ['check_credits', 'list_models', 'generate_image', 'generate_image_edit', 'generate_video',
  'generate_video_from_image', 'generate_elements', 'get_generation_status'];
const POLL_MS = 5000;
const WAIT_MS = 140000; // returns before the ~180s host timeout, like the credit tools
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HINTS = {
  INVALID_QUOTE_CONFIGURATION: 'Some setting is not offered for this model. Call list_models and use only the resolutions, aspect ratios, durations and qualities listed for it.',
  QUOTE_MODEL_UNSUPPORTED: 'This model cannot be quoted on USD API plans. Call list_models for the models that can.',
  INSUFFICIENT_FUNDS: 'The USD balance is too low. Add funds in the Kolbo developer console.',
  GENERATION_UNAVAILABLE: 'Generation is paused on the Kolbo API right now. Try again later.',
  INPUT_UPLOADS_UNAVAILABLE: 'Reference uploads are paused on the Kolbo API right now.',
  CONCURRENCY_LIMIT: 'Twenty jobs are already running on this account. Wait for one to finish.',
  INPUT_RATE_LIMIT: 'Uploads are limited to six a minute. Wait a minute and call again.',
};

let detected; // Promise<boolean>, per process
const pending = new Map(); // tool + args -> accepted quote awaiting the confirming call
let catalog; // { at, models }

const usd = micro => `$${(micro / 1e6).toFixed(micro < 100000 ? 4 : 2)}`;
const text = (value, isError) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }], ...(isError && { isError: true }) });

async function dc(client, method, path, body) {
  const headers = { 'X-API-Key': client.apiKey };
  let payload;
  if (body instanceof FormData) { payload = body.getBuffer(); Object.assign(headers, body.getHeaders()); }
  else if (body) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await fetch(`${client.baseUrl}/developer-console${path}`, { method, headers, body: payload, signal: progress.signal() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data.error?.code || data.code || `HTTP_${res.status}`;
    const error = new Error(`Kolbo API (USD) refused ${method} ${path.split('?')[0]}: ${code}. ${HINTS[code] || data.error?.message || data.message || ''}`.trim());
    error.code = code; error.status = res.status;
    throw error;
  }
  return data;
}

/** True when the configured key is a USD developer-console key. One cheap read per process. */
function isUsd(client) {
  if (!client.apiKey) return Promise.resolve(false);
  detected ||= dc(client, 'GET', '/account').then(data => (usdKey = data.account?.id ? client.apiKey : null) !== null, error => {
    if (error.status >= 400 && error.status < 500) return false; // credit keys get USD_KEY_REQUIRED
    detected = undefined; return false; // network trouble: decide again on the next call
  });
  return detected;
}
let usdKey = null;
/** Already confirmed USD for this exact key: skip the /api/v1 attempt. */
const routed = client => !!client.apiKey && client.apiKey === usdKey;
/** kolbo-api's key boundary refusing a USD key on /api/v1 (thrown error or error result). */
const refusal = value => /USD API key is restricted|USD_KEY_ROUTE_RESTRICTED|USD API key can only access/.test(
  value instanceof Error ? `${value.message} ${value.code || ''}` : (value?.isError && value.content?.map(c => c.text).join(' ')) || '');

async function models(client) {
  if (catalog && Date.now() - catalog.at < 600000) return catalog.models;
  const all = [];
  for (let page = 1; page && page <= 20;) {
    const data = await dc(client, 'GET', `/catalog?limit=100&page=${page}`);
    all.push(...data.models); page = data.nextPage;
  }
  catalog = { at: Date.now(), models: all.filter(m => m.quoteSupported) };
  return catalog.models;
}

async function modelFor(client, id, tool) {
  if (!id) throw new Error(`${tool} on a USD API key needs an explicit model. Call list_models for the models you can use.`);
  const model = (await models(client)).find(m => m.id === id);
  if (!model) throw new Error(`Model "${id}" cannot be quoted on USD API plans. Call list_models for the models you can use.`);
  return model;
}

async function upload(client, source, kind) {
  const file = await resolveToBuffer(source, kind, {});
  const form = new FormData();
  form.append('file', file.buffer, { filename: file.filename, contentType: file.contentType });
  return (await dc(client, 'POST', `/inputs/${kind}`, form)).input.id;
}

const kindOf = source => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(source) ? 'video' : /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(source) ? 'audio' : 'image';

async function references(client, list, caps) {
  const refs = [];
  for (const [role, source] of list) refs.push({ id: await upload(client, source, role.endsWith('audio') ? 'audio' : role.endsWith('video') ? 'video' : 'image'), role });
  const allowed = caps.referenceMedia?.roles || caps.frameInput?.roles || caps.draftReferences?.roles || [];
  const bad = refs.find(ref => !allowed.includes(ref.role));
  if (bad) throw new Error(`This model does not take a ${bad.role.replace('_', ' ')} on USD API plans (it takes: ${allowed.join(', ') || 'none'}).`);
  return refs;
}

function videoBase(p, model) {
  const caps = model.quoteCapabilities;
  return { model: model.id, prompt: p.prompt, duration: p.duration || (caps.durations.includes(5) ? 5 : caps.durations[0]),
    resolution: p.draft ? '480p-draft' : p.resolution || caps.resolutions[0], aspectRatio: p.aspect_ratio || caps.aspectRatios?.[0] || '16:9', soundEnabled: true };
}

/** Build the developer-console quote body for one MCP tool call. Uploads references on the way. */
async function quoteBody(client, tool, p) {
  const model = await modelFor(client, p.model, tool);
  const caps = model.quoteCapabilities || {};
  if (tool === 'generate_image' || tool === 'generate_image_edit') {
    if (caps.operation !== 'text_to_image') throw new Error(`"${model.id}" is not an image model. Call list_models type="image".`);
    if (p.num_images > 1 || p.prompts) throw new Error('USD API plans make one image per call. Call the tool once per image.');
    const refs = [...(p.source_images || []), ...(p.reference_images || [])];
    if (refs.length > (caps.inputImage?.maxCount || 0)) throw new Error(`"${model.id}" takes ${caps.inputImage?.maxCount || 0} reference image(s) on USD API plans; ${refs.length} were given.`);
    const quality = caps.qualities?.length ? (caps.qualities.includes(p.quality) ? p.quality : caps.qualities[0]) : undefined;
    return { model: model.id, operation: 'text_to_image', prompt: p.prompt, resolution: p.resolution || caps.resolutions[0],
      aspectRatio: p.aspect_ratio || '1:1', ...(quality && { quality }), ...(refs.length && { inputImageId: await upload(client, refs[0], 'image') }) };
  }
  if (tool === 'generate_video') {
    if (p.reference_images?.length) throw new Error('On USD API plans pass reference images through generate_elements.');
    if (caps.operation) throw new Error(`"${model.id}" is not a text-to-video model. Call list_models type="video".`);
    return videoBase(p, model);
  }
  if (tool === 'generate_video_from_image') {
    if (!p.image_url) throw new Error('generate_video_from_image needs image_url.');
    if (caps.operation === 'image_to_video') return { ...videoBase(p, model), operation: 'image_to_video', inputImageId: await upload(client, p.image_url, 'image') };
    const frames = [['first_frame', p.image_url], ...(p.last_frame_url ? [['last_frame', p.last_frame_url]] : [])];
    if (caps.frameInput) return { ...videoBase(p, model), operation: 'pruna_frames', aspectRatio: 'adaptive', references: await references(client, frames, caps) };
    if (caps.draftReferences) return { ...videoBase(p, model), operation: 'draft_references', resolution: '480p-draft', aspectRatio: 'adaptive', references: await references(client, frames, caps) };
    throw new Error(`"${model.id}" does not animate an image on USD API plans. Call list_models type="image_to_video".`);
  }
  if (tool === 'generate_elements') {
    const list = [...(p.reference_images || []).map(s => ['reference_image', s]), ...(p.reference_videos || []).map(s => ['reference_video', s]),
      ...[...(p.reference_audio_urls || []), ...(p.audio_url ? [p.audio_url] : [])].map(s => ['reference_audio', s]),
      ...(p.files || []).map(s => [`reference_${kindOf(s)}`, s])];
    if (!list.length) throw new Error('generate_elements needs at least one reference image or video.');
    if (['pruna_references', 'kling_media'].includes(caps.operation)) return { ...videoBase(p, model), operation: caps.operation,
      ...(caps.operation === 'kling_media' && p.keep_original_sound !== undefined && { keepOriginalSound: p.keep_original_sound }), references: await references(client, list, caps) };
    if (caps.draftReferences) return { ...videoBase(p, model), operation: 'draft_references', resolution: '480p-draft', references: await references(client, list, caps) };
    throw new Error(`"${model.id}" does not take reference media on USD API plans. Call list_models type="elements".`);
  }
  throw new Error(`${tool} has no USD route.`);
}

function jobResult(job, extra = {}) {
  const done = job.status === 'completed';
  return { state: job.status, generation_id: job.id, model: job.model, currency: 'USD',
    price_usd: usd(job.amountMicroUsd), charged_usd: usd(job.chargedMicroUsd || 0),
    ...(job.result && { url: job.result.url, url_expires_at: job.result.expiresAt, _note: 'Download the file before url_expires_at; the link itself does not keep it.' }),
    ...(job.failure && { failure: job.failure }),
    ...(!done && job.status !== 'failed' && { _hint: 'Still running. Call get_generation_status with this generation_id and wait=true. Do not run the tool again; that would pay twice.' }),
    ...extra };
}

async function poll(client, id, ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    const job = await dc(client, 'GET', `/jobs/${id}`);
    if (['completed', 'failed'].includes(job.status) || Date.now() + POLL_MS > deadline) return job;
    await progress.tick();
    await progress.wait(POLL_MS);
  }
}

async function generate(client, tool, params) {
  const key = tool + JSON.stringify(params);
  const held = pending.get(key);
  if (!held || Date.parse(held.expiresAt) - Date.now() < 15000) {
    const quote = await dc(client, 'POST', '/quotes', await quoteBody(client, tool, params));
    pending.set(key, { ...quote, idempotencyKey: crypto.randomBytes(16).toString('hex') });
    return text({ state: 'quoted', quote_id: quote.id, model: quote.request.model, price_usd: usd(quote.amountMicroUsd), currency: 'USD',
      expires_at: quote.expiresAt, request: quote.request, generation_enabled: quote.generationEnabled, charged_usd: '$0.00',
      _next: `Nothing was charged. Show the user the price. To run it, call ${tool} again with exactly the same arguments before expires_at.` });
  }
  // The confirming call: admit the held quote. The same idempotency key makes a retried submit safe.
  const job = await dc(client, 'POST', '/jobs', { quoteId: held.id, expectedAccount: held.account, idempotencyKey: held.idempotencyKey });
  pending.delete(key);
  return text(jobResult(await poll(client, job.id, WAIT_MS)));
}

async function status(client, p) {
  const ids = p.generation_ids || [p.generation_id];
  if (!ids.every(id => UUID.test(id || ''))) throw new Error('On USD API plans generation ids are the job ids returned by the generation tools.');
  const ms = p.wait ? Math.min((p.wait_seconds || 150) * 1000, 170000) : 0;
  const jobs = await Promise.all(ids.map(id => poll(client, id, ms)));
  return text(jobs.length === 1 ? jobResult(jobs[0]) : { all_done: jobs.every(j => ['completed', 'failed'].includes(j.status)), jobs: jobs.map(j => jobResult(j)) });
}

async function listModels(client, p) {
  const want = (p.type || '').toLowerCase();
  const kind = m => { const op = m.quoteCapabilities?.operation;
    return op === 'text_to_image' || op === 'image_edit' ? 'image' : op === 'image_to_video' || m.quoteCapabilities?.frameInput ? 'image_to_video video'
      : ['pruna_references', 'kling_media', 'genjutsu'].includes(op) || m.quoteCapabilities?.draftReferences ? 'elements video' : 'video'; };
  const rows = (await models(client)).filter(m => !want || kind(m).includes(want.replace(/^text_to_/, '').replace(/s$/, '')) || m.types.includes(want))
    .map(m => { const q = m.quoteCapabilities || {}; const tier = m.pricing?.tiers?.[0];
      return { id: m.id, name: m.name, kind: kind(m), runs_now: m.generationEnabled, from_usd: tier && `$${tier.usdPerUnit}/${m.pricing.unit}`,
        resolutions: q.resolutions, ...(q.durations?.length && { durations: `${q.durations[0]}-${q.durations.at(-1)}s` }), aspect_ratios: q.aspectRatios,
        ...(q.qualities?.length && { qualities: q.qualities }), ...(q.inputImage && { reference_images: q.inputImage.maxCount }),
        ...(q.referenceMedia && { reference_roles: q.referenceMedia.roles }), ...(q.frameInput && { frames: q.frameInput.roles }) }; });
  return text(['USD API models (prices are starting rates; every generation tool first returns an exact USD quote; runs_now=false models may still quote):',
    ...rows.map(row => JSON.stringify(row))].join('\n'));
}

/** Route one MCP tool call for a USD key. */
async function call(name, params, client) {
  if (!SUPPORTED.includes(name)) {
    return text(`${name} is not available on USD API plans yet. With this Kolbo API (USD) key you can use: ${SUPPORTED.join(', ')}.`, true);
  }
  try {
    if (name === 'check_credits') {
      const data = await dc(client, 'GET', '/account');
      const b = data.balance;
      return text({ currency: 'USD', account: data.account.id, available_usd: usd(b.availableMicroUsd), reserved_usd: usd(b.reservedMicroUsd),
        active_jobs: b.activeJobs, max_concurrent: b.maxConcurrent, generation_enabled: data.generationEnabled });
    }
    if (name === 'list_models') return await listModels(client, params || {});
    if (name === 'get_generation_status') return await status(client, params || {});
    return await generate(client, name, params || {});
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return text(error.message, true);
  }
}

module.exports = { isUsd, routed, refusal, call, SUPPORTED, _reset: () => { detected = undefined; usdKey = null; catalog = undefined; pending.clear(); } };

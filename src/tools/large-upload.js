/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg. */

/**
 * Large uploads (up to 5 GB): presigned multipart straight to Kolbo storage
 * (kolbo-api services/largeUpload.js). The file never passes through the API or
 * through model context: a local install PUTs the parts itself from disk, a
 * remote caller gets part URLs in pages of PART_PAGE.
 *
 * purpose → retention (Zohar, 2026-11-03):
 *   social-publish = temp: publish-only, never in the media library, deleted 7 days
 *                    after its post. Pass the returned upload_id as a media id to
 *                    publish_social_post.
 *   review, shorts-source, transcription, video-tool = persistent: a media library
 *                    item the user owns, counted against their storage.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { z } = require('zod');

const LARGE_PURPOSES = ['social-publish', 'review', 'shorts-source', 'transcription', 'video-tool'];
const PART_PAGE = 25;
const PARALLEL_PARTS = 4;
const PART_RETRIES = 4;

/** `retention: 'temp'` is the publish-only purpose; persistent needs the purpose spelled out. */
function resolvePurpose({ purpose, retention }) {
  if (purpose) {
    if (!LARGE_PURPOSES.includes(purpose)) throw new Error(`purpose must be one of: ${LARGE_PURPOSES.join(', ')}`);
    const temp = purpose === 'social-publish';
    if (retention && (retention === 'temp') !== temp) throw new Error(`purpose ${purpose} is ${temp ? 'temp' : 'persistent'}; drop retention or change purpose`);
    return purpose;
  }
  if (retention === 'temp') return 'social-publish';
  throw new Error('Large uploads need a purpose: social-publish (temp), review, shorts-source, transcription or video-tool (persistent)');
}

const pageOf = (parts) => parts.slice(0, PART_PAGE).map(p => ({ part_number: p.part_number, url: p.url }));

function startBody(args, filename, size) {
  return {
    purpose: resolvePurpose(args), filename, size,
    review_asset_id: args.review_asset_id, review_asset_name: args.review_asset_name,
    project_id: args.project_id, review_collection_id: args.review_collection_id, note: args.note,
  };
}

/** For a caller that PUTs the parts itself (remote connector + shell). */
async function startLargeUpload(client, args) {
  if (!args.filename || !Number.isSafeInteger(Number(args.size_bytes)) || Number(args.size_bytes) < 1) {
    throw new Error('A large upload needs filename (with extension) and size_bytes (exact file size)');
  }
  const r = await client.post('/v1/uploads/large', startBody(args, args.filename, Number(args.size_bytes)));
  const u = r.data || r;
  return {
    status: 'large_upload_started',
    upload_id: u.upload_id, purpose: u.purpose, retention: u.retention, size: u.size,
    part_size: u.part_size, part_count: u.part_count,
    parts: pageOf(u.parts || []),
    parts_shown: Math.min(PART_PAGE, u.part_count), parts_expire_in_seconds: u.parts_expire_in,
    how_to_upload: {
      step_1: `Part n is bytes [(n-1)*part_size, n*part_size) of the file (the last part is shorter). PUT exactly those bytes to that part's url with a Content-Length header and NO other headers (no auth, no content-type). Chunked transfer is refused: write the part to a temp file first.`,
      example: `dd if=FILE of=part.bin bs=1M skip=$(( (n-1)*${u.part_size / 1048576} )) count=${u.part_size / 1048576} status=none && curl -sf -X PUT -T part.bin "<url>"`,
      more_parts: u.part_count > PART_PAGE ? `Only the first ${PART_PAGE} part URLs are listed. Call finish_large_upload {upload_id, action:"status", part_numbers:[26,...,50]} for the next URLs.` : undefined,
      step_2: 'Call finish_large_upload {upload_id, action:"complete"}. If it says parts are missing, call action "status" (it lists missing parts with fresh URLs), PUT those, and complete again. Nothing restarts from zero.',
      then: u.retention === 'temp'
        ? 'Pass upload_id in media_ids of publish_social_post / cross_post_social. The file is not in the media library and is deleted 7 days after the post.'
        : 'The result carries media_id and url (a media library item, counted in the user\'s storage).',
    },
  };
}

function putPart(url, file, start, end) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ method: 'PUT', hostname: u.hostname, path: u.pathname + u.search, headers: { 'Content-Length': end - start + 1 }, timeout: 600000 }, (res) => {
      res.resume();
      res.on('end', () => (res.statusCode === 200 ? resolve() : reject(new Error(`storage answered ${res.statusCode} for a part`))));
    });
    req.on('timeout', () => req.destroy(new Error('part upload timed out')));
    req.on('error', reject);
    fs.createReadStream(file, { start, end }).on('error', reject).pipe(req);
  });
}

/**
 * Local install: the whole flow from a path on disk. Parts stream from the file (memory
 * stays at a few socket buffers), each retried on its own; whatever still fails is
 * re-asked from the server's missing list with fresh URLs before giving up.
 */
async function uploadLargeFromPath(client, filePath, args = {}) {
  const size = fs.statSync(filePath).size;
  const r = await client.post('/v1/uploads/large', startBody(args, args.filename || path.basename(filePath), size));
  const u = r.data || r;
  const range = (n) => [(n - 1) * u.part_size, Math.min(n * u.part_size, size) - 1];
  const send = async (parts) => {
    const queue = [...parts];
    const failed = [];
    await Promise.all(Array.from({ length: PARALLEL_PARTS }, async () => {
      for (let p; (p = queue.shift());) {
        for (let attempt = 1; ; attempt++) {
          try { await putPart(p.url, filePath, ...range(p.part_number)); break; } catch (e) {
            if (attempt >= PART_RETRIES) { failed.push(p.part_number); break; }
            await new Promise(res => setTimeout(res, 1000 * 2 ** attempt));
          }
        }
      }
    }));
    return failed;
  };
  await send(u.parts);
  for (let round = 0; round < 3; round++) {
    const st = await client.get(`/v1/uploads/large/${u.upload_id}`);
    const s = st.data || st;
    if (!s.missing_parts || !s.missing_parts.length) break;
    await send(s.parts);
  }
  const done = await client.post(`/v1/uploads/large/${u.upload_id}/complete`, {});
  return done.data || done;
}

function registerLargeUploadTools(server, client) {
  server.tool(
    'finish_large_upload',
    'Status, complete or cancel a large upload started by create_upload_ticket (with filename + size_bytes) or upload_media (purpose). action "status": parts already stored, missing parts, and fresh part URLs (pass part_numbers to page through them); use it to resume after a failure. action "complete": assembles the file and checks its size and type; a temp (social-publish) upload_id can then be used as a media id in publish_social_post, a persistent one returns media_id + url. action "cancel": drops an unfinished upload, or an unused temp file.',
    {
      upload_id: z.string().min(1).max(64),
      action: z.enum(['status', 'complete', 'cancel']),
      part_numbers: z.array(z.number().int().min(1).max(10000)).max(PART_PAGE).optional().describe(`With action "status": which part URLs to return (at most ${PART_PAGE}). Default: the first missing ones.`),
    },
    async ({ upload_id, action, part_numbers }) => {
      const p = `/v1/uploads/large/${encodeURIComponent(upload_id)}`;
      const r = action === 'complete' ? await client.post(`${p}/complete`, {})
        : action === 'cancel' ? await client.delete(p)
          : await client.get(part_numbers && part_numbers.length ? `${p}?part_numbers=${part_numbers.join(',')}` : p);
      const u = r.data || r;
      const out = { ...u, ...(u.parts ? { parts: pageOf(u.parts) } : {}) };
      if (Array.isArray(u.uploaded_parts)) out.uploaded_parts = u.uploaded_parts.length; // a count, not 300 rows
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    }
  );
}

module.exports = { LARGE_PURPOSES, PART_PAGE, resolvePurpose, startLargeUpload, uploadLargeFromPath, registerLargeUploadTools };

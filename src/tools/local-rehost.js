'use strict';

// Every JSON-body generation tool (edit_image, generate_image_edit,
// generate_video_from_image, generate_3d, ...) advertised "URL or absolute
// local path" but shipped the path string straight to the API, which only
// understands URLs. Only the multipart tools (elements, first/last frame,
// lipsync, v2v, transcribe) actually read the file. Instead of teaching every
// handler about files, the client handed to the generate tools rehosts any
// local path found anywhere in a POST body into the media library and swaps
// in the CDN URL. URLs and plain text are never touched.

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { resolveToBuffer } = require('./_shared');

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
// Free-text fields are skipped so a prompt is never stat()ed.
const TEXT_KEYS = new Set(['prompt', 'prompts', 'text', 'lyrics', 'style', 'title', 'negative_tags', 'system_prompt', 'srt_content', 'style_instructions', 'customization', 'vocabulary']);

const isUrl = (s) => /^https?:\/\//i.test(s);
// Absolute POSIX / Windows / UNC path that ends in a file extension.
const looksLikeLocalFile = (s) =>
  typeof s === 'string' && s.length < 1024 && !isUrl(s) && !/[\n\r]/.test(s) &&
  (path.isAbsolute(s) || path.win32.isAbsolute(s)) && /\.[a-z0-9]{2,5}$/i.test(s);

async function uploadLocal(client, source, projectId, opts) {
  const file = await resolveToBuffer(source, 'image', { maxBytes: MAX_UPLOAD_BYTES, allowLocalFiles: opts.allowLocalFiles });
  const form = new FormData();
  form.append('file', file.buffer, { filename: file.filename, contentType: file.contentType });
  if (projectId) form.append('project_id', projectId);
  const uploaded = await client.postMultipart('/v1/media/upload', form);
  const url = uploaded?.media?.url || uploaded?.url;
  if (!url) throw new Error(`Upload of ${source} returned no URL`);
  return url;
}

/**
 * Deep-walk a request body; replace every local file path with a CDN URL.
 * @param {object} client - Kolbo HTTP client (needs postMultipart)
 * @param {*} body
 * @param {{allowLocalFiles?: boolean}} [opts] - false on remote connectors:
 *   a local path then throws the routing hint instead of reaching the API.
 */
async function rehostLocalPaths(client, body, opts = {}) {
  if (!body || typeof body !== 'object') return body;
  const projectId = body.project_id;
  const cache = new Map();
  const walk = async (value, key) => {
    if (typeof value === 'string') {
      if (TEXT_KEYS.has(key) || !looksLikeLocalFile(value)) return value;
      if (opts.allowLocalFiles !== false && !(fs.existsSync(value) && fs.statSync(value).isFile())) return value;
      if (!cache.has(value)) cache.set(value, uploadLocal(client, value, projectId, opts));
      return cache.get(value);
    }
    if (Array.isArray(value)) return Promise.all(value.map((v) => walk(v, key)));
    if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = await walk(v, k);
      return out;
    }
    return value;
  };
  return walk(body);
}

/** Wrap a client so `post()` rehosts local paths first; everything else is inherited. */
function withLocalRehost(client, opts = {}) {
  return Object.create(client, {
    post: { value: async (route, body, ...rest) => client.post(route, await rehostLocalPaths(client, body, opts), ...rest) },
  });
}

module.exports = { rehostLocalPaths, withLocalRehost, looksLikeLocalFile };

/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file

function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s);
}

function guessFilename(source, fallbackExt) {
  if (isHttpUrl(source)) {
    try {
      const u = new URL(source);
      const base = path.basename(u.pathname) || `upload${fallbackExt}`;
      return base.includes('.') ? base : `${base}${fallbackExt}`;
    } catch (_) {
      return `upload${fallbackExt}`;
    }
  }
  return path.basename(source);
}

function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4'
  };
  return map[ext] || 'application/octet-stream';
}

async function resolveToBuffer(source, kind) {
  // kind: 'image' | 'video' | 'audio' — used for default filename extension only.
  const defaultExt = kind === 'image' ? '.png' : kind === 'video' ? '.mp4' : '.mp3';

  if (isHttpUrl(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch ${source}: ${res.status}`);
    const contentLen = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLen && contentLen > MAX_FILE_BYTES) {
      throw new Error(`File at ${source} exceeds 25MB limit`);
    }
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length > MAX_FILE_BYTES) {
      throw new Error(`File at ${source} exceeds 25MB limit`);
    }
    return {
      buffer,
      filename: guessFilename(source, defaultExt),
      contentType: res.headers.get('content-type') || guessContentType(guessFilename(source, defaultExt))
    };
  }

  // Local path
  if (!path.isAbsolute(source)) {
    throw new Error(`Local file paths must be absolute: ${source}`);
  }
  const stat = fs.statSync(source);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File ${source} (${stat.size} bytes) exceeds 25MB limit`);
  }
  const buffer = fs.readFileSync(source);
  const filename = path.basename(source);
  return {
    buffer,
    filename,
    contentType: guessContentType(filename)
  };
}

function registerVisualDnaTools(server, client) {
  // ─── create_visual_dna ─────────────────────────────────────
  server.tool(
    'create_visual_dna',
    'Create a Visual DNA profile from reference media. Each item in images/video/audio can be a public URL or an absolute local file path. Max 4 images, 1 video, 1 audio. Files capped at 25MB each.',
    {
      name: { type: 'string', description: 'Name of the Visual DNA profile' },
      dna_type: { type: 'string', description: 'Type: "character", "style", "product", "scene". Default: "character"' },
      prompt_helper: { type: 'string', description: 'Optional description/notes to guide DNA extraction' },
      images: { type: 'array', description: 'Array of image sources (URLs or absolute local paths). Max 4.' },
      video: { type: 'string', description: 'Optional video source (URL or absolute local path)' },
      audio: { type: 'string', description: 'Optional audio source (URL or absolute local path)' }
    },
    async ({ name, dna_type, prompt_helper, images, video, audio }) => {
      if (!name || !name.trim()) {
        throw new Error('name is required');
      }

      const imageList = Array.isArray(images) ? images.filter(Boolean) : [];
      if (imageList.length > 4) {
        throw new Error('Maximum 4 images allowed');
      }
      if (imageList.length === 0 && !video && !audio) {
        throw new Error('At least one media reference (image, video, or audio) is required');
      }

      // Resolve all sources to buffers in parallel.
      const [imageFiles, videoFile, audioFile] = await Promise.all([
        Promise.all(imageList.map(src => resolveToBuffer(src, 'image'))),
        video ? resolveToBuffer(video, 'video') : Promise.resolve(null),
        audio ? resolveToBuffer(audio, 'audio') : Promise.resolve(null)
      ]);

      const form = new FormData();
      form.append('name', name);
      if (dna_type) form.append('dnaType', dna_type);
      if (prompt_helper) form.append('promptHelper', prompt_helper);

      for (const f of imageFiles) {
        form.append('images', f.buffer, { filename: f.filename, contentType: f.contentType });
      }
      if (videoFile) {
        form.append('videos', videoFile.buffer, { filename: videoFile.filename, contentType: videoFile.contentType });
      }
      if (audioFile) {
        form.append('audio', audioFile.buffer, { filename: audioFile.filename, contentType: audioFile.contentType });
      }

      const result = await client.postMultipart('/v1/visual-dna', form);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.visual_dna || result, null, 2)
        }]
      };
    }
  );

  // ─── list_visual_dnas ──────────────────────────────────────
  server.tool(
    'list_visual_dnas',
    'List your Visual DNA profiles. Returns id, name, type, and thumbnail for each.',
    {},
    async () => {
      const result = await client.get('/v1/visual-dna');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            visual_dnas: result.visual_dnas || [],
            count: result.count || 0
          }, null, 2)
        }]
      };
    }
  );

  // ─── get_visual_dna ────────────────────────────────────────
  server.tool(
    'get_visual_dna',
    'Fetch a single Visual DNA profile by ID. Returns the full profile including system_prompt and all reference images.',
    {
      visual_dna_id: { type: 'string', description: 'The Visual DNA profile ID' }
    },
    async ({ visual_dna_id }) => {
      const result = await client.get(`/v1/visual-dna/${encodeURIComponent(visual_dna_id)}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.visual_dna || result, null, 2)
        }]
      };
    }
  );

  // ─── delete_visual_dna ─────────────────────────────────────
  server.tool(
    'delete_visual_dna',
    'Delete a Visual DNA profile by ID. Only the owner can delete.',
    {
      visual_dna_id: { type: 'string', description: 'The Visual DNA profile ID to delete' }
    },
    async ({ visual_dna_id }) => {
      const result = await client.delete(`/v1/visual-dna/${encodeURIComponent(visual_dna_id)}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: result.message || 'Visual DNA deleted'
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerVisualDnaTools };

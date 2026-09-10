'use strict';
const { z } = require('zod');
const fs = require('node:fs/promises');
const path = require('node:path');
const FormData = require('form-data');
const { UI, uiResult } = require('../apps');
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

function registerFontTools(server, client, options = {}) {
  server.tool('list_fonts', 'Browse My fonts or the curated Font collection using source. Use ready family IDs from either as font_ids; previews are authenticated, not public media.', {
    source: z.enum(['custom', 'global', 'all']).optional().describe('custom (default): My fonts, global: read-only Font collection, all: both. IDs from either can be combined.'),
    search: z.string().max(120).optional(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional(),
  }, async options => result(await client.get('/v1/fonts?' + new URLSearchParams(Object.entries(options).filter(([, value]) => value !== undefined)))));
  server.tool('get_font', 'Inspect a personal or collection font family by ID, including available styles, scripts, source and collection license.', { font_id: id }, async ({ font_id }) => result(await client.get(`/v1/fonts/${font_id}`)));
  server.tool('get_font_upload_status', 'Poll a font upload until ready or failed. Use its font_id only after ready.', { upload_id: id }, async ({ upload_id }) => result(await client.get(`/v1/fonts/uploads/${upload_id}`)));
  server.tool('rename_font', 'Rename a family in My Fonts.', { font_id: id, name: z.string().min(1).max(120) }, async ({ font_id, name }) => result(await client.patch(`/v1/fonts/${font_id}`, { name })));
  server.tool('delete_font', 'Delete a personal font family from future use. Completed generated images are not deleted.', { font_id: id }, async ({ font_id }) => result(await client.delete(`/v1/fonts/${font_id}`)));
  server.tool('upload_font', 'Upload one LOCAL OTF, TTF or WOFF2 font (up to 5 MiB) directly to My Fonts, not the media library. Local stdio only: remote clients must use create_font_upload_ticket or font_upload_widget. Poll get_font_upload_status until ready.', {
    file_path: z.string(), language: z.string().max(32).optional(),
  }, async ({ file_path, language }) => {
    if (!options.allowLocalFiles) throw new Error('Remote font upload: use create_font_upload_ticket or font_upload_widget; server-local file access is disabled');
    if (!path.isAbsolute(file_path) || !/\.(otf|ttf|woff2)$/i.test(file_path)) throw new Error('Choose an absolute OTF, TTF or WOFF2 path');
    const handle = await fs.open(file_path, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > 5 * 1024 * 1024) throw new Error('Font must be a regular file up to 5 MiB');
      const form = new FormData();
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!read.bytesRead) throw new Error('Font changed during upload; choose the file again');
        offset += read.bytesRead;
      }
      form.append('file', bytes, { filename: path.basename(file_path), knownLength: bytes.length });
      if (language) form.append('language', language);
      return result(await client.postMultipart('/v1/fonts', form));
    } finally { await handle.close(); }
  });
  server.tool('create_font_upload_ticket', 'Create a one-use, ten-minute ticket for a remote client with shell access. POST multipart field file to upload_url with Authorization: Bearer <ticket>. Never use upload_media for fonts. Poll returned upload ID with get_font_upload_status.', {}, async () => result(await client.post('/v1/fonts/upload-tickets', {})));
  server.tool('font_upload_widget', 'Show a dedicated font upload picker for browser-only clients. Uploads ONE OTF/TTF/WOFF2 up to 5 MiB into My Fonts. Create another widget for another file or retry. Poll returned upload ID until ready.', {}, async () => {
    const { data } = await client.post('/v1/fonts/upload-tickets', {});
    return uiResult(UI.fontUpload, 'Choose a font in the upload card, then poll get_font_upload_status with the returned upload ID.', {
      widget: 'font-upload', upload_url: data.upload_url, token: data.ticket, expires_at: data.expires_at,
    });
  });
}
module.exports = { registerFontTools };

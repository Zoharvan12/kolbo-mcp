/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

// Avatars: a person (avatar_id) the user can make talk. Create once from photos + voice (+ an
// optional talking video), then create_avatar_video with a script. Three modes, chosen by the
// caller: omni (acts in any scene, up to 60 s), photo (fast, from a still in the scene, up to
// 3 min), twin (the person's own footage, up to 3 min; needs a video). Engines are never exposed.
// Contract: kolbo-api src/services/avatar/serialize.js (/v1/avatars).

const { z } = require('zod');
const { UI, uiResult } = require('../apps');

const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const MODE = z.enum(['omni', 'photo', 'twin']);
const urls = (min, max) => z.array(z.string().url()).min(min).max(max);

function registerAvatarTools(server, client) {
  server.tool(
    'list_avatars',
    'List the user\'s avatars (people they can make talk). Each has avatar_id, name, modes (which of omni / photo / twin it can use now) and scenes. Use avatar_id with create_avatar_video.',
    {},
    async () => {
      const r = await client.get('/v1/avatars?limit=100');
      const avatars = r?.avatars || [];
      return uiResult(UI.mediaGrid, JSON.stringify({ avatars, count: avatars.length }, null, 2), {
        widget: 'media-grid',
        title: 'Avatars',
        items: avatars.map(a => ({
          id: a.avatar_id,
          title: a.name,
          subtitle: Object.entries(a.modes || {}).filter(([, ok]) => ok).map(([m]) => m).join(' · ') || 'Needs photos and a voice',
          thumbnail: a.thumbnail_url,
          url: a.thumbnail_url,
          media_type: 'image',
          use_hint: 'Make {TITLE} say: "..." (avatar_id: {ID}).',
        })),
        total: avatars.length,
        has_more: false,
      });
    }
  );

  server.tool(
    'get_avatar',
    'Get one avatar: its photos (with a reason when a photo was rejected), voice, video, scenes and which modes it can use.',
    { avatar_id: z.string().min(1).max(64) },
    async ({ avatar_id }) => text((await client.get(`/v1/avatars/${encodeURIComponent(avatar_id)}`))?.avatar)
  );

  server.tool(
    'create_avatar',
    'Create an avatar of a real person. Needs: 1-8 clear photos (photo_urls; more angles give a closer likeness) and a voice — either voice_url (30-60 s of clean speech, cloned) or stock_voice_id. Optional video_url (60 s+ of the person talking to camera) unlocks twin mode. Or pass visual_dna_id to convert one of the user\'s own Visual DNAs (photos then optional). consent must be true: the user confirms it is them or they have the person\'s permission — ask the user, never assume. Upload local files first with upload_media / create_upload_ticket.',
    {
      name: z.string().min(1).max(60),
      consent: z.literal(true).describe('The user confirmed this is them, or they have the person\'s permission.'),
      photo_urls: urls(1, 8).optional().describe('1-8 https photo URLs of the person: one face, sharp, face fully visible. A character sheet counts as one photo.'),
      voice_url: z.string().url().optional().describe('30-60 s of the person speaking, https.'),
      stock_voice_id: z.string().max(80).optional().describe('A library voice instead of cloning (see GET /v1/avatars/stock-voices).'),
      video_url: z.string().url().optional().describe('60 s+ of the person talking to camera; unlocks twin.'),
      visual_dna_id: z.string().max(64).optional().describe('Convert one of the user\'s own character Visual DNAs into an avatar: its images, sheet and voice are copied.'),
    },
    async ({ visual_dna_id, ...body }) => {
      const r = visual_dna_id
        ? await client.post('/v1/avatars/from-visual-dna', { ...body, visual_dna_id })
        : await client.post('/v1/avatars', body);
      return text(r?.avatar || r);
    }
  );

  server.tool(
    'update_avatar',
    'Change an avatar: rename it, add photos, replace the voice or add/replace the talking video. Changing photos, voice or video needs consent: true (ask the user).',
    {
      avatar_id: z.string().min(1).max(64),
      name: z.string().min(1).max(60).optional(),
      consent: z.literal(true).optional(),
      photo_urls: urls(1, 8).optional(),
      voice_url: z.string().url().optional(),
      stock_voice_id: z.string().max(80).optional(),
      video_url: z.string().url().optional(),
    },
    async ({ avatar_id, name, consent, photo_urls, voice_url, stock_voice_id, video_url }) => {
      const id = encodeURIComponent(avatar_id);
      let last;
      if (name) last = await client.put(`/v1/avatars/${id}`, { name });
      if (photo_urls) last = await client.post(`/v1/avatars/${id}/photos`, { consent, photo_urls });
      if (voice_url || stock_voice_id) last = await client.put(`/v1/avatars/${id}/voice`, { consent, voice_url, stock_voice_id });
      if (video_url) last = await client.put(`/v1/avatars/${id}/video`, { consent, video_url });
      return text(last?.avatar || last || { message: 'Nothing to change' });
    }
  );

  server.tool(
    'delete_avatar',
    'Delete an avatar. Videos already made stay in their projects.',
    { avatar_id: z.string().min(1).max(64) },
    async ({ avatar_id }) => text(await client.delete(`/v1/avatars/${encodeURIComponent(avatar_id)}`))
  );

  server.tool(
    'list_avatar_scene_presets',
    'List the scene library (studio, podcast, office, stage, cafe, ...). Pass a preset_key to create_avatar_video, or add_avatar_scene to keep it on the avatar.',
    {},
    async () => text((await client.get('/v1/avatars/scene-presets'))?.scene_presets)
  );

  server.tool(
    'add_avatar_scene',
    'Add a scene to an avatar: a preset_key, or a custom scene from a room photo (photo_url), a description (prompt) and/or reference images. For a location Visual DNA, pass its image as photo_url. The avatar is placed in the scene the first time a video uses it.',
    {
      avatar_id: z.string().min(1).max(64),
      preset_key: z.string().max(40).optional(),
      name: z.string().max(60).optional(),
      prompt: z.string().max(600).optional(),
      photo_url: z.string().url().optional(),
      reference_urls: urls(1, 5).optional(),
      aspect_ratio: z.enum(['9:16', '16:9', '1:1']).optional(),
    },
    async ({ avatar_id, ...body }) => text(await client.post(`/v1/avatars/${encodeURIComponent(avatar_id)}/scenes`, body))
  );

  server.tool(
    'regenerate_avatar_portraits',
    "\"None of these look like me\": make a new set of portrait options for the avatar (a few rounds per avatar). The first set is made automatically when the avatar gets photos. Poll get_avatar until portraits.status is ready, then show the options and call pick_avatar_portrait.",
    { avatar_id: z.string().min(1).max(64) },
    async ({ avatar_id }) => text(await client.post(`/v1/avatars/${encodeURIComponent(avatar_id)}/portraits`, {}))
  );

  server.tool(
    'pick_avatar_portrait',
    'Pick which portrait option looks like the person (url from get_avatar portraits.options). Every scene image and video then builds on it; scene images are remade on next use.',
    { avatar_id: z.string().min(1).max(64), url: z.string().url() },
    async ({ avatar_id, url }) => text(await client.put(`/v1/avatars/${encodeURIComponent(avatar_id)}/portraits/pick`, { url }))
  );

  server.tool(
    'remove_avatar_scene',
    'Remove a scene from an avatar. Videos already made keep their scene.',
    { avatar_id: z.string().min(1).max(64), scene_id: z.string().min(1).max(40) },
    async ({ avatar_id, scene_id }) => text(await client.delete(`/v1/avatars/${encodeURIComponent(avatar_id)}/scenes/${encodeURIComponent(scene_id)}`))
  );

  server.tool(
    'list_avatar_stock_voices',
    'Library voices an avatar can use instead of a cloned voice. Pass a voice_id as stock_voice_id to create_avatar or update_avatar.',
    {},
    async () => text((await client.get('/v1/avatars/stock-voices'))?.voices)
  );

  server.tool(
    'quote_avatar_video',
    'Price an avatar video before making it (no credits spent): returns estimated_seconds (length of the spoken video), estimated_wait_seconds (how long making it takes), credits (includes the background removal when remove_background is true), remove_background_credits (what removing the background adds; null when not available) and max_seconds for the mode.',
    {
      avatar_id: z.string().min(1).max(64),
      mode: MODE,
      script: z.string().min(1).max(6000).optional(),
      audio_url: z.string().url().optional(),
      resolution: z.enum(['480p', '720p', '1080p', '4k']).optional(),
      remove_background: z.boolean().optional().describe('Also remove the background: the video comes back transparent (video_url = webm with alpha, download_url = editing master). Costs extra per second (see remove_background_credits); up to 1080p and 60 s.'),
    },
    async ({ avatar_id, ...body }) => text(await client.post(`/v1/avatars/${encodeURIComponent(avatar_id)}/videos/quote`, body))
  );

  server.tool(
    'create_avatar_video',
    'Make the avatar say a script (any language) or lip-sync an audio file. Pick mode: omni (acts naturally in the scene, up to 60 s), photo (fast, from a still in the scene, up to 3 min), twin (the person\'s own footage, up to 3 min; needs a video on the avatar). Omni/photo use scene_id (from the avatar) or preset_key (default home-studio). Returns video_id at once — poll get_avatar_video until status is completed; its estimated_wait_seconds says how long to expect. Pass session_id to keep several videos in one session; otherwise it goes to project_id (or the API Generations project). remove_background: true delivers it with a transparent background (talking heads to place on anything); quote first, it costs extra.',
    {
      avatar_id: z.string().min(1).max(64),
      mode: MODE,
      script: z.string().min(1).max(6000).optional(),
      audio_url: z.string().url().optional(),
      scene_id: z.string().max(40).optional(),
      preset_key: z.string().max(40).optional(),
      shot: z.enum(['close', 'podcast', 'full_body', 'walk']).optional().describe('Omni only: close = talking head (default), podcast = side angle looking at an unseen host, full_body = whole person seated/standing, walk = walking toward a gimbal camera (best in outdoor scenes).'),
      aspect_ratio: z.enum(['9:16', '16:9', '1:1']).optional(),
      resolution: z.enum(['480p', '720p', '1080p', '4k']).optional(),
      language: z.string().max(10).optional().describe('auto (default) or a code like he, en, es.'),
      remove_background: z.boolean().optional().describe('Also remove the background: the video comes back transparent (video_url = webm with alpha, download_url = editing master). Costs extra per second (see remove_background_credits); up to 1080p and 60 s.'),
      session_id: z.string().max(64).optional(),
      project_id: z.string().max(64).optional(),
    },
    async ({ avatar_id, ...body }) => text((await client.post(`/v1/avatars/${encodeURIComponent(avatar_id)}/videos`, body))?.video)
  );

  server.tool(
    'get_avatar_video',
    'Status of an avatar video: pending / processing (with progress) / completed (video_url) / failed (error; credits are returned on failure). A transparent video has transparent: true and download_url (editing master); remove_background_credits is the price to remove the background of this finished video (null = not available); notice explains a skipped step.',
    { video_id: z.string().min(1).max(64) },
    async ({ video_id }) => text((await client.get(`/v1/avatars/videos/${encodeURIComponent(video_id)}`))?.video)
  );

  server.tool(
    'cancel_avatar_video',
    'Stop an avatar video that is still pending or processing. Its credits are returned. Refused when the video has already finished.',
    { video_id: z.string().min(1).max(64).describe('The video_id from create_avatar_video.') },
    async ({ video_id }) => text((await client.post(`/v1/avatars/videos/${encodeURIComponent(video_id)}/cancel`, {}))?.video)
  );

  server.tool(
    'remove_avatar_video_background',
    'Remove the background of a finished avatar video. Makes a NEW video (transparent: video_url = webm with alpha, download_url = editing master); the original stays. Costs the remove_background_credits shown on get_avatar_video (up to 1080p and 60 s) — tell the user the price first. Asking again returns the copy already made. Poll get_avatar_video with the new video_id.',
    { video_id: z.string().min(1).max(64).describe('The finished avatar video (video_id from create_avatar_video or get_avatar_video).') },
    async ({ video_id }) => text((await client.post(`/v1/avatars/videos/${encodeURIComponent(video_id)}/remove-background`, {}))?.video)
  );
}

module.exports = { registerAvatarTools };

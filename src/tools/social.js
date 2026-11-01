'use strict';
/**
 * Social Planner. Registered by default; the backend decides which platforms each account may use
 * (and its account limit) and answers 404 when it has none. The hosted connector passes
 * `socialPlanner: false` for those accounts; stdio users can hide the tools with KOLBO_SOCIAL_PLANNER=0.
 *
 * These tools are registered AFTER the public annotation contract is checked, so they carry their
 * own annotations here and stay out of tool-contract.json until the feature launches.
 */
const { z } = require('zod');

const id = z.string().regex(/^[a-f0-9]{24}$/i);
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const qs = (o) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));
  return p.toString() ? `?${p}` : '';
};
const PLATFORMS = ['instagram', 'facebook', 'threads', 'tiktok', 'youtube', 'linkedin', 'x'];
const ANN = {
  read: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  readRemote: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  write: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  destroy: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
};

function registerSocialTools(server, client) {
  const tool = (name, annotations, ...rest) => {
    server.tool(name, ...rest);
    server._registeredTools[name].annotations = annotations;
  };

  tool('list_social_accounts', ANN.read,
    'Social Planner (beta): list the social accounts connected to this Kolbo account (Instagram, Facebook Pages, Threads, TikTok, YouTube, LinkedIn) with status and latest follower stats. status "needs_reconnect" means the user must reconnect it with connect_social_account before posting. suggested_platforms lists platforms not connected yet, each with its connect_page_url.',
    {}, async () => result(await client.get('/v1/social/accounts')));

  tool('check_social_account', ANN.readRemote,
    'Social Planner (beta): health check of one account right now: renews the token if due and makes one authenticated read. status "needs_reconnect" means give the user a link from connect_social_account. Kolbo also checks every account daily and renews tokens before they expire.',
    { account_id: id },
    async ({ account_id }) => result(await client.post(`/v1/social/accounts/${account_id}/check`, {})));

  tool('create_social_calendar_feed', ANN.write,
    'Social Planner (beta): a private calendar link (.ics) with every queued, scheduled and published post (30 days back, 180 ahead), for Google Calendar (Other calendars > From URL), Outlook or Apple Calendar. It refreshes on its own. Creating a new link turns the previous one off. Treat it like a password.',
    {}, async () => result(await client.post('/v1/social/calendar-feed', {})));

  tool('revoke_social_calendar_feed', ANN.destroy,
    'Social Planner (beta): turn off the private calendar link.',
    {}, async () => result(await client.delete('/v1/social/calendar-feed')));

  tool('connect_social_account', ANN.write,
    'Social Planner (beta): connect or reconnect a social account. Returns connect_page_url (the Kolbo Connectors page with that platform ready: one click for a signed-in user, works any time) and connect_url (a raw one-time platform login, 10 minutes). Give the user connect_page_url as a markdown link named "Connect <Platform>"; use connect_url only when they cannot open the Kolbo app. You cannot complete the sign-in yourself. Instagram connects with its own login (Business or Creator account, no Facebook Page needed); Facebook connects Pages. Offer this whenever the user wants to post somewhere that is not connected yet, then call list_social_accounts.',
    { platform: z.enum(PLATFORMS) },
    async ({ platform }) => result(await client.post('/v1/social/accounts/connect', { platform })));

  tool('disconnect_social_account', ANN.destroy,
    'Social Planner (beta): disconnect a social account and delete its stored tokens. Only when the user explicitly asks. Posts already published stay on the platform.',
    { account_id: id },
    async ({ account_id }) => result(await client.delete(`/v1/social/accounts/${account_id}`)));

  tool('get_social_capabilities', ANN.read,
    'Social Planner (beta): formats (media count and types) and settings each platform accepts, e.g. Instagram reel/image/carousel/story with trial reels, collaborators, cover; TikTok privacy and interaction switches; YouTube title, privacy, made_for_kids, publish_at. Read before publish_social_post.',
    { platform: z.enum(PLATFORMS).optional() },
    async ({ platform }) => {
      const r = await client.get('/v1/social/capabilities');
      return result(platform ? { success: true, platforms: { [platform]: r.platforms?.[platform] } } : r);
    });

  tool('get_tiktok_creator_info', ANN.readRemote,
    'Social Planner (beta): REQUIRED before posting to TikTok. Returns the creator nickname, the privacy levels this creator may use, whether comment/duet/stitch are disabled, and the max video length. Show the nickname to the user, and ask them to choose privacy_level: there is no default.',
    { account_id: id },
    async ({ account_id }) => result(await client.get(`/v1/social/accounts/${account_id}/creator-info`)));

  tool('publish_social_post', ANN.write,
    'Social Planner (beta): publish now, or schedule with scheduled_at, ONE post to ONE connected account. Cross-posting = one call per account. media_ids are Kolbo media library ids (list_media). This posts publicly on the user\'s real account: get the user\'s explicit approval of the account, media, caption and time first, never post on your own initiative. status "processing" means the platform is still preparing it: check get_social_post. "unconfirmed" means the outcome is unknown: do NOT retry, ask the user to check the account. TikTok needs settings.privacy_level from get_tiktok_creator_info. YouTube needs title.',
    {
      account_id: id,
      format: z.string().min(1).max(40).describe('From get_social_capabilities, e.g. reel, image, carousel, story, video, short, text, document'),
      media_ids: z.array(id).max(35).optional().describe('Kolbo media ids in display order; omit for text posts'),
      caption: z.string().max(5000).optional(),
      title: z.string().max(200).optional().describe('YouTube title, TikTok photo title, LinkedIn document/article title'),
      settings: z.record(z.any()).optional().describe('Platform options from get_social_capabilities, e.g. {"trial":"SS_PERFORMANCE"} for an Instagram trial reel, {"privacy_level":"PUBLIC_TO_EVERYONE"} for TikTok'),
      scheduled_at: z.string().optional().describe('ISO 8601 with timezone offset, up to 180 days ahead, or "next_slot" for the account\'s next free queue slot (set_social_queue). Omit to post now'),
    },
    async (args) => result(await client.post('/v1/social/posts', args)));

  tool('cross_post_social', ANN.write,
    'Social Planner (beta): the same content to several accounts in ONE call (up to 20), e.g. a Reel to Instagram + TikTok + YouTube Short + Threads. Top-level fields are defaults; each target can override format, caption, title, settings, media_ids or scheduled_at (platforms name formats differently: Instagram "reel", TikTok "video", YouTube "short"). Every account succeeds or fails on its own; results come back per account with a shared group_id. Needs the user\'s explicit approval first, like publish_social_post.',
    {
      targets: z.array(z.object({
        account_id: id,
        format: z.string().max(40).optional(),
        caption: z.string().max(5000).optional(),
        title: z.string().max(200).optional(),
        settings: z.record(z.any()).optional(),
        media_ids: z.array(id).max(35).optional(),
        scheduled_at: z.string().optional(),
      })).min(1).max(20),
      format: z.string().max(40).optional(),
      media_ids: z.array(id).max(35).optional(),
      caption: z.string().max(5000).optional(),
      title: z.string().max(200).optional(),
      settings: z.record(z.any()).optional().describe('Shared settings, merged under each target\'s own (e.g. first_comment)'),
      scheduled_at: z.string().optional().describe('ISO 8601, or "next_slot" per account; omit to post now'),
    },
    async (args) => result(await client.post('/v1/social/posts/batch', args)));

  tool('retry_social_post', ANN.write,
    'Social Planner (beta): send a FAILED post again as a new post (the failed one stays as history). An "unconfirmed" post may already be live: retry it only after the user checked the account, with confirm_not_live=true.',
    { post_id: id, confirm_not_live: z.boolean().optional() },
    async ({ post_id, confirm_not_live }) => result(await client.post(`/v1/social/posts/${post_id}/retry`, { confirm_not_live })));

  tool('delete_published_social_post', ANN.destroy,
    'Social Planner (beta): delete a PUBLISHED post from the platform itself (YouTube, Facebook, Threads, LinkedIn). Instagram and TikTok do not allow it through their API. Irreversible: only when the user explicitly asks.',
    { post_id: id },
    async ({ post_id }) => result(await client.delete(`/v1/social/posts/${post_id}/published`)));

  tool('list_social_comments', ANN.readRemote,
    'Social Planner (beta): comments and replies on a published post (Instagram, Facebook, Threads, YouTube, LinkedIn), newest first, with parent_id for replies and hidden state. Pass next as after for more. TikTok does not expose comments.',
    { post_id: id, after: z.string().max(500).optional() },
    async ({ post_id, after }) => result(await client.get(`/v1/social/posts/${post_id}/comments` + qs({ after }))));

  tool('reply_social_comment', ANN.write,
    'Social Planner (beta): reply to a comment (reply_to = comment id) or add a new top-level comment on the post (omit reply_to). Posts publicly as the account: show the user the exact text and get approval first.',
    { post_id: id, text: z.string().min(1).max(2200), reply_to: z.string().max(300).optional() },
    async ({ post_id, ...body }) => result(await client.post(`/v1/social/posts/${post_id}/comments`, body)));

  tool('moderate_social_comment', ANN.destroy,
    'Social Planner (beta): hide, unhide or delete a comment on the account\'s post. Instagram/Facebook/Threads/YouTube can hide; LinkedIn only delete; Threads and YouTube delete only the account\'s own comments (YouTube removes others from view instead). Only on the user\'s request.',
    { post_id: id, comment_id: z.string().min(1).max(300), action: z.enum(['hide', 'unhide', 'delete']) },
    async ({ post_id, ...body }) => result(await client.post(`/v1/social/posts/${post_id}/comments/moderate`, body)));

  tool('get_social_queue', ANN.read,
    'Social Planner (beta): the account\'s weekly posting slots (day 0 = Sunday, time HH:MM, timezone). scheduled_at "next_slot" fills the next free one.',
    { account_id: id },
    async ({ account_id }) => result(await client.get(`/v1/social/accounts/${account_id}/queue`)));

  tool('set_social_queue', ANN.write,
    'Social Planner (beta): replace the account\'s weekly posting slots. Tip: get_social_best_times first.',
    {
      account_id: id,
      timezone: z.string().max(64).describe('IANA zone, e.g. Asia/Jerusalem'),
      slots: z.array(z.object({ day: z.number().int().min(0).max(6).describe('0 = Sunday'), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })).max(50),
    },
    async ({ account_id, ...body }) => result(await client.put(`/v1/social/accounts/${account_id}/queue`, body)));

  tool('get_social_best_times', ANN.read,
    'Social Planner (beta): best weekday + hour to post on this account, ranked by average views of its own published posts (last 120 days), with sample size and confidence.',
    { account_id: id },
    async ({ account_id }) => result(await client.get(`/v1/social/accounts/${account_id}/best-times`)));

  tool('list_social_conversations', ANN.readRemote,
    "Social Planner (beta): the Instagram account's DM inbox (conversations with participant usernames, newest first). Pass next as after for more.",
    { account_id: id, after: z.string().max(500).optional() },
    async ({ account_id, after }) => result(await client.get(`/v1/social/accounts/${account_id}/conversations` + qs({ after }))));

  tool('get_social_conversation', ANN.readRemote,
    'Social Planner (beta): the latest 50 messages of one DM conversation from list_social_conversations.',
    { account_id: id, conversation_id: z.string().min(1).max(300) },
    async ({ account_id, conversation_id }) => result(await client.get(`/v1/social/accounts/${account_id}/conversations/${encodeURIComponent(conversation_id)}/messages`)));

  tool('send_social_message', ANN.write,
    "Social Planner (beta): send an Instagram DM. recipient_id = a participant id from list_social_conversations (Instagram allows this only within 24 h of their last message), OR comment_id = a private reply to that comment's author (within 7 days of the comment). Sends as the account: show the user the exact text and get approval first.",
    { account_id: id, text: z.string().min(1).max(1000), recipient_id: z.string().max(300).optional(), comment_id: z.string().max(300).optional() },
    async ({ account_id, ...body }) => result(await client.post(`/v1/social/accounts/${account_id}/messages`, body)));

  tool('list_social_automations', ANN.read,
    'Social Planner (beta): comment-to-DM rules with their last run and last error.',
    {}, async () => result(await client.get('/v1/social/automations')));

  tool('create_social_automation', ANN.write,
    'Social Planner (beta): comment-to-DM. When someone comments one of the keywords on the account\'s posts (post_ids, or every post from the last 7 days), Kolbo sends them dm_text as a private reply, once per person per post, and optionally reply_text publicly under the comment. Only comments written after the rule is created count. Checked every 5 minutes. Instagram only for now. Confirm keywords and texts with the user first.',
    {
      account_id: id,
      dm_text: z.string().min(1).max(1000),
      keywords: z.array(z.string().max(100)).max(20).optional().describe('Case-insensitive; omit to answer every comment'),
      post_ids: z.array(z.string().max(300)).max(50).optional().describe('Platform post ids (platform_post_id); omit = recent posts'),
      reply_text: z.string().max(2200).optional(),
      name: z.string().max(120).optional(),
    },
    async (args) => result(await client.post('/v1/social/automations', args)));

  tool('update_social_automation', ANN.write,
    'Social Planner (beta): change a comment-to-DM rule, or pause/resume it with active.',
    {
      automation_id: id,
      dm_text: z.string().min(1).max(1000).optional(),
      keywords: z.array(z.string().max(100)).max(20).optional(),
      post_ids: z.array(z.string().max(300)).max(50).optional(),
      reply_text: z.string().max(2200).nullable().optional(),
      name: z.string().max(120).optional(),
      active: z.boolean().optional(),
    },
    async ({ automation_id, ...body }) => result(await client.patch(`/v1/social/automations/${automation_id}`, body)));

  tool('delete_social_automation', ANN.destroy,
    'Social Planner (beta): delete a comment-to-DM rule and its history. Only when the user asks.',
    { automation_id: id },
    async ({ automation_id }) => result(await client.delete(`/v1/social/automations/${automation_id}`)));

  tool('get_social_automation_hits', ANN.read,
    'Social Planner (beta): who a comment-to-DM rule answered: comment, author, whether the DM and public reply went out, and any error. Latest 200.',
    { automation_id: id },
    async ({ automation_id }) => result(await client.get(`/v1/social/automations/${automation_id}/hits`)));

  tool('list_social_posts', ANN.read,
    'Social Planner (beta): the calendar. Posts (queued, processing, published, failed, ...) whose scheduled or created time falls in [from, to). Up to 500, newest first.',
    { from: z.string().optional().describe('ISO date'), to: z.string().optional().describe('ISO date') },
    async (args) => result(await client.get('/v1/social/posts' + qs(args))));

  tool('get_social_post', ANN.readRemote,
    'Social Planner (beta): one post with its live status, permalink and error. Checking a processing post moves it forward.',
    { post_id: id },
    async ({ post_id }) => result(await client.get(`/v1/social/posts/${post_id}`)));

  tool('update_social_post', ANN.write,
    'Social Planner (beta): change a QUEUED (scheduled, not yet sent) post: move scheduled_at, edit caption, title or settings. A post that is sending or done cannot change.',
    {
      post_id: id,
      scheduled_at: z.string().optional().describe('ISO 8601; a past time sends it within a minute'),
      caption: z.string().max(5000).optional(),
      title: z.string().max(200).optional(),
      settings: z.record(z.any()).optional(),
    },
    async ({ post_id, ...body }) => result(await client.patch(`/v1/social/posts/${post_id}`, body)));

  tool('cancel_social_post', ANN.destroy,
    'Social Planner (beta): cancel a QUEUED post so it is never sent. Cannot remove a post that is already published.',
    { post_id: id },
    async ({ post_id }) => result(await client.delete(`/v1/social/posts/${post_id}`)));

  tool('get_social_post_metrics', ANN.readRemote,
    'Social Planner (beta): analytics for a published post (views, reach, likes, comments, shares, saves, watch time where the platform gives them) plus snapshot history. refresh=true reads the platform now; otherwise the latest stored snapshot (taken every 6 h).',
    { post_id: id, refresh: z.boolean().optional() },
    async ({ post_id, refresh }) => result(await client.get(`/v1/social/posts/${post_id}/metrics` + qs({ refresh: refresh ? 1 : undefined }))));

  tool('get_social_account_metrics', ANN.readRemote,
    'Social Planner (beta): account analytics (followers, reach, views, profile activity) plus snapshot history. refresh=true reads the platform now; otherwise the latest stored snapshot (taken every 12 h).',
    { account_id: id, refresh: z.boolean().optional() },
    async ({ account_id, refresh }) => result(await client.get(`/v1/social/accounts/${account_id}/metrics` + qs({ refresh: refresh ? 1 : undefined }))));
}

module.exports = { registerSocialTools };

'use strict';
/**
 * Social Planner. Registered by default; the backend decides which platforms each account may use
 * (and its account limit) and answers 404 when it has none. The hosted connector passes
 * `socialPlanner: false` for those accounts; stdio users can hide the tools with KOLBO_SOCIAL_PLANNER=0.
 *
 * Their safety hints live in src/toolAnnotations.js with every other tool (the ANN values below match it).
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
  writePrivate: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  destroy: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
};

// Automations: one trigger plus ordered steps (Instagram and Facebook Pages). Shapes mirror the SDK body.
const keywords = z.array(z.string().max(100)).max(20);
const postIds = z.array(z.string().max(300)).max(50);
const trigger = z.object({
  type: z.enum(['comment_keyword', 'dm_keyword', 'story_reply', 'story_mention']),
  keywords: keywords.optional().describe('Case-insensitive; omit or [] = everyone. Not allowed on story_mention'),
  match: z.enum(['contains', 'exact']).optional().describe('Default contains'),
  post_ids: postIds.optional().describe('comment_keyword only: platform post ids (platform_post_id); omit = any post'),
  include_replies: z.boolean().optional().describe('comment_keyword only: also answer replies to comments'),
  first_message_only: z.boolean().optional().describe("dm_keyword only: answer only a person's first message to the account"),
});
const button = z.object({
  title: z.string().min(1).max(20),
  url: z.string().max(2000).regex(/^https:\/\/\S+$/, 'must be an https:// link'),
});
const stepId = z.string().regex(/^[\w-]{1,24}$/).optional().describe('Keep the id when editing an existing step; omit for new steps');
const step = z.discriminatedUnion('type', [
  z.object({ id: stepId, type: z.literal('send_dm'), text: z.string().min(1).max(1000).describe('Up to 640 characters when buttons are set'), buttons: z.array(button).max(3).optional() }),
  z.object({ id: stepId, type: z.literal('public_reply'), replies: z.array(z.string().min(1).max(2200)).min(1).max(5).describe('comment_keyword only: public replies under the comment, rotated') }),
  z.object({ id: stepId, type: z.literal('follow_gate'), text: z.string().min(1).max(640).optional(), button_title: z.string().min(1).max(20).optional(), max_checks: z.number().int().min(1).max(3).optional() }),
  z.object({ id: stepId, type: z.literal('delay'), minutes: z.number().int().min(1).max(1380) }),
  z.object({ id: stepId, type: z.literal('add_tag'), tag: z.string().min(1).max(40) }),
  z.object({ id: stepId, type: z.literal('notify_owner'), title: z.string().max(120).optional() }),
]);
const AUTOMATION_RULES = 'Works on Instagram and Facebook Pages. Triggers: comment_keyword (a comment on the account\'s posts: instant when live delivery is on, otherwise checked every 5 minutes; only comments written after the automation is created count, up to 7 days old), dm_keyword (a direct message; on Facebook that is Messenger), story_reply and story_mention (Instagram). DM and story triggers need live delivery (engage.live in list_social_accounts). Each person triggers it once per post (comment triggers) or once per 24 h (DM and story triggers). Steps run in order: send_dm (up to 3 link buttons), public_reply (comment triggers only), follow_gate (Instagram only: asks the person to follow, then re-checks), delay (1-1380 minutes), add_tag, notify_owner. A comment allows ONE private message until the person replies; after that a message can only go out within 24 h of their last message or button tap. Texts may use {first_name}, {username} and {account}.';

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
    'Social Planner (beta): publish now, or schedule with scheduled_at, ONE post to ONE connected account. Cross-posting = one call per account. media_ids are Kolbo media library ids (list_media), or the upload_id of a social-publish large upload (files over 500 MB, up to 5 GB: create_upload_ticket / upload_media with purpose social-publish). A large file is sent from the Kolbo queue in the background: the post comes back "queued" and moves on within a minute. This posts publicly on the user\'s real account: get the user\'s explicit approval of the account, media, caption and time first, never post on your own initiative. status "processing" means the platform is still preparing it: check get_social_post. "unconfirmed" means the outcome is unknown: do NOT retry, ask the user to check the account. TikTok needs settings.privacy_level from get_tiktok_creator_info. YouTube needs title.',
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
    "Social Planner (beta): the DM inbox (Instagram Direct and Facebook Messenger), newest first, with participant, snippet, unread count, tags and whether the 24-hour reply window is open (window_open, window_closes_at). With account_id: that account's conversations; pass next as after for more. Without account_id: every account's inbox merged, with each account's state (accounts) and its own next cursor; after works only together with account_id.",
    { account_id: id.optional(), after: z.string().max(500).optional() },
    async ({ account_id, after }) => {
      if (!account_id) {
        if (after) return { content: [{ type: 'text', text: 'after needs account_id: pass that account id with its cursor from the merged inbox next.' }], isError: true };
        return result(await client.get('/v1/social/inbox'));
      }
      return result(await client.get(`/v1/social/accounts/${account_id}/conversations` + qs({ after })));
    });

  tool('get_social_conversation', ANN.readRemote,
    'Social Planner (beta): the latest 50 messages of one DM conversation from list_social_conversations (Instagram Direct or Facebook Messenger), with the contact and whether the 24-hour reply window is open. Reading it marks the conversation read.',
    { account_id: id, conversation_id: z.string().min(1).max(300) },
    async ({ account_id, conversation_id }) => result(await client.get(`/v1/social/accounts/${account_id}/conversations/${encodeURIComponent(conversation_id)}/messages`)));

  tool('send_social_message', ANN.write,
    "Social Planner (beta): send a direct message on Instagram or Facebook Messenger. recipient_id = a participant id from list_social_conversations, allowed only within 24 h of that person's last message (otherwise it fails with WINDOW_CLOSED: the platform does not allow it, so the person has to write again first), OR comment_id = a private reply to that comment's author (one per comment, within 7 days of the comment). Sends as the account: show the user the exact text and get approval first.",
    { account_id: id, text: z.string().min(1).max(1000), recipient_id: z.string().max(300).optional(), comment_id: z.string().max(300).optional() },
    async ({ account_id, ...body }) => result(await client.post(`/v1/social/accounts/${account_id}/messages`, body)));

  tool('list_social_automations', ANN.read,
    'Social Planner (beta): automations (trigger, steps, active, stats, last run and last error), newest first. account_id narrows to one account. Older rules also show keywords, post_ids, dm_text and reply_text.',
    { account_id: id.optional() },
    async ({ account_id }) => result(await client.get('/v1/social/automations' + qs({ account_id }))));

  tool('list_social_automation_templates', ANN.read,
    'Social Planner (beta): ready-made automations (comment a word to get a link, follow to unlock, thank story replies, welcome a new DM, thank story mentions, answer a DM keyword) with their platforms, trigger and steps. fill lists the fields the user must fill in (such as a button url) before create_social_automation.',
    {}, async () => result(await client.get('/v1/social/automations/templates')));

  const automationFields = {
    name: z.string().max(120).optional(),
    active: z.boolean().optional(),
    trigger: trigger.optional(),
    steps: z.array(step).min(1).max(10).optional().describe('Run in order; on update replaces all steps'),
    dm_text: z.string().min(1).max(1000).optional().describe('Older form: one private reply to a comment. Prefer trigger + steps'),
    keywords: keywords.optional().describe('Older form: comment keywords. Prefer trigger.keywords'),
    post_ids: postIds.optional().describe('Older form: platform post ids. Prefer trigger.post_ids'),
  };

  tool('create_social_automation', ANN.write,
    `Social Planner (beta): create an automation that answers people who engage with the account. ${AUTOMATION_RULES} Pass trigger + steps (start from list_social_automation_templates when one fits), or the older comment-to-DM form dm_text (+ keywords, post_ids, reply_text). It messages real people as the account: confirm the trigger, every text and every link with the user before creating.`,
    {
      account_id: id,
      ...automationFields,
      template: z.string().max(60).optional().describe('Key of the template it was built from (list_social_automation_templates)'),
      reply_text: z.string().max(2200).optional().describe('Older form: public reply under the comment. Prefer a public_reply step'),
    },
    async (args) => {
      if (!args.steps && !args.dm_text) {
        return { content: [{ type: 'text', text: 'Give steps (with a trigger), or dm_text for a simple comment-to-DM rule. list_social_automation_templates has ready-made ones.' }], isError: true };
      }
      return result(await client.post('/v1/social/automations', args));
    });

  tool('update_social_automation', ANN.write,
    `Social Planner (beta): change an automation, or pause/resume it with active. trigger and steps each replace the whole value: read it with list_social_automations first and send every step you keep, with its id. ${AUTOMATION_RULES} Confirm changed texts and links with the user first.`,
    {
      automation_id: id,
      ...automationFields,
      template: z.string().max(60).nullable().optional(),
      reply_text: z.string().max(2200).nullable().optional().describe('Older form; null removes the public reply'),
    },
    async ({ automation_id, ...body }) => result(await client.patch(`/v1/social/automations/${automation_id}`, body)));

  tool('delete_social_automation', ANN.destroy,
    'Social Planner (beta): delete an automation and its run history. Only when the user asks.',
    { automation_id: id },
    async ({ automation_id }) => result(await client.delete(`/v1/social/automations/${automation_id}`)));

  tool('get_social_automation_hits', ANN.read,
    "Social Planner (beta): an automation's runs, newest first: who triggered it, the comment or message, each step's status (sent, waiting, skipped with a reason such as window_closed or not_following, failed), what it is waiting for, and any error. Pass next as before for older runs.",
    { automation_id: id, limit: z.number().int().min(1).max(200).optional(), before: z.string().max(40).optional().describe('ISO time: runs created before it (next)') },
    async ({ automation_id, limit, before }) => result(await client.get(`/v1/social/automations/${automation_id}/hits` + qs({ limit, before }))));

  tool('list_social_contacts', ANN.read,
    'Social Planner (beta): people who commented on or messaged the account (Instagram, Facebook Pages), most recent first, with tags, unread count, whether they follow (Instagram, once checked) and whether the 24-hour reply window is open. Filter by account_id, tag or q (username or name). Pass next as before for more.',
    {
      account_id: id.optional(),
      tag: z.string().max(40).optional(),
      q: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      before: z.string().max(40).optional().describe('ISO time from next'),
    },
    async (args) => result(await client.get('/v1/social/contacts' + qs(args))));

  const tag = z.string().min(1).max(40).regex(/^[\p{L}\p{N} _-]+$/u, 'letters, numbers, spaces, _ and - only');
  tool('tag_social_contact', ANN.writePrivate,
    'Social Planner (beta): add or remove tags on a contact from list_social_contacts (stored lowercase, up to 20 per contact). Tags stay in Kolbo; nothing is sent to the person or the platform.',
    { contact_id: id, add_tags: z.array(tag).max(20).optional(), remove_tags: z.array(tag).max(20).optional() },
    async ({ contact_id, add_tags, remove_tags }) => {
      if (!add_tags?.length && !remove_tags?.length) {
        return { content: [{ type: 'text', text: 'Give add_tags or remove_tags.' }], isError: true };
      }
      return result(await client.patch(`/v1/social/contacts/${contact_id}`, { add_tags, remove_tags }));
    });

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

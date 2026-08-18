/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { buildProjectUrl } = require('./_shared');
const { listResult } = require('../apps');

function registerProjectTools(server, client) {
  // ─── list_projects ─────────────────────────────────────────
  server.tool(
    'list_projects',
    'List the user\'s platform projects (owned + shared with edit/full/owner permission). Use this to resolve a project NAME the user mentioned ("put this in my Acme Campaign project") into the project ObjectId you pass back as `project_id` on generation / chat / upload / move tools. Whenever the user mentions a project by name OR location, you MUST call this first — those tools accept only ObjectIds, not names — and then pass the resolved `project_id` on EVERY subsequent call in the conversation (it is per-call, not sticky; omitting it drops work into the default bucket). Returns id, name, role, is_default, and is_archived. The project flagged `is_default: true` is the auto-created "API Generations" bucket every SDK generation lands in when project_id is omitted. Accounts routinely have HUNDREDS of projects, so this is paginated: when you already know the name, pass `search` — it is far cheaper than listing everything. Default page size is 50; use `page` to walk the rest (`pagination.has_more` tells you when to stop). Archived projects are hidden unless you pass `include_archived: true`.',
    {
      search: z.string().optional().describe('Case-insensitive substring match on the project name. Use this whenever the user named a project — it turns a full listing into a one-item answer.'),
      page: z.number().optional().describe('Page number, 1-indexed. Default: 1'),
      limit: z.number().optional().describe('Results per page, max 200. Default: 50'),
      include_archived: z.boolean().optional().describe('Also return archived projects. Default false — archived projects are hidden here exactly as they are in the web app.')
    },
    async ({ search, page, limit, include_archived }) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      if (include_archived) params.set('include_archived', 'true');
      const qs = params.toString();
      const result = await client.get(`/v1/projects${qs ? '?' + qs : ''}`);
      const projects = (result.projects || []).map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        is_default: !!p.is_default,
        is_archived: !!p.is_archived,
        thumbnail_url: p.thumbnail_url || null,
        open_url: buildProjectUrl(p.id, { is_default: !!p.is_default })
      }));
      const text = JSON.stringify({
        projects,
        count: projects.length,
        pagination: result.pagination || null,
        _hint: 'Pass the chosen `id` as `project_id` on any generate_* tool to drop the generation into that project. Omit project_id to use the project flagged is_default:true. `open_url` opens that project\'s media in the web app (share it with the user). If `pagination.has_more` is true there are more projects — narrow with `search` rather than paging through everything.'
      }, null, 2);

      return listResult(text, {
        widget: 'list',
        title: 'Your Projects',
        items: projects.map(p => ({
          id: p.id,
          title: p.name,
          subtitle: p.role + (p.is_default ? ' · default' : '') + (p.is_archived ? ' · archived' : ''),
          thumbnail: p.thumbnail_url,
          open_url: p.open_url,
          use_hint: 'Use my "{TITLE}" project (project_id: {ID}) for what I do next.'
        })),
        total: projects.length
      });
    }
  );

  // ─── move_session ──────────────────────────────────────────
  server.tool(
    'move_session',
    'Move ONE session — and ALL of its generations and media library items — to another project. Works for any session type: generation sessions (the `session_id` returned by generate_* tools), chat conversations, transcription sessions, etc. Use this when work landed in the wrong project (e.g. the default "API Generations" bucket) and the user wants it in a named project — moving is always better than regenerating. For SEVERAL sessions use `bulk_move_sessions` instead: one call, up to 100 sessions, and it reports per-session failures. Caller needs edit/full/owner permission on BOTH the source and target projects (a shared-project member can move a teammate\'s session). Resolve the target project id with `list_projects` first.',
    {
      session_id: z.string().describe('The session ObjectId to move (from a generation submit response, chat_list_conversations, or an "Open in Kolbo" link).'),
      project_id: z.string().describe('Target project ObjectId. Call `list_projects` to resolve a project name to its id.'),
      type: z.string().optional().describe('Optional session type hint to speed up the lookup: image, video, video_from_image, music, speech, sound, image_edit, creative_director, chat, elements, first_last_frame, lipsync, video_from_video, transcription, global_image_edit, global_video_edit, shorts. Omit if unsure — the server probes all types.')
    },
    async ({ session_id, project_id, type }) => {
      const body = { project_id };
      if (type) body.type = type;
      const result = await client.patch(`/v1/sessions/${encodeURIComponent(session_id)}/project`, body);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session: result.session,
            _hint: 'The session and its media now live in the new project. Future generations still need `project_id` passed explicitly on each call.'
          }, null, 2)
        }]
      };
    }
  );
  // ─── bulk_move_sessions ────────────────────────────────────
  server.tool(
    'bulk_move_sessions',
    'Move MANY sessions into one project in a single call — the tool to use when reorganizing a user\'s library ("file all my Acme work into the Acme project", "clean up the API Generations bucket"). Each session carries ALL of its generations and media with it. Prefer this over looping `move_session`: one call handles up to 100 sessions, while `move_session` is rate limited per call. Sessions of mixed types (chat + image + video) can go in the SAME call. Each session moves independently, so one that cannot move — a generation still running, a Creative Director session, or one you lack edit access to — does NOT block the rest; check `failed[]` in the result and report those to the user. Resolve session ids with `list_sessions` and the target project id with `list_projects` first.',
    {
      session_ids: z.array(z.string()).describe('Session ObjectIds to move (from `list_sessions`, a generation submit response, or an "Open in Kolbo" link). Up to 100 per call; types may be mixed.'),
      project_id: z.string().describe('Target project ObjectId. Call `list_projects` to resolve a project name to its id.'),
      type: z.string().optional().describe('Optional session type hint that speeds up the lookup when EVERY id in the batch is the same type: image, video, video_from_image, music, speech, sound, image_edit, chat, elements, first_last_frame, lipsync. Omit for mixed batches — the server probes all types.')
    },
    async ({ session_ids, project_id, type }) => {
      const body = { session_ids, project_id };
      if (type) body.type = type;
      const result = await client.post('/v1/sessions/move', body);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            project_id: result.project_id,
            moved_sessions_count: result.moved_sessions_count,
            moved_generations_count: result.moved_generations_count,
            moved_media_count: result.moved_media_count,
            skipped: result.skipped,
            failed: result.failed,
            operation_ids: result.operation_ids,
            _hint: (result.failed && result.failed.length)
              ? 'Some sessions did not move — tell the user which ones and why (see failed[]). The rest are already in the new project.'
              : 'Every session, its generations and its media now live in the new project. Pass any operation_id to `undo_session_organization` within 15 minutes to reverse one.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── list_session_generations ──────────────────────────────
  server.tool(
    'list_session_generations',
    'List a session\'s generations as complete GROUPS — each entry is one generation with its prompt and ALL the outputs it produced. Call this FIRST whenever the user wants to reorganize WITHIN or BETWEEN sessions ("move these three shots into their own session", "split the good takes out"), because `move_generations_to_session` and `split_session` take the ids this returns. Also the cheapest way to see what is actually inside a session before moving it. A generation is never separable from its own outputs, so you always move whole entries. Only image, image-to-video, lipsync and video-to-video sessions support this level of organization; other types return SESSION_TYPE_NOT_MOVABLE and should be moved whole with `move_session`.',
    {
      session_id: z.string().describe('The session ObjectId to inspect.'),
      type: z.string().optional().describe('Optional session type hint to speed up the lookup. Omit if unsure.')
    },
    async ({ session_id, type }) => {
      const path = `/v1/sessions/${encodeURIComponent(session_id)}/generations`;
      const result = await client.get(path + (type ? `?type=${encodeURIComponent(type)}` : ''));
      const generations = result.generations || [];
      const text = JSON.stringify({
        session: result.session,
        generations,
        _hint: 'This is an inventory, not a live generation. Pass the `id` values to `move_generations_to_session` (into an existing session) or `split_session` (into a new one). `in_flight: true` means it is still running and cannot be moved yet.'
      }, null, 2);
      return listResult(text, {
        widget: 'list',
        title: (result.session && result.session.name) || 'Session generations',
        items: generations.map((g) => ({
          id: g.id,
          title: (g.prompt && String(g.prompt).slice(0, 80)) || g.id,
          subtitle: [g.status, g.output_count ? g.output_count + ' outputs' : null].filter(Boolean).join(' · '),
          badge: g.in_flight ? 'running' : g.status
        })),
        total: generations.length
      });
    }
  );

  // ─── move_generations_to_session ───────────────────────────
  server.tool(
    'move_generations_to_session',
    'Move SELECTED generations out of one session and into another EXISTING session — the way to merge scattered work ("put these shots into my Hero Sequence session", "these three belong with the earlier batch"). Only the chosen generations and THEIR OWN output media move; shared uploads and reference images stay with the source session, so nothing another generation still depends on is dragged away. The destination must be a session of the SAME kind, and may live in a different project as long as you can edit both. Get the generation ids from `list_session_generations` and the destination id from `list_sessions`. Running generations cannot be moved — wait for them to finish.',
    {
      session_id: z.string().describe('Source session ObjectId — the session the generations are in now.'),
      generation_ids: z.array(z.string()).describe('Generation ids to move, from `list_session_generations`. Whole entries only.'),
      target_session_id: z.string().describe('Destination session ObjectId. Must be the same session kind as the source.'),
      type: z.string().optional().describe('Optional session type hint to speed up the lookup. Omit if unsure.')
    },
    async ({ session_id, generation_ids, target_session_id, type }) => {
      const body = { generation_ids, target_session_id };
      if (type) body.type = type;
      const result = await client.post(
        `/v1/sessions/${encodeURIComponent(session_id)}/generations/move`, body
      );
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            moved_generations_count: result.moved_generations_count,
            moved_media_count: result.moved_media_count,
            target_session_id: result.target_session_id,
            project_id: result.project_id,
            operation_id: result.operation_id,
            _hint: 'Reversible for 15 minutes — pass operation_id to `undo_session_organization`.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── split_session ─────────────────────────────────────────
  server.tool(
    'split_session',
    'Carve selected generations out of a session into a BRAND NEW named session, atomically. Use when one session has grown into several distinct pieces of work ("separate the product shots from the lifestyle ones", "give the approved takes their own session"). Creates the new session and moves the chosen generations plus their output media into it in one transaction — nothing half-lands. The new session goes in the same project unless you pass `project_id`. Get the generation ids from `list_session_generations` first.',
    {
      session_id: z.string().describe('Source session ObjectId to split.'),
      generation_ids: z.array(z.string()).describe('Generation ids to move into the new session, from `list_session_generations`.'),
      name: z.string().describe('Name for the new session — make it descriptive, the user sees it in the sidebar.'),
      project_id: z.string().optional().describe('Put the new session in a DIFFERENT project. Omit to keep it in the source session\'s project. You need edit access on both.'),
      type: z.string().optional().describe('Optional session type hint to speed up the lookup. Omit if unsure.')
    },
    async ({ session_id, generation_ids, name, project_id, type }) => {
      const body = { generation_ids, name };
      if (project_id) body.project_id = project_id;
      if (type) body.type = type;
      const result = await client.post(`/v1/sessions/${encodeURIComponent(session_id)}/split`, body);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session: result.session,
            moved_generations_count: result.moved_generations_count,
            moved_media_count: result.moved_media_count,
            operation_id: result.operation_id,
            _hint: 'Reversible for 15 minutes — `undo_session_organization` removes the new session and returns its generations.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── undo_session_organization ─────────────────────────────
  server.tool(
    'undo_session_organization',
    'Reverse a session move, generation move, or split within 15 minutes of making it. Use immediately when the user says the reorganization was wrong ("no, put that back", "undo that move"). Takes the `operation_id` returned by `move_session`, `bulk_move_sessions`, `move_generations_to_session` or `split_session` — a batch move returns one id PER session, so call this once per id you want to reverse. Refuses safely if the work has moved again since, rather than yanking records out of wherever they now live.',
    {
      operation_id: z.string().describe('The operation_id from the move/split result you want to reverse.')
    },
    async ({ operation_id }) => {
      const result = await client.post(
        `/v1/sessions/organize/undo/${encodeURIComponent(operation_id)}`, {}
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
  // ─── create_project ────────────────────────────────────────
  server.tool(
    'create_project',
    'Create a new Kolbo project. Use when the user starts a new body of work ("new project for film X", "set up a workspace for the campaign"). After creating, pass the returned id as `project_id` on EVERY subsequent generation/upload/doc call for that work. Plan limits apply (server rejects when the plan\'s project cap is reached).',
    {
      name: z.string().describe('Project name.'),
      description: z.string().optional().describe('Optional description (max 10k chars, markdown OK). Great place for the brief/logline — it also feeds the project\'s AI profile.')
    },
    async ({ name, description }) => {
      const body = { name };
      if (description) body.description = description;
      const result = await client.post('/v1/projects', body);
      const open_url = buildProjectUrl(result.project && result.project.id, { is_default: !!(result.project && result.project.is_default) });
      return { content: [{ type: 'text', text: JSON.stringify({ project: result.project, open_url, _hint: 'Pass this id as project_id on every subsequent call for this work. `open_url` opens the project in the web app — share it with the user.' }, null, 2) }] };
    }
  );

  // ─── update_project ────────────────────────────────────────
  server.tool(
    'update_project',
    'Rename a project and/or update its description. Changing the description also refreshes the project\'s AI profile in the background.',
    {
      project_id: z.string().describe('Project ObjectId (from list_projects).'),
      name: z.string().optional().describe('New name.'),
      description: z.string().optional().describe('New description (replaces the old one).')
    },
    async ({ project_id, name, description }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      const result = await client.put(`/v1/projects/${encodeURIComponent(project_id)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result.project, null, 2) }] };
    }
  );

  // ─── archive_project / unarchive_project ───────────────────
  server.tool(
    'archive_project',
    'Archive a project — hides it from the default project list without deleting anything. Fully reversible with `unarchive_project`. (Permanent project DELETION is intentionally not available via the API — it cascades to all content and stays an in-app action.)',
    { project_id: z.string().describe('Project ObjectId to archive.') },
    async ({ project_id }) => {
      const result = await client.put(`/v1/projects/${encodeURIComponent(project_id)}/archive`, {});
      return { content: [{ type: 'text', text: JSON.stringify(result.project, null, 2) }] };
    }
  );
  server.tool(
    'unarchive_project',
    'Restore an archived project back to the active list.',
    { project_id: z.string().describe('Project ObjectId to unarchive.') },
    async ({ project_id }) => {
      const result = await client.put(`/v1/projects/${encodeURIComponent(project_id)}/unarchive`, {});
      return { content: [{ type: 'text', text: JSON.stringify(result.project, null, 2) }] };
    }
  );

  // ─── list_sessions ─────────────────────────────────────────
  server.tool(
    'list_sessions',
    'List the user\'s sessions across ALL generation types (image, video, music, chat, transcription…), newest-activity first. Each row includes `session_id`, `name`, pipe `type`, `types[]`, and `project_id` — pass that `project_id` on later generate/chat/upload calls for work in this conversation. Use to answer "what\'s in this project?", to find a session_id for `move_session` / `rename_session` / `delete_session`, or to locate past work. Filter by `project_id` and/or `type` (one key) and/or `types` (several keys).',
    {
      project_id: z.string().optional().describe('Restrict to one project (ObjectId from list_projects).'),
      type: z.string().optional().describe('Restrict to one session type (pipe string on the row stays). Keys: image, video, video_from_image, music, speech, sound, image_edit, creative_director, chat, elements, first_last_frame, lipsync, video_from_video, transcription, global_image_edit, global_video_edit, shorts.'),
      types: z.array(z.string()).optional().describe('Restrict to several session types at once (same keys as `type`). Additive with `type`.'),
      page: z.number().optional().describe('Page number, 1-indexed. Default: 1'),
      limit: z.number().optional().describe('Results per page, max 50. Default: 20')
    },
    async ({ project_id, type, types, page, limit }) => {
      const params = new URLSearchParams();
      if (project_id) params.set('project_id', project_id);
      if (type) params.set('type', type);
      if (Array.isArray(types) && types.length) params.set('types', types.join(','));
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      const result = await client.get(`/v1/sessions${qs ? '?' + qs : ''}`);
      const sessions = (result.sessions || []).map((s) => {
        const kinds = Array.isArray(s.types)
          ? s.types
          : String(s.type || '').split('|').filter(Boolean);
        return { ...s, type: s.type, types: kinds, project_id: s.project_id || null };
      });
      const text = JSON.stringify({
        sessions,
        pagination: result.pagination || null,
        _hint: 'Each row has project_id — pass it on every later generate/chat/upload in this conversation. Empty leftover sessions after a move: delete_session.'
      }, null, 2);

      return listResult(text, {
        widget: 'list',
        title: 'Sessions' + (type ? ' — ' + type : '') + ' (' + sessions.length + ')',
        items: sessions.map(s => ({
          id: s.session_id,
          title: s.name || s.types[0] || s.type || 'Session',
          subtitle: [
            s.session_id,
            (s.types || []).join(', '),
            s.project_id ? 'project ' + s.project_id : null,
            s.updated_at ? String(s.updated_at).slice(0, 10) : null
          ].filter(Boolean).join(' · '),
          badge: (s.types && s.types[0]) || undefined
        })),
        total: sessions.length
      });
    }
  );

  server.tool(
    'rename_session',
    'Rename a session the user can see in the Kolbo sidebar. Use after `list_sessions` when they say "call this Hero Sequence" or leftover API daily names should become human titles. Does not move the session or its media.',
    {
      session_id: z.string().describe('Session ObjectId from `list_sessions` or a generate_* result.'),
      name: z.string().describe('New sidebar title (1–200 characters).'),
      type: z.string().optional().describe('Optional session type hint to speed up the lookup. Omit if unsure.')
    },
    async ({ session_id, name, type }) => {
      const body = { name };
      if (type) body.type = type;
      const result = await client.patch(`/v1/sessions/${encodeURIComponent(session_id)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result.session || result, null, 2) }] };
    }
  );

  server.tool(
    'delete_session',
    'Soft-delete a session (trash). Use for empty leftover sessions after `move_session` / `move_generations_to_session` / `split_session`, or when the user asks to remove a session. Does not permanently wipe media on its own — restore with `restore_session` if they change their mind.',
    {
      session_id: z.string().describe('Session ObjectId from `list_sessions`.'),
      type: z.string().optional().describe('Optional session type hint to speed up the lookup. Omit if unsure.')
    },
    async ({ session_id, type }) => {
      const result = await client.delete(
        `/v1/sessions/${encodeURIComponent(session_id)}`,
        type ? { type } : {}
      );
      return { content: [{ type: 'text', text: JSON.stringify(result.session || result, null, 2) }] };
    }
  );

  server.tool(
    'restore_session',
    'Restore a session previously removed with `delete_session` (clears deletedAt). Use when the user undoes a trash action in this conversation.',
    {
      session_id: z.string().describe('Session ObjectId that was just soft-deleted.'),
      type: z.string().optional().describe('Optional session type hint to speed up the lookup. Omit if unsure.')
    },
    async ({ session_id, type }) => {
      const body = {};
      if (type) body.type = type;
      const result = await client.post(`/v1/sessions/${encodeURIComponent(session_id)}/restore`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result.session || result, null, 2) }] };
    }
  );

  // ─── Project context / knowledge base (NotebookLM-style) ───
  server.tool(
    'add_project_context',
    'Feed knowledge into a project\'s AI knowledge base (RAG): a website URL or pasted text (script, brief, research, brand facts). The server analyzes it in the background (source returns status "analyzing" and settles on its own) and synthesizes everything into the project\'s living profile. Use when the user says "add this to the project", "here\'s the script", "the project should know about X". Provide exactly ONE of url / text.',
    {
      project_id: z.string().describe('Project ObjectId (from list_projects).'),
      url: z.string().optional().describe('Website URL to fetch and analyze as a source.'),
      text: z.string().optional().describe('Raw text to store as a source (script, notes, research). Kept verbatim for RAG; an AI summary is generated for display.'),
      title: z.string().optional().describe('Optional title for a text source.')
    },
    async ({ project_id, url, text, title }) => {
      if (!url && !text) throw new Error('Provide url or text');
      const path = url
        ? `/v1/projects/${encodeURIComponent(project_id)}/context/url`
        : `/v1/projects/${encodeURIComponent(project_id)}/context/text`;
      const body = url ? { url } : { text, ...(title ? { title } : {}) };
      const result = await client.post(path, body);
      return { content: [{ type: 'text', text: JSON.stringify({ source: result.source, _hint: 'Analysis runs in the background — no need to poll; the project profile updates on its own.' }, null, 2) }] };
    }
  );

  server.tool(
    'list_project_context',
    'List a project\'s knowledge-base sources (URLs, texts, files) with their AI summaries and analysis status.',
    { project_id: z.string().describe('Project ObjectId.') },
    async ({ project_id }) => {
      const result = await client.get(`/v1/projects/${encodeURIComponent(project_id)}/context`);
      const sources = result.sources || [];
      const text = JSON.stringify({ sources, count: result.count || 0 }, null, 2);

      return listResult(text, {
        widget: 'list',
        title: 'Project Knowledge Base',
        items: sources.map(s => ({
          id: s.file_key,
          title: s.title || s.type,
          subtitle: s.type + ' · ' + s.status,
          open_url: s.url || null
        })),
        total: sources.length
      });
    }
  );

  server.tool(
    'delete_project_context',
    'Remove one source from a project\'s knowledge base by its file_key (from list_project_context).',
    {
      project_id: z.string().describe('Project ObjectId.'),
      file_key: z.string().describe('The source\'s file_key (URL-encode is handled for you).')
    },
    async ({ project_id, file_key }) => {
      const result = await client.delete(`/v1/projects/${encodeURIComponent(project_id)}/context/${encodeURIComponent(file_key)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_project_profile',
    'Read a project\'s synthesized AI profile — the living markdown brief the platform maintains from the project\'s description, context sources, and activity. Use it to ground your work in what the project is about before generating.',
    { project_id: z.string().describe('Project ObjectId.') },
    async ({ project_id }) => {
      const result = await client.get(`/v1/projects/${encodeURIComponent(project_id)}/profile`);
      return { content: [{ type: 'text', text: JSON.stringify(result.profile, null, 2) }] };
    }
  );

  server.tool(
    'regenerate_project_profile',
    'Force-regenerate a project\'s AI profile from its current context sources (also clears any manual-edit lock). Use after adding several new sources when the user wants the brief refreshed now.',
    { project_id: z.string().describe('Project ObjectId.') },
    async ({ project_id }) => {
      const result = await client.post(`/v1/projects/${encodeURIComponent(project_id)}/profile/regenerate`, {});
      return { content: [{ type: 'text', text: JSON.stringify(result.profile || result, null, 2) }] };
    }
  );
}

module.exports = { registerProjectTools };

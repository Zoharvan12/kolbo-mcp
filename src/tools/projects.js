/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { buildProjectUrl } = require('./_shared');

function registerProjectTools(server, client) {
  // ─── list_projects ─────────────────────────────────────────
  server.tool(
    'list_projects',
    'List the user\'s platform projects (owned + shared with edit/full/owner permission). Use this to resolve a project NAME the user mentioned ("put this in my Acme Campaign project") into the project ObjectId you pass back as `project_id` on generation / chat / upload / move tools. Whenever the user mentions a project by name OR location, you MUST call this first — those tools accept only ObjectIds, not names — and then pass the resolved `project_id` on EVERY subsequent call in the conversation (it is per-call, not sticky; omitting it drops work into the default bucket). Returns id, name, role, and is_default. The project flagged `is_default: true` is the auto-created "API Generations" bucket every SDK generation lands in when project_id is omitted. NOT the same as `app_builder_list_projects`, which scopes App Builder coding sessions only.',
    {},
    async () => {
      const result = await client.get('/v1/projects');
      const projects = (result.projects || []).map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        is_default: !!p.is_default,
        open_url: buildProjectUrl(p.id, { is_default: !!p.is_default })
      }));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            projects,
            count: projects.length,
            _hint: 'Pass the chosen `id` as `project_id` on any generate_* tool to drop the generation into that project. Omit project_id to use the project flagged is_default:true. `open_url` opens that project\'s media in the web app (share it with the user).'
          }, null, 2)
        }]
      };
    }
  );

  // ─── move_session ──────────────────────────────────────────
  server.tool(
    'move_session',
    'Move a session — and ALL of its media library items — to another project. Works for any session type: generation sessions (the `session_id` returned by generate_* tools), chat conversations, transcription sessions, etc. Use this when work landed in the wrong project (e.g. the default "API Generations" bucket) and the user wants it in a named project — moving is always better than regenerating. Caller must own the session and have edit/full/owner permission on the target project. Resolve the target project id with `list_projects` first.',
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
    'List the user\'s sessions across ALL generation types (image, video, music, chat, transcription…), newest-activity first. Use to answer "what\'s in this project?", to find a session_id for `move_session`, or to locate past work. Filter by `project_id` and/or `type`.',
    {
      project_id: z.string().optional().describe('Restrict to one project (ObjectId from list_projects).'),
      type: z.string().optional().describe('Restrict to one session type: image, video, video_from_image, music, speech, sound, image_edit, creative_director, chat, elements, first_last_frame, lipsync, video_from_video, transcription, global_image_edit, global_video_edit, shorts.'),
      page: z.number().optional().describe('Page number, 1-indexed. Default: 1'),
      limit: z.number().optional().describe('Results per page, max 50. Default: 20')
    },
    async ({ project_id, type, page, limit }) => {
      const params = new URLSearchParams();
      if (project_id) params.set('project_id', project_id);
      if (type) params.set('type', type);
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      const result = await client.get(`/v1/sessions${qs ? '?' + qs : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify({ sessions: result.sessions || [], pagination: result.pagination || null }, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify({ sources: result.sources || [], count: result.count || 0 }, null, 2) }] };
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

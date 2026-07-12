/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');

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
        is_default: !!p.is_default
      }));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            projects,
            count: projects.length,
            _hint: 'Pass the chosen `id` as `project_id` on any generate_* tool to drop the generation into that project. Omit project_id to use the project flagged is_default:true.'
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
}

module.exports = { registerProjectTools };

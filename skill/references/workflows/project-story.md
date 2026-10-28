# Project story — writing a published project's public page

A published Kolbo project has a public page. Its **story** is that page written as a post:
an ordered list of blocks that shows what was made and how. The owner edits it on the page
itself ("Edit page"); you edit the same story with three tools.

| Tool | What it does |
|---|---|
| `get_project_story` | Current blocks + `version` + `available_media` (every item the story may use, with `media_id`, type, prompt, model, date). Always call first. |
| `draft_project_story` | Kolbo analyses the project's media and returns a draft. **Not saved.** |
| `update_project_story` | Replaces the whole story. Pass `base_version` = the `version` you read. |
| `get_project_page_insights` | Visitor analytics for the page: visitors, active time, story reach, scroll depth, clicks, copies, sources, most-opened media. Read it before rewriting a story to keep what works. |

Publishing itself is `publish_project`; Google indexing needs `submit_project_to_catalog`
and a Kolbo review. A first publish drafts a story automatically when none exists.

## Blocks

| type | fields | use for |
|---|---|---|
| `heading` | `text` (≤160) | Section titles: "How it was made", "The characters" |
| `text` | `text` (≤5000) | Short paragraphs. Plain text, blank line = new paragraph |
| `media` | `media_id`, `caption` | A result or an upload worth showing (hero shot, sketch, final cut) |
| `step` | `media_id` (generated only), `note` | One workflow step. The page shows the REAL prompt, model and references of that generation — never retype them |
| `before_after` | `before_media_id`, `after_media_id`, `caption` | Source → result (upload → generation, still → animated) |

Media must already be in the project: `upload_media` / `create_upload_ticket` with
`project_id`, or generate with `project_id`. Uploads qualify only when they are the
project OWNER's own images, videos or audio; documents, collaborators' uploads,
third-party stock and flagged media are never available. Max 60 blocks.

An approved (Google-listed) page stays listed when you edit it, but the edit sends it
back to Kolbo's review queue.

## Structure that reads well

1. **Hook** — `media` block with the strongest result (finished video first, else the best image).
2. **Intro** — one `text` block, 2-4 sentences: what this is, in the creator's voice.
3. `heading` "How it was made".
4. **3-8 `step` blocks in creation order** (oldest first — `available_media` has dates). One note each: what the step did and why ("Locked the look with a still before animating").
5. **`before_after`** wherever an upload or earlier result became a later one.
6. Optional `heading` + `media` for the cast or alternates.
7. One closing `text` line: what's in the project. No sales pitch.

Pick variety: different models, the moments the project changed direction, the final
piece. Skip re-rolls of the same prompt. 8-16 blocks is the sweet spot.

## Voice

- First person, the creator's own voice. Plain and concrete.
- Only facts from the project (prompts, models, sessions, dates). Never invent a client, award, team or result.
- No marketing words ("stunning", "cutting-edge", "unleash", "journey"), no emoji, no markdown.
- Captions under 15 words, step notes under 30.

## Loop

1. `get_project_story` → note `version`, scan `available_media`.
2. Write the blocks (or `draft_project_story` and edit it).
3. `update_project_story` with `base_version`.
4. Fix any `errors` (each names the block `index`) and resend. Act on `warnings` if they make sense.
5. `STORY_VERSION_CONFLICT` = someone saved in between: read again, re-apply, save.

If the project is published, a save is live immediately. Confirm with the user before
replacing a story they wrote themselves.

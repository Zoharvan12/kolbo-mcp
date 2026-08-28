# Production Log — `.kolbo/production.md`

Load this file when starting a multi-step production, or before continuing prior
media work ("edit", "redo", "the same character", `@name`, "scene N").

## Purpose and boundary

`.kolbo/production.md` is the agent's durable registry of **user-approved**
artifacts across turns. It is not the user's gallery and it is not a scratchpad
for generations that are still being judged.

The boundary is absolute:

- Do not create, edit, or append to the file when a generation succeeds.
- Do not log pending candidates, rejected takes, failures, unapproved session
  ids, planned buckets, or estimated costs.
- Write only after the user explicitly approves the actual generated result.
- Approval of the brief before generation does not approve the output.
- Silence, a topic change, asking for another take, or merely continuing the
  workflow is not approval.

Library → This session is the human-facing source for completed and provisional
media. `get_generation_status` is the source for in-flight jobs. The production
log is the source only for what has been locked.

## Read before continuation

Read `.kolbo/production.md` before acting on:

- "edit", "animate", "combine", "redo", "polish", "fix", "regenerate"
- "the same character / scene / image / video / sound", "that one", "scene N"
- `@name` references for Visual DNA
- any continuation of previously approved media work

If the file is missing and the user references prior work, resolve it from the
current conversation or Library/session tools. Do not guess and do not create a
placeholder entry.

## Approval loop

1. Generate the requested result.
2. Present it through the generation card / Library so the user can judge it.
3. Ask for a concrete decision: which result to lock, redo, or discard.
4. Keep all iterations provisional and leave `.kolbo/production.md` untouched.
5. When the user explicitly approves a visible result, update the log in that
   same turn and record only the approved winner.
6. Only after that write may the production advance to the next gated bucket.

Clear approvals include `approve`, `lock`, `that's the one`, `use take 2`, or an
equally unambiguous choice naming the actual result. If the user delegates a
choice **after seeing the takes** ("you choose between these"), choose one,
state which one, and log it as `(user-delegated choice)`. A pre-generation "you
pick" still requires approval of the resulting media before writing.

Legacy logs may contain `Candidates` sections. Treat them as unapproved. Do not
add new candidates. Promote only the item the user explicitly chooses; leave
unselected legacy lines untouched rather than adding new rejected entries.

## Write after approval

For an approved result, record:

- a plain-English label the user would use
- output URL
- model, resolution/quality, and video duration/sound state when applicable
- ISO approval date
- actual `credits_used` from the tool result—not a catalog estimate
- `session_id` and `generation_id` when returned
- Visual DNA / moodboard bindings such as `@maya → vdna_id`

If the approved result replaces an older approved asset, mark the old entry
`(superseded YYYY-MM-DD)` and add the new entry beneath it. Do not delete history.

### Tool choice

| State | Tool |
|---|---|
| File does not exist at approval time | `Write` with the stub below |
| File exists | `Read`, then `Edit` |
| Not sure | `Read`; on ENOENT, use `Write` |

## Canonical stub

```md
<!-- .kolbo/production.md — agent-managed registry of user-approved media.
     Pending and rejected generations stay in Library, not in this file.
     User may hand-edit; agent must Read-before-Edit to reconcile. -->

# Production Log

## 🎯 Now

**Brief:** <paraphrase of the approved production goal in 1-3 sentences>
**Now working on:** <the next approved production step>
**Approved:** <locked assets>
**Sessions:** <approved plan names + ids>
**Last updated:** <ISO date>

---

## Production: <name from user's request>

### Sessions
### Cast
### Visual DNA
### Scenes
### Audio
### Final
```

Subsection headings are suggestions. Adapt them to the production and omit empty
ones.

## Entry example

```md
### Sessions
- `Scene 02 — rainy street` — `ses_abc123` (video; approved 2026-08-28)

### Scenes
2. **Rainy street walk** — neon reflections, slow dolly
   - video: https://.../02-rain-b.mp4
   - model: kling-2 · 1080p · 5s · sound-on
   - generation_id: gen_8a2c…
   - session_id: ses_abc123
   - credits_used: 24
   - approved: 2026-08-28
```

## Rules

1. Approved artifacts only; generation success is never approval.
2. First touch uses `Write`; later touches use `Read` then `Edit`.
3. Body history is append-only. Mark replacements superseded; never delete.
4. Never log failures, rejected takes, or pending candidates.
5. Keep one file per workspace; separate productions use separate headings.
6. Resolve references from approved entries, not from an arbitrary later take.
7. Add a session row only when its associated result/bucket is approved. Reuse
   the active `session_id` for provisional retakes without logging it.
8. Preserve prompt tags and their URL / DNA-id bindings in approved entries.

## Production Log vs task planning

| | `.kolbo/production.md` | Task plan |
|---|---|---|
| Purpose | Durable approved artifact registry | Current provisional work |
| Content | Locked URLs, ids, sessions, actual cost | Generate, review, redo, choose |
| Write time | After explicit output approval | Before and during iteration |

When the user asks how much a session spent, call `get_session_usage`; do not
derive a remaining balance from production-log entries.

# Music operations, Trends, styles and project handoffs

Use these operations only when exposed by the connected MCP. Read its current schema and live catalog for supported inputs and prices. Existing creative brief, cost approval and project/session rules still apply. A listed tool is not proof that an operation ran.

## Music planning and edits

- `create_music_composition_plan` creates a free plan from a prompt, optionally with duration in seconds. Pass its returned composition plan to `generate_music` only after the generation cost is approved.
- `create_music_reference_audio` converts owned uploaded Kolbo audio into a music reference. This operation is billed like a track of that length; it is not a free upload. Upload local files first and confirm the cost before conversion.
- `edit_music_section` creates a new paid generation from a supported ElevenLabs source with a song id. Supply the source generation, start/end milliseconds and replacement text/styles. The region is 3 to 120 seconds. Preserve the original and poll the returned generation id.
- `import_music_audio` imports a public audio URL for reuse by `extend_music` or `cover_music`. Upload local files first. Match the import type to the later operation. Set rights_confirmed only when the user has confirmed they hold the audio rights.
- `extend_music` continues from the source end or continue_at seconds. `cover_music` re-records its musical identity in a new style. Both accept an imported upload id or a public audio URL with rights confirmation. Neither accepts a target duration; do not promise one. Obtain cost approval before generation.

## Trends and Motion Library

1. Use `list_trends` to discover the requested look or effect, including the motion family. Do not substitute a guessed recipe.
2. Read `get_trend` for the exact input keys, roles, choices, output and trial availability. A character input may accept a Visual DNA image URL; use the returned contract.
3. Call `estimate_trend_run` with the actual inputs and settings. Confirm the quote unless the user already approved that scope.
4. Call `run_trend` with the agreed credit ceiling and one stable idempotency key. Reuse that key after an uncertain response; a new key starts another chargeable run.
5. Follow `get_trend_run` and recover existing jobs through `list_trend_runs`. A wait timeout is not failure. `cancel_trend_run` releases unspent credits; free trial runs cannot be cancelled.

## Morphious Styles

`list_morphious_styles` returns catalog and personal styles. Pass the chosen id as style_id to `generate_video_from_video` with model `kolbo-morphious-motion` and the source video. This style route needs no reference image or prompt. Verify current video limits and price before execution.

`create_morphious_style` saves a named look from 1 to 8 uploaded image URLs. These define appearance, not subject identity. `delete_morphious_style` removes an owned custom style; catalog styles cannot be removed and past results remain.

## Creative Director status

Use `get_creative_director_status` for a Creative Director generation id. Inspect every scene's status and result URL. The overall run remains processing until all scenes are terminal; an expired wait window does not mean failure or authorize rerunning the batch.

## Project copies and transfers

`duplicate_project` makes a new owned project for a variant or a copy to prepare for sharing. Use its new project id for subsequent work and disclose stats.notCopied. Context files, the derived AI profile, chat sessions and in-flight generations do not travel; do not imply a complete backup. Duplication alone does not publish anything.

`list_project_transfers` lists incoming or outgoing requests, pending by default. `respond_project_transfer` accepts or declines an incoming request, or cancels an outgoing one. Confirm before acceptance: it immediately transfers ownership of the whole project. If blocked by in-flight generations, wait and retry rather than claiming acceptance succeeded.

For individual character/style handoffs, read `references/workflows/visual-dna.md` and use the dedicated Visual DNA transfer tools.

# Selected Drafts to final delivery

Use for a user-selected or favorited set of saved Drafts, especially dedicated
Draft rendering followed by Topaz. Pair with `../models/seedance25.md` for the
Draft contract and live model catalogs for current output options and cost.

## Select the exact takes

Query `list_media` with the current project, media type and `category: favorites`.
Read pagination and match library items to the project's manifest by exact media
ID or source URL. Do not infer favorites from local filenames, QC scores or a
similar title. Record selected source IDs and URLs before submitting work. Add an
explicitly requested new take to that selection even if it has not been starred.

Keep user-selected takes despite earlier creative review flags; disclose those
flags. Finalization preserves the chosen take. It does not authorize a new
creative generation or public publication.

## Render, then enhance

Quote the saved Draft with its output URL and original project. Use the dedicated
`draft_enhance` operation to render that same Draft. Do not substitute a fresh
text-to-video generation or a generic upscale. Read expiry from the live quote.

If the installed MCP schema does not expose the documented Draft operations,
inspect an available first-party Kolbo SDK/client route. Use its existing auth
without displaying credentials. Never invent unsupported tool arguments. If no
supported route exists, report the limitation before proposing paid replacement.

When requested, send each completed render to Topaz. **On Zohar's Windows PC, download
the renders and use the `topaz-local-upscale` skill (local Topaz, 0 credits; 9:16 → 4K60,
wide → 4K at the source 24 fps).** Use Kolbo Topaz only when that PC is unavailable. Read supported enhancement,
resolution and frame-rate settings live. Use the cheapest eligible output tier
unless the user chose another; a 60 fps request does not imply 4K. Preserve audio.
Independent jobs may run concurrently within current tool/provider limits. Each
take's enhancement depends on that take's completed render, not another source.

## Preserve accepted jobs and billing evidence

Persist submission receipts and generation IDs immediately, before polling or
downloading. Resume accepted jobs by ID. A timeout, stalled percentage or missing
credit field is not grounds for a new paid submission.

If a render is marked failed unexpectedly, check the same ID through the live
generation-status tool before retrying. This workflow has encountered stale failed
responses followed by completed outputs for the same jobs. Preserve both receipts
and verify the recovered file; do not assume every failure is stale.

Record quotes and completed render/enhancement credit reports separately. Duplicate
entries or changed credit totals require reconciliation against transaction or
settlement evidence. Label unresolved totals as platform-reported processing,
not verified net charges. Do not infer refunds, multiply estimates into actual
costs, or calculate remaining balance from an earlier snapshot. Retrying a status
check does not justify resubmitting the generation.

## Deliver only completed finals

Probe each final file for dimensions, frame rate, duration and audio. Review the
actual enhanced file for interpolation defects and preservation of the selected
motion. Honor explicit camera/story corrections rather than the myth's familiar
ending. Preserve raw review reports and explain inapplicable crop/branding flags.

Create the requested final folder with completed outputs only. For a Kolbo folder,
match exact final output URLs to media IDs, add those IDs, then list the folder to
verify membership and count. Generation IDs are not automatically library IDs.
For local delivery, verify files are present and provide a playable HTML gallery
with stories, downloads and relevant review notes. Keep Drafts and rejected takes
in their working/history locations. Preserve source-to-render-to-final mapping
and costs in the delivery manifest. Do not claim completion from submissions alone.

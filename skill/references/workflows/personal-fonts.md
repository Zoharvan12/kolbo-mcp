# Personal fonts (My Fonts)

## Curated font collection

The picker separates **My fonts** (account uploads) from **Font collection** (ready-to-use, read-only families). Use `list_fonts({source: "global"})` to browse the collection, `source: "custom"` for personal uploads (the default), or `source: "all"` to search both. Results are paginated; inspect the returned family IDs with `get_font` for available styles and actual script coverage. Never invent IDs or promise every language/weight for every family.

Collection families use the same `font_ids` generation path. Up to three families can be mixed across both sources. Do not upload or copy a collection font into My fonts, and do not try to rename/delete collection entries. Server-side SDK: `fonts.list({source: "global"})`. REST: `GET /api/v1/fonts?source=global`. Family metadata identifies `source: "custom" | "global"`; collection inspection also includes license information. Preserve licenses when redistributing font files. Availability still depends on the deployed collection and backend/client versions.


Use this workflow when the user supplies OTF, TTF or WOFF2 files, names a personal font, or wants to reuse fonts from a previous image.

## Discover and upload

Check the connected tool inventory first. Older MCP installations may not expose font tools yet; report that mismatch rather than pretending an upload succeeded or substituting media upload.

- Existing font: `list_fonts({search: "Birzia"})`, then `get_font({font_id})` for styles/scripts.
- Local stdio: `upload_font({file_path: "<absolute path to font>"})`.
- Remote connector with shell: `create_font_upload_ticket({})`; POST multipart field `file` to its exact `upload_url` with `Authorization: Bearer <ticket>`. Do not follow redirects or expose the ticket in chat, logs, or saved production notes.
- Browser-only: `font_upload_widget({})`. The user chooses the file.
- Upload one file per request, at most 5 MiB. Upload the requested weights separately; the backend groups matching families.
- Inspect the returned upload ID with `get_font_upload_status({upload_id})`. Wait between checks, stop on ready/failed, and report pending after a bounded wait. This is font preparation, not `get_generation_status`; do not assume it supports `wait`.
- Use the returned `font_id`, never the upload ID. A failed scan/preparation is not permission to bypass validation or upload the font as media.
- `rename_font({font_id,name})` preserves identity. `delete_font({font_id})` only when requested; deletion prevents future use without deleting completed images.

## Generate

Verify `supports_custom_fonts: true` in current `list_models` JSON for the actual image creation/editing model, even if the user named it. GPT Image 2 is initially supported, but do not hardcode the pipeline to that name. Missing capability means unsupported; never silently drop fonts or swap a named model.

Pass up to three ready family IDs as `font_ids` to `generate_image`, `generate_image_edit`, or image-mode `generate_creative_director`. Batch prompts share the selected families. Keep `visual_dna_ids`, exact DNA @names, and project/session bindings as normal.

State exact requested copy in the prompt, unchanged in its original language. The backend infers language and chooses uploaded styles; bold/italic or per-family assignments can be described naturally. Do not require a language selector. Do not promise an unavailable style or unsupported glyphs. Selecting a font alone does not request new text. For edits, specify what typography changes and preserve unrelated existing text.

The backend renders internal specimens. Do NOT render specimens, attach them as `reference_images`, use `upload_media` for fonts, or expose internal specimen URLs. Font files/previews belong to My Fonts, not the media library. Reuse selected IDs from generation metadata, rechecking deleted/unavailable families instead of silently removing them.

Font upload/preparation has no separate credit charge; normal image generation remains billable under the existing approval rules. No automatic paid regeneration to improve typography.

## Making the typeface actually come through

Measured 2026-09-10 by rerunning one customer ad (Hebrew, custom family, three reference
images) across models and settings. The backend renders a specimen and the model IMITATES
it — nothing installs the font — so these are the levers that decide how close it lands.

- **Model choice is the biggest one.** GPT Image 2 reproduced the uploaded letterforms
  clearly better than GPT Image 2.5 Sunburst / Flare, which drift toward a default bold
  Hebrew. Recommend GPT Image 2 whenever the typeface matters.
- **Quality does not compensate.** 2K + `high` on GPT Image 2 beat both 2.5 rows at
  `max`. Do not sell a higher tier as a fix for typography.
- **Weight words in the prompt beat the specimen.** "bold", "medium weight", "very large
  bold headline" read as typeface instructions and usually win — an ad that said bold five
  times came back in a generic sans. Coach the user to describe size, placement, colour and
  glow, and to choose the weight by selecting the uploaded STYLE (Bold / Medium / Light)
  instead of writing it. Keep their exact-copy line ("EXACTLY letter for letter").
- **Busy layouts drift; calm ones do not.** The same font on a simple prompt reproduced
  almost exactly, and on a split-screen ad with three competing references it was ignored.
  Fewer competing reference images and fewer text blocks buy real fidelity.
- **Emoji never block a generation** and are drawn from the platform emoji set; they are
  excluded from the specimen by design. No font carries them.
- **When it must be exact, say so.** For client-final work where the typeface cannot drift,
  generate the layout with the text areas empty and set the type over it. Never promise
  faithful reproduction — the model is imitating a picture of the letters.

## SDK / REST

The account-authenticated server-side SDK exports `createFontClient`: `list`, `get`, `upload(Blob, filename)`, `status`, `rename`, `delete`, `createUploadTicket`, and `grantToApp`. Keep account API keys on the server. The dedicated REST root is `/api/v1/fonts`; multipart upload is POST to that root. App end-user credentials do not grant access to an owner's personal library; use explicit app font grants. Image SDK calls use the same optional `font_ids`.

Availability depends on the installed MCP/SDK and deployed backend versions. Do not describe a local source change as a published release.

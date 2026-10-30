# Widget design principles

Source of truth for every MCP App card. Evidence: Higgsfield widget audit (`research/higgsfield`), Apple-style review of our own cards, and a count of the values already in `src/apps/theme.js` (12 font sizes from 9 to 15 px, 11 border radii, 3 different button shapes). Where this file and the CSS disagree, the CSS is the bug.

## Principles

1. **Media first.** The picture or video is the card. Everything else is a caption.
2. **One canvas.** Generating, finished and failed use the same fixed-height canvas, so the thread never jumps when a result lands. Portrait media floats centred; the sides keep the canvas glow, never black bars.
3. **Quiet by default.** Show the media, one caption line and the actions. Model, size, DNA, template, references and credits sit behind one info button.
4. **One accent.** Kolbo blue `#3b82f6` marks the single primary action and live state. Red marks failure only. Green marks success only. Nothing else is coloured.
5. **One button system.** 36 px pill, 13 px / 600. Variants: primary, secondary, ghost, danger, icon (36 px circle). One primary per view. Same on every widget.
6. **Our own player.** No native video controls anywhere: thick 6 px track, 12 px ringed playhead, readable time, mute, expand. Same bar in single cards, batch tiles and the lightbox.
7. **Stay in the chat.** No logo link, no hidden navigation. "Open in Kolbo" is the only exit, it is explicit, and it opens the exact session.
8. **Never show an id.** Models, voices, DNA and templates appear by name and thumbnail.
9. **References look like what they are.** Tags in a prompt carry the thumbnail of what they point to. A Visual DNA shows its full set, not one face.
10. **No decoration.** No emoji, no glow shadows on buttons, no ETAs or percentages, no counts of tools or models in copy. SVG icons only, 16 px, one stroke weight.
11. **Stable and light.** A card claims its height at first paint. A finished result paints at once from cache. Many cards must not mean many polls.
12. **Works on touch and in both themes.** Hover-only actions show permanently on touch hosts. Every colour comes from a token.

## Token scale (the only allowed values)

| Token | Values |
|---|---|
| Radius | 8 (thumb, input) · 12 (tile) · 20 (canvas, media) · 24 (card) · 999 (pill, circle) |
| Font size | 11 (meta, label) · 12 (secondary) · 13 (body, buttons, spec row) · 15 (card title) |
| Weight | 500 body · 600 emphasis |
| Space | 4 · 8 · 12 · 16 · 24 |
| Icon | 16 px (18 px inside the player) |
| Control height | 36 px (buttons) · 34 px (player buttons) |

## Element checklist

Reviewed one by one in dark theme through headless captures of `npm run gallery` (`?only=<card>&dark=1`). Status is what was seen, not assumed.

| Element | Widget | Status |
|---|---|---|
| Preparing / generating card | generation | done, dark canvas, pill, spec row, 2-line prompt |
| Failed card | generation | done, red glow, light message, pill red |
| Completed image / video | generation | done, canvas takes the request's aspect ratio |
| Video player bar | generation | done |
| Batch / status grid tiles | generation | done, two even columns, one tile shape |
| Unplayable video note | generation | done, quiet button, light text on dark tile |
| Audio rows and waveform | generation, mediaGrid | done, full-width waveform, same skin in every audio player |
| 3D result | generation | done, one Download |
| Media grid tiles + pager | mediaGrid | done, media fits; named tiles keep the caption |
| List rows, project mosaic | list | done |
| Catalog / model picker | catalog | reviewed, no change |
| Credits, plans | credits, plans | reviewed, no change |
| Transcript | transcript | reviewed, uses the shared audio skin |
| Upload, font upload | upload, fontUpload | reviewed, no change |
| Lightbox | html.js | open: still native video controls |
| Visual DNA grid tile (full image set) | mediaGrid | open: list API sends one thumbnail per DNA |
| Open in Kolbo deep link | generation | open: a real session link opens an empty Videos page; needs a fix in kolbo-map |

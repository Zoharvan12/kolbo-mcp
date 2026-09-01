# Thumbnails — YouTube, Shorts, Reels, TikTok covers

Load this file when the user wants a **thumbnail, video cover, first-frame card, or
channel art**: "thumbnail for my video", "YouTube cover", "Shorts cover", "make it
clickable", "higher CTR".

A thumbnail is not a nice image at small size. It is a different craft with a different
success test: **it is judged at ~168px inside a scrolling feed, next to a hundred others.**
Everything below follows from that.

---

## ⚠️ Two things to get right before advising anyone

**1. The metric is watch time, not clicks.** YouTube's own A/B thumbnail test optimises
"for overall watch time over other metrics, like click-through rate." A thumbnail that
wins the click and loses the viewer *loses the test*. This is the mechanical reason the
shock-face era ended. Never promise something the video does not deliver — it is both a
spam-policy violation ("malicious clickbait" names thumbnails explicitly) and a test loss.

**2. Most thumbnail statistics online are fabricated.** This topic is saturated with
AI-generated SEO spam inventing authoritative-looking numbers ("47.3% of creators…",
"9% vs 4% CTR study…", "70% higher CTR for dark thumbnails"). Traced individually, they
have no source. **Do not quote a thumbnail statistic to a user unless it is in this file.**
Everything below is graded: **[A]** real study/primary source · **[A?]** real study, but
its page could not be opened directly — figures corroborated only via secondary quotes,
so treat as directional, not exact · **[B]** credible practitioner claim · **[C]** craft
convention, no data.

Also useful to know: CTR *falling* as a video spreads is normal, not failure — early
impressions come from subscribers, then Browse/Suggested reach cold viewers. Half of all
channels sit between **2% and 10% CTR**. **[A]**

---

## The four layers

### 1. ONE hero subject

A face with one **legible** emotion, or a single object caught mid-action. Crop tight.

**Faces scale with performance.** In a study of 500 breakout videos: 69% used a face,
rising to 75% of the top 100 and **80% of the top 50**. Face occupies about **one third
of the frame** in that top cohort. **[A?]** — the direction (faces matter, and matter more
at the top) is safe; the exact percentages are not verified at source.

**The exaggerated shocked face is dead as a default.** Only ~5% of those breakouts used
an exaggerated expression; 6% of the top 50. MrBeast's team A/B tested ~30 videos
open-mouth vs closed-mouth — **every closed-mouth version produced higher watch time**,
and they changed the channel's house style permanently. **[A]**

So: **a clear face beats a wild face.** Direct the expression to *one* readable emotion —
closed-mouth determination, a genuine restrained smile, focused concentration, real
scepticism. Direct eye contact into the lens, unless the gaze is deliberately pointing at
the subject. Forbid in the prompt: gaping "O" mouth, bulging eyes, strained forehead,
raised chin, any look of discomfort or effort.

**Legibility test:** at 168×94, can someone name the emotion in under a second?

**Faces are not mandatory** — 31% of breakouts had none. If the subject is a tool, an
interface, or a generated frame, the object can be the hero.

Kill on sight: three competing focal points, a floating UI panel over an abstract
gradient, "a person at a desk". If the concept has no surprise, wit, or impossibility in
it, invent harder before generating.

### 2. Separation — luminance first, hue second

**Greyscale test: desaturate the thumbnail. If the subject stops separating from the
background, no palette will save it.** Complementary pairs (orange/teal, blue/orange)
work mostly because they *also* carry a luminance gap.

- **Three dominant colours maximum, text included.** **[B]**
- **Restrain saturation.** The over-saturated HDR/clarity look — "exaggerated vibrancy,
  bright lighting and sharp contrast" — is now documented as the visual signature of
  AI-generated imagery, inherited from advertising imagery in training data. **[A]**
  Push *luminance* contrast hard; keep saturation on one or two accent elements only.
- **Check on both YouTube themes.** The UI is near-white or near-black with red accents.
  A dark vignette that separates your subject in dark mode can vanish in light mode.
  Saturated red as a dominant field reads as UI chrome, not content.
- A single-hue thumbnail is *not* automatically weak — Kurzgesagt and MKBHD ship
  near-monochrome successfully. What fails is a single hue with no luminance separation.

### 3. Text — often none at all

The real distribution among breakout thumbnails: **28% had no text** (the largest single
group), **24% had 1–3 words**, median among those that had any was 5. **[A?]** Over half
carried three words or fewer. The ubiquitous "3–5 bold words" advice describes a minority.

- **Drop text entirely** when the image already states the promise and the title carries
  the specifics. Text is a crutch for a thumbnail that hasn't found its image.
- **Three words maximum** when used. Never repeat the title — the title is right next to
  it. Text should add the *second half* of an idea the image starts.
- Quote the exact words in the prompt: `render only this text: "…"`, and forbid the rest:
  `no other text, no taglines, no watermark, no logo, no captions, no gibberish letters`.
- Heavy-weight sans, one typeface. Cap height ≈ **12–15% of frame height**.
- **Always** an outline, drop shadow, or solid colour block behind it.
- Placement: top third or the side opposite the face. **Never the bottom-right quadrant.**
- Let the subject overlap one letter slightly — instant depth.

Long strings come back mangled from every image model. If words garble twice, generate the
plate **text-free** and set type in the Canvas tool or in HTML — a clean plate plus real
type beats a third mangled attempt. Logos are the same: **image models cannot render a
real brand mark.** Generate the plate without it and composite the actual logo file.

### 4. Platform-safe composition

| Zone | Rule |
|---|---|
| **Bottom-right corner** | Duration chip sits here. Nothing important. |
| **Bottom edge, full width** | Red progress bar on partially-watched videos. Keep critical content ≥40px off the bottom (at 1280×720 scale). |
| **Overall safe area** | Everything load-bearing inside the centre ~1100×620 of a 1280×720 canvas. |
| **9:16 — Shorts/Reels/TikTok** | Must survive a **centre-square crop** (grids and cross-posts crop vertical media to the middle). Keep the top ~15% and bottom ~20% clear of platform UI. |
| **Validate at** | **168×94 px** — the desktop suggested-videos render size. Not 1280×720. |

**File spec (updated — most guides are stale):** YouTube now recommends **3840×2160**,
minimum width 640px, file cap **50 MB** on desktop. Driven by TV overtaking mobile as the
primary US YouTube device in Feb 2025. **Export at 4K; design for 168px.** **[A]**

---

## Model choice

Text fidelity is the constraint. `gpt-image-2` is the strongest for type — use
**quality: medium** (its sweet spot) or high, and it handles **Hebrew** notably better
than the alternatives. `nano-banana-2` is strong on cinematic people but weak on text.
For a text-free plate, either is fine and the cheaper one wins.

**Field result (Aug 2026, head-to-head, same prompt/refs/1K):** `nano-banana-2` beat
`gpt-image-2` on BOTH photorealism (looked like a real studio photo, not a render) and
reference-mark fidelity — and rendered a short Hebrew headline + Latin badge cleanly.
The "weak on text" caveat applies to long/dense copy, not a 3-word headline. When a
thumbnail is a photographic person + short text + referenced logos, run both models
once and pick — do not assume gpt-image-2 wins by default.

Lock the host with a **character Visual DNA** (`workflows/visual-dna.md`) so every
thumbnail in a series is the same person — and check you are using the DNA of the person
*as themselves*, not a costumed character DNA built for a film shoot.

## Kolbo brand-asset kit — reuse these, do not rediscover them

Learned the hard way (Time Machine tutorial thumbnail, Aug 2026): re-deriving logo
files and the right Visual DNA from scratch every session, then patching AI mis-draws
with HTML overlays, is slow and produces a worse result than just generating natively
with the right references from the start. Check this list before generating anything
with a Kolbo or model logo, or with Zohar's likeness, in it.

| Asset | Where | Status |
|---|---|---|
| Kolbo K icon — **THE reference to use** | `Graphics\Logo\kolbo-ai-new-icon-black2.jpg` (white K on black) | ✅ verified real mark. **Always pass THIS file as the generation reference**, never a transparent cutout: the black background gives the model contrast to lock onto and it reproduces the K correctly. Proven tricks that keep the geometry exact fully in-model: (a) print it as a white chest logo on a black t-shirt, (b) render it inside a small dark-navy rounded chip next to a live-typed 'Kolbo.AI' wordmark — both mirror the reference's white-on-dark context |
| Kolbo K icon, clean cutout | `Youtube\מכונת הזמן\Exports\Thumbnail\assets\k-icon-clean.png` | ⚠️ white-on-transparent — fine for HTML/PIL compositing, but as a *generation reference* on a light background it gives zero contrast and the model redraws the K wrong. Use the black-background source above instead |
| Kolbo lockup (K + wordmark) | `Youtube\מכונת הזמן\Exports\Thumbnail\assets\kolbo-lockup.png` | ⚠️ this is the **stacked t-shirt lockup** (K on top, small wordmark below) — do not use for a horizontal corner mark, it misreads or gets redrawn wrong when scaled |
| ByteDance icon | `kolbo-api\assets\Bytedance icon.png` | ❌ **wrong file** — a generic blue bar-chart icon, not ByteDance's real mark. Confirmed by hash, pre-existing bug (not from any recent edit). Filed as `task_f3fab040`. Do not composite this into a "real logo" claim; if a real ByteDance mark is needed, source and verify one first |
| Zohar — real likeness Visual DNA | id `6a64b8fa5bd226f7e763367b`, name **`zohar`** (single token, so `@zohar` binds) | ✅ correct — use this whenever the ask is "me"/"my face" |
| Zohar — costumed character DNA | `@zohar_salon` and similar | ⚠️ these are **film-character** DNAs from specific shoots, not his real likeness — never substitute for a "me presenting" thumbnail |

**DNA naming rule that bit us:** the `@Name` prompt tag only binds if it exactly
matches the DNA's stored `name` field as one token. A DNA named "Zohar (Copy)" can
never bind via `@zohar` — rename the DNA (`update_visual_dna`) once, don't work around
it per-prompt.

## Routing in Kolbo

| Ask | Tool |
|---|---|
| One cover | `generate_image` |
| Several options at once | The in-app **Thumbnail Generator** — fans out 4–8 art-directed variations |
| A batch with a locked character or product | `generate_creative_director` with a Visual DNA |
| Cover for a video the user already made | Never crop a frame out of the video — generate a fresh comp. A film frame is exposed for motion, not for a 168px grid |
| A second aspect ratio (e.g. 9:16 Shorts after a 16:9 main) | **Generate it natively at that aspect ratio**, do not crop/recompose the other one in HTML. Reuse the same brief, DNA, and reference logo files; write a fresh detailed prompt sized for the new canvas |

**Default workflow, one shot:** `generate_image` (or `_edit`) at **`quality: high`**,
native target resolution (1024-class for GPT Image 2), passing every real logo file the
comp needs as `reference_images` plus the matching `@Name`/`#Name` tags in the prompt
text, and the correct Visual DNA id. Ask for **3 concept variations in the same call
batch** per the ladder below rather than iterating one image through many small manual
fixes. Reserve HTML-compositing patches for the rare case a specific mark still comes
back wrong after 2–3 regenerations with references — it is a fallback, not the default
path.

**9:16 safe-zone discipline:** keep the hero content (face, gesture, headline, badge,
logo) inside roughly the **centre 70% of the canvas width**, not edge-to-edge — verified
by the centre-square-crop test below. State this explicitly in the prompt ("generous
margin on both sides, nothing touches the left/right edge") rather than fixing it after
generation.

**Multi-element layout recipe that shipped (Aug 2026, nano-banana-2):** when a comp
carries 4+ graphic elements (headline, badge, app tile, still cards, brand chip), three
prompt clauses turned a cluttered mess into an approved final:
- **Glassmorphism containers** — put every element in its own "frosted translucent
  glass container, soft blur, subtle white border, delicate shadow". Unifies the pile
  into one designed system; solid stickers read as clutter.
- **STRICT NON-OVERLAP RULE** stated as its own sentence — "clear margin between every
  element; nothing touches the face or hair" — models honour it remarkably well.
- **LIKENESS PRIORITY preamble** — face fidelity *drifts as element count grows*. With
  4+ elements, open the prompt with "preserve his EXACT face, identical to the Visual
  DNA identity, do not drift the facial features" or the subject becomes a stranger.
- **Pin each mark to its container** — with two logos in one comp the model WILL swap
  them; write "the tile shows ONLY the [X] mark; NEVER put [Y] on this tile; [Y]
  appears ONLY in the bottom chip". Verify every logo placement on delivery.

## Variation ladder

Vary the **concept**, never the words: bold dynamic · clean minimal · vibrant saturated ·
cinematic wide · close-up dramatic · typography-forward · dark moody · flat illustration.

Make **3 thumbnails and 10 titles** per video, and design them *before* shooting. Top
creators spend ~30% of their effort on packaging versus ~5% for small channels. **[B]**

---

## What now reads as dated or "AI slop"

**Correct the premise first: YouTube has NOT demoted AI thumbnails.** Its synthetic-content
policy explicitly exempts "using generative AI tools to create or improve a video outline,
script, **thumbnail**, title, or infographic." **[A]** Anyone claiming the algorithm
penalises AI thumbnails is repeating a fabrication. The damage is **competitive and
trust-based**, and it is real:

- **The models converge — you disappear into sameness.** 700 generation trajectories
  through image-model feedback loops all collapsed to just **12 dominant motifs**; the
  authors call the result "visual elevator music." **[A]**
- **The gloss is the tell** — see the saturation note above. **[A]**
- **AI faces homogenise.** Diffusion models render same-demographic individuals as
  near-identical across professions. Your AI face looks like everyone's AI face — which
  is exactly why a real Visual DNA built from real photos matters. **[A]**

**Avoid — evidence-backed:** exaggerated open-mouth shock · over-saturated HDR/clarity ·
plastic AI skin · piles of arrows and circles (one or two maximum) · **imagery not
actually in the video** (policy risk *and* it loses the watch-time test) · AI likeness of
real public figures (YouTube likeness detection is live for all YPP creators).

**Avoid — credibility damage in tech/AI niches:** glowing brains, robot-hand-touching-
human-hand, circuit boards, binary code, humanoid robots, the default blue "tech" wash.
Each is sci-fi-derived and misleading about what AI actually is. For a channel whose
credibility *is* the product, these are self-harm.

**Avoid on taste, no data — don't cite numbers for these:** golden particle dust and
bokeh, radial speed lines, neon collage, holographic UI overlays, floating tech icons,
gradient-mesh purple/blue backgrounds, hexagon grids, generic fantasy creatures.

---

## Tech / AI-tool / filmmaking channels

The grammar here is the **opposite** of the MrBeast formula, and that is the point.
Restraint reads as authority: controlled product photography, matte dark grounds, one
accent pulled from the subject itself, minimal or no text, a composed direct-to-camera
expression rather than a reaction. **The absence of arrows and explosions is the brand
signal.** For a channel selling expertise, the thumbnail is a claim about whether you
know what you are talking about.

What works specifically:
- **The tool logo as the recognisable object** — high search intent, heavily used;
  differentiate through treatment (scale, lighting, physical staging), not by dropping it.
- **Before/after** — genuinely strong for AI filmmaking because the transformation *is*
  the promise and it is honest. Skip the arrow; let the two images do the work.
- **The interface as hero** — a real UI cropped tight to one striking element signals
  "actual tutorial, not hype." Under-used.
- **Face + artefact** — face at ~⅓ frame, closed-mouth focused, beside the generated
  frame. Satisfies both the face finding and "show the thing."

---

## Hebrew and RTL

> **No evidence base exists for any of this.** There is no measured data on Hebrew vs
> Latin thumbnail text, Hebrew legibility at 168px, or RTL thumbnail composition. What
> follows is typographic reasoning plus Israeli foundry commentary. For a Hebrew channel
> this is worth settling empirically — ship a text-right/subject-left variant against a
> mirrored one and let YouTube's own test decide.

- **Hebrew has no ascenders or descenders and a uniform x-height.** Latin words have a
  ragged silhouette that aids word-shape recognition at small size; Hebrew words are
  near-rectangular blocks. **Hebrew needs more size, more weight and more letterspacing
  than Latin to hit the same legibility at 168px.** Budget for it. **[C]**
- **Fonts:** **Ploni** (AlefAlefAlef) is purpose-built bilingual — Hebrew plus Latin
  designed to sit together without either overshadowing the other, which is exactly the
  problem when a tool name like `Seedance 2.5` sits inside a Hebrew phrase. **Heebo** and
  **Rubik** are strong free alternatives with real bold weights.
- **Mirror the layout, not the logos.** RTL readers scan a mirrored F-pattern entering
  from the **top-right**, so the natural composition inverts: **text block right, subject
  left**, gaze pointing right-to-left toward the text. Latin brand marks and numerals stay
  LTR regardless. **[B]**
- **Language split:** Hebrew for the emotional/promise word, Latin for the tool name — the
  tool name is the search-intent anchor and the audience already reads it in Latin.
- **Per-language thumbnails exist** but are gated behind multi-language audio tracks: you
  need at least one added audio track before a localised thumbnail can attach to it. **[A]**

---

## Honest limits

Thumbnail design is a craft with weak empirical foundations. A study of 2,400 news
thumbnails across 21 visual features found **few statistically significant correlations
with engagement at all** **[A]**. The breakout data above describes what winning
thumbnails *look like*, not what *caused* the win. Genuinely unsettled: rule-of-thirds vs
centred (no data either way), and saturation levels (creator orthodoxy vs the aesthetics
literature). Do not present either as settled.

A/B testing needs ~10k impressions per variant to mean anything. Below that, just replace
the thumbnail outright.

---

## Checklist

- [ ] One idea, nameable in under a second at 168×94
- [ ] Face ~⅓ of frame, **one legible emotion, closed-mouth**, eye contact
- [ ] Greyscale test: subject still separates
- [ ] ≤3 colours, restrained saturation, checked on light *and* dark themes
- [ ] 0–3 words, outlined, ~12–15% frame height, off the face, never bottom-right
- [ ] Nothing in the bottom-right quadrant or bottom 40px
- [ ] Real logos composited from files, never model-rendered
- [ ] Nothing in the image that isn't in the video
- [ ] Exported 3840×2160; verified at 168×94 (and centre-cropped first, for 9:16)

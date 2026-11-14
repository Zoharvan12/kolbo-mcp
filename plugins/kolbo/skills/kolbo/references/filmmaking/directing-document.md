# Directing Document: the narrative-film prompt that wins

Evidence (2026-11-02): frame-matched, prompt-by-prompt study of five award-level open-source AI films: The Tortoise and the Hare (contest winner), Listen to Meh (1st place), Red Flag, CUPID (action contest), Oneiric.

Load this file for any narrative film, drama, dialogue scene or story short on **Seedance 2.0 / 2.5** (the films used 2.5 and 2.0). It extends the Locked Intro in `models/seedance.md` / `models/seedance25.md`; it does not replace it. For other models read "Model scope" below first.

## 1. Production process (supersedes "one short call per beat")

- **Write one prompt per scene segment, 15-30 s, multi-shot.** It is master coverage, mined in the edit. Selection by requested length: Tortoise 4 s takes 0/28 used, 5-8 s 9%, 10-17 s 16%, 20-30 s 33%; Red Flag 25-30 s 16/78 vs 4-7 s 12/898. Only about 20% of a used take reaches the film, and one take often supplies 2-3 shots. Used takes carry about 3-9 internal hard cuts, not 15-30.
- **One take per prompt (Zohar, 2026-11-02).** Generate each scene prompt once, at `480p-draft` (`draft: true`), never 720p or 1080p for a test. If the take fails, diagnose the cause, rewrite the prompt and generate once again. Never two generations of the same unchanged prompt. Finalize (`draft_enhance`) only the take Zohar picked. *Observed, not our practice:* Red Flag rolled each prompt version about 8 times (1,552 takes from about 200 prompts, mostly 720p) and picked; one shot rolled 67 times. We put that effort into the prompt instead.
- **Observed selection rates** (films that rolled many times; not our practice): 3% (Red Flag), 7% (Listen to Meh), 14% (CUPID), 16% (Tortoise) of takes reached the film.
- **Density matters more than length.** Median prompt: Tortoise 6,500 characters (used takes about 11,000), Listen to Meh 4,700 (used about 6,300), Red Flag about 2,400 in Chinese (used about 3,500, denser per character). Tortoise wrote about 680 characters per second of video; our failed films wrote about 250. A 15-30 s scene typically needs 6,000-11,000 characters. Long thin prompts with 15+ shots still fail (our 17 shots / 30 s calls): add depth per shot, not more shots.
- **Seedance is also a sound engine:** takes generated only for their audio (an unseen monster voice, whispers multiplying 1 → hundreds) laid under other picture (Tortoise).
- **Kolbo rules stay in force:** no music unless asked; no famous names or IP; exact `@DNA` tags in CAST and every shot; Hebrew only as Latin transliteration; Kolbo's own productions pass Visual DNAs + prompt + `@Audio` only, never storyboard or video frames as references (production-director A17). The films used turnaround sheets + an environment plate as refs, never storyboard frames, which agrees with that rule.

## 2. The document (map onto the Locked Intro)

Keep the Seedance header and footer lines (`N connected cinematic shots, Xs total, AR, Multishot ON`, `Total: Xs / N shots / AR`, summing SHOT timecodes). Inside, write the scene as a directing document:

```
N connected cinematic shots, Xs total, AR, Multishot ON
Total: Xs / N shots / AR

[FILM STYLE — LOCKED, IDENTICAL IN EVERY CALL OF THE FILM]      (= GLOBAL LOOK)
  Identity first: every face is the same person as its reference (bone structure, eye spacing,
    nose bridge, jaw, skin, age, hair). If any instruction would pull a face away, drop that instruction.
  Camera/film: stock, lens family, bokeh shape, "no star or ray flares".
  Camera grammar: "every change of shot size is a HARD CUT to another real camera position; never push, pull or zoom."
  Signature handheld if wanted, concrete: "documentary shoulder-mount, horizon tilted 3-6°, the frame breathes;
    calm = breathing drift; action = one jolt per impact."
  Light law: motivated sources only, contrast ratio, "underexpose rather than over", no flat fill.
  Colour law: 60:30:10 dominant / secondary / accent, plus one white balance per scene (e.g. WB 5600K).
  Materials/skin: pores, sweat, wet is wet; "exaggeration only in rhythm, never in materials".
  Acting law: "don't act the emotion, act carrying out the tactic; the drama is in the eyes; the gaze is always
    doing a task, never a blank stare; natural blinks; micro-pauses before reactions; visible breath."
  Physics law: mass has weight, correct contact shadows, no floating props.
  Composition: "every person moving from frame one."
  Sound law: diegetic only (+ the one motif source), no score, no subtitles.
  Global FORBIDDEN list (section 4).

[REFERENCES — BY PRIORITY]      (= CAST + reference role lines)
  @tag: what it is + how to use it + what to ignore in it
  ("ignore the cigarette in this reference", "style reference only, not a keyframe", "only for the insert shot").

[SCENE]  what just happened; where this segment starts and ends ("starts the instant he hits the floor; never show the kitchen again").

[START STATE]   (MANDATORY from call 2 on — Last Call v2, 2026-11-02)
  The exact end state of the previous call, element by element: each person's position in the room
  and screen side, wardrobe ("Eli in a black t-shirt, NO coat"), each prop's place and design
  ("his coat folded over the matte red open-face helmet and the matte black open-face helmet on the bike seat"),
  wounds ("Eli's lower lip split, a drop of blood"), who is down and how ("lying flat, not propped up").
  Everyone the next beat needs is already in frame in shot ①; the first shot keeps the last call's axis.

[BLOCKING]      (= LOCATION + LOCATION MAP + CONTINUITY)
  Exact body geography in screen directions: who stands where, which way heads and feet point ("head toward the hall,
  feet toward the kitchen, never reversed"), who never moves their feet, where each hidden prop is and where it is NOT.
  "Only these N people are in the scene."

[ACTION]  timecoded beats with physical detail AND the inner beat:
  0:00-0:02.5 "his gaze climbs to the shelf; the trophies enter his view; his breath stops half a beat; pain gives way to a quiet understanding."

[CAMERA]  "N shots, M real camera positions": ① ... ⑨, each with framing and its reason
  ("static, calm, matching the newfound calm"); mark the one special shot ("the only time she looks into the lens").
  Then the SHOT n — 0:00-0:0X headings carry each shot.

[ACTING TASK]  per character (see acting-direction.md "Proven prompt recipe"): WANT / STAKES / OBSTACLE / TACTIC,
  one sentence of truth ("She is not angry; she just ends it."), then moment by moment for each line.

[EYELINES]  one line per dialogue single (MANDATORY): "she looks at Eli, frame-left of the lens, never into the lens".
  The acting law alone did not hold it: 5 of 13 dialogue singles in Last Call v2 played to the lens.

[DIALOGUE]  timed slots including silences; language; delivery; "lips closed when not speaking".

[LIGHT]  sources, levels, hex colours for key zones, how the light changes as people move through it
  ("his light turns from red to green because he walks through the zones, not because a lamp changes").

[SOUND]  the ordered list of diegetic events; "No music. No musical score." + the section-4 music line.

[PHYSICAL LOCKS]
  Scale ruler: "the railing is 110 cm, he is 185 cm: its top sits just above his belt."
  Object physics: "the door opens outward, hinge left; the tiger is painted only on the outside face."
  Plausible reactions: "the bouquet is light; it cannot knock him back; he steps back from surprise, two steps, heel first."

[FORBIDDEN — THIS SEGMENT]  the specific failures this shot invites (a third person; him standing; any wound).

POSITIVE LOCKS: the 4-6 things that must be true at the end + the FINAL IMAGE of the take.
Total: Xs / N shots / AR
```

Omit a block only when it has nothing true to say. Keep the FILM STYLE block byte-identical across every call of a film (Listen to Meh opened all 618 takes with the same 12-line law).

## 3. Proven moves inside the document

- **0.3 s geography anchor (Oneiric):** `SEGMENT 1 — MASTER (0.0-0.3 s)`: a wide establishing frame with everyone in place, then `HARD CUT` to the real shot. Cuts in the edit; locks positions cheaply. Use it instead of a previous take's frame. **Limit (Last Call v2 S1):** in a packed, dark room it rendered 3 s long with a crowd dancing in sync, and the leads could not be found. Zohar: "we don't see Anastasia or Eli… maybe don't show it at all". Use it only in sparse, lit rooms where each lead has a lit, named place.
- **Beat order first (Tortoise, 232/366 prompts):** a progression chain with arrows before the detail: `BACKS OF RABBITS WALKING → BLUE SENSES SOMETHING → BLUE STOPS → ...`.
- **Frame by purpose, not millimetres** (Tortoise used mm in 6/366 prompts): "their shoulders frame the foreground; this makes the image read as: THE RABBITS ARE LOOKING AT THIS."
- **Depth layers named:** PRIMARY / SECONDARY / BACKGROUND, "background slightly out of focus, noticed only after the main action".
- **Timed visual progressions as countdowns:** "WIDE GOLD → NARROW GOLD → THIN STRIP → HAIR-THIN LINE → DARKNESS"; door gap at 0.0 / 2.0 / 4.0 / 5.5 s.
- **POV defined physically:** "the camera is her eyes, 148 cm high, slightly looking up at him."
- **Withhold faces, then reveal:** backs, hands, feet and inserts first.
- **One saturated hue reserved for the story's key element** (CUPID magenta, Tortoise gold seam).

## 4. Where Seedance drifts, and the forbid wording that held

Counted across 2,536 video prompts of the five films. Paste the matching lines; these are model defaults, so they need to be forbidden in every call where they could appear.

| Default the model drifts to | Forbid wording (copy) |
|---|---|
| Background music, drones, bass hits, stings | "ABSOLUTELY NO BGM. ZERO MUSIC. NO SCORE. NO MUSICAL DRONE. NO PERCUSSION. NO BASS HIT. NO HORROR STING." (Tortoise: 238/366 prompts) |
| Invented dialogue, lip movement, subtitles, text, watermarks | "No dialogue, no lip movement, no subtitles, no text, no watermark"; with lines: "only the quoted lines are spoken" |
| Added camera moves | "no push-in, no pull-out, no zoom, no dolly, no tracking, no rack focus — breathing drift only" (Red Flag 103×) |
| Slow motion, ramps, smear frames | "NO slow-motion anywhere, no speed ramping, no smear" |
| Cartoon proportions, plastic skin, identity drift, eye glow | "no cartoon proportions, no plastic skin, no identity drift, no eye glow" (Listen to Meh 123×) |
| Weightless physics | "no floating props, no floating hands, no weightless props, no teleporting" |
| A fight turned into a back-and-forth | "no grappling exchange — one instant chain: she hurls..."; "no arm-capture, no coil, no blocks, no punches, no back-and-forth" |
| Overacting | "no wide eyes, no gasp, no head snap, no playing to camera" |
| Flat studio light, spotlight circles | "no fill, no studio key, no light source moving with her; no directional beams, no light pools on the floor" |
| Frozen poses, stutter | "no held poses, no freezing mid-action, no stutter, no choppy motion" |
| Empty opening frame, delayed entrance | "no empty establishing frame, no delayed reveal"; "every person moving from frame one" |
| State leaking from other scenes | per-scene negatives: "no sheep anywhere in frame", "no rain yet: ground dry", "no sky in frame" |
| Genre clichés | "no portal, no gateway, no magical aura, no explosion, no symmetry" |
| Wrong reaction to a light hit | write the cause's physics and the plausible reaction (Physical locks) |

Two limits from our own projects stay true: never put a character's name in the same sentence as a forbidden prop or role (Dad 'n Me ATV), and for an object that keeps rendering wrong, the positive sentence that worked beats naming the wrong shape (Bubble Trouble halves). Forbid model **defaults and behaviours**; describe wanted **objects** positively.

## 5. Elide what the model cannot do

Red Flag never shows its fight: grab → hard cut → he is already on the floor + an insert of the trophies ("World Champion") + off-screen thuds and crashing trophies, while the radio song plays on. A fight told by aftermath, inserts and sound beats a fight that looks fake. Default for multi-body violence on Seedance: cause → cut → aftermath + off-screen sound + one story insert.

**When the fight is the payoff (Last Call v2, Zohar 2026-11-02):** a fight shown in medium wides read as "pretty stupid". A small shove threw a man into a dumpster; a bottle broke on an arm and nobody reacted. When the fight must be shown, build it from a few signature moves, each with its own coverage:
- the threat gets an insert (a medium close-up from the waist as the switchblade opens, then an over-the-shoulder);
- the hero's move is one mechanism with a cause (take the bottle, twist the arm, release, hit);
- the hit gets a close-up, in slow motion if Zohar asks for it (this one beat may break the film-wide slow-motion ban);
- the victim's reaction matches the force, and he stays down, finished.

## 8. Last Call v2 evidence: what the document still has to carry (2026-11-02)

Six calls, 31 shots, all reviewed shot by shot (`Youtube/global-channel/v2-last-shift/film_lastcall_v2/SHOT_QC.md`) and given 37 notes by Zohar (`REVIEW_v2_NOTES.md`; catalog section I).
- **What held:** every scripted line was word-exact and in its slot; no music; DNA faces in S2–S6; the colour and light laws; the diegetic club bass.
- **What failed, and the block that now carries it:**
  - Escalation with no reason (he grabs her wrist when she did nothing; "Outside." straight away) → the **script gate** below.
  - Prop and wardrobe resets between calls (the coat back on, helmets on the dumpster, a bare bike seat) → **[START STATE]**.
  - Lines delivered into the lens → **[EYELINES]**.
  - The gang behind the bar; Eli at a different stool → **[BLOCKING]** plus a per-location blocking map. Zohar asked for a blocking image; it goes in as a location DNA plate, never as a frame.
  - Helmet design drift (open-face → full-face, matte → glossy, red → black) → one fixed descriptor per prop, pasted byte-identical into every call, plus a prop DNA for anything that recurs.
  - The location DNA leaking a dusk sky, a teal car and a second lot → every exterior: "black night sky, no horizon glow, no cars, the same wall, door and lamp as before".
  - A mirror shot made three copies of Eli → no mirrors or reflective walls behind a lead.
  - Crowd speaking real words and dancing in sync → "a wordless crowd roar, no intelligible words in any language; every dancer moves to their own rhythm, nobody in sync".
  - A bartender stacking micro-actions → one simple, true task per shot.
  - Holds running long (4 notes) → shot length set by information (below).
- **Script gate (before any prompt).** For every beat, answer "why does this happen now?" with something the viewer saw. The antagonist wants something concrete and is refused first (her number, when she finishes). Threats escalate in 2–3 steps, never one line to "Outside". Catalog F1/F2 already said this; v2 broke it again because no step enforced it.
- **Shot length by information, not by the call's duration.** Cut when the shot's last new information lands; reaction holds about 2 s. Write the call only as long as its beats need. Zohar wants the film shorter and cheaper, so a 25 s call carrying 12 s of beats is waste.
- **Cost:** the 480p-draft runs about 23 cr/s (S2–S6: 2,714 cr for 118 s).

## 6. Model scope (do not apply blindly)

| Model | What transfers |
|---|---|
| Seedance 2.5 / 2.0 | Everything here (all evidence is Seedance). |
| Kling-based Cinema Studio (CUPID) | Image-first: every video starts from a designed `start_image` + 2 refs; `Use the provided image as the exact opening visual reference` → shot type → SUBJECT / ACTION / CAMERA / LIGHTING / ENVIRONMENT / PHYSICS / STYLE → a fixed negative list (no morphing, flicker, face distortion, identity/outfit change, warped anatomy, extra limbs, rubbery motion, teleporting, broken physics, CGI look, melting objects, duplicates); median about 2,400 characters. Start frames are right for this route and wrong for our Seedance route. |
| Wan 3.0 Elements | Same Locked Intro and Kolbo cap (about 20,000 characters, verify live). Acting task, timed dialogue slots, lips closed, physical locks and the forbid table are untested on Wan 3; use them, then verify on frames. Talking avatars keep `workflows/talking-avatar-wan3.md` (one take of 10 s or less per environment). |
| Veo 3 / 3.1 | Clips are short (no 15-30 s masters) and Veo prefers positive phrasing; transfer the acting task, timed dialogue with silences, sound list, physical locks and elision; keep heavy NO-lists short. Untested on Veo. |

## 7. Superseded guidance (with the reason)

- "One short 4-8 s call per beat" (old F35 and similar): long multi-shot takes were selected 2-4× more often in every film; short calls caused Last Call's continuity resets.
- "Positive phrasing only" as a universal law: the winners carried a median of 10 targeted DO NOT lines per prompt; keep positive phrasing for objects and the name-next-to-forbidden-prop limit (section 4).
- "Lens in degrees/mm in every shot": the winners described the frame by its purpose; numbers stay useful for scale, distance and timing.
- "Grab a frame of the previous take as the next part's reference": replaced by the 0.3 s master inside the same take and by longer takes (and it breaks A17 in Kolbo's own productions).

## Repair rounds that worked and failed (Last Call v5, 2026-11-03)
- **Short repair calls are fine when they restate state.** 2-6 shots, 6-14 s, with [START STATE], who lies where, wardrobe, and props per shot: 26 of 32 shots passed. This refines the note above about "short calls cause continuity resets": the resets came from calls with no restated state.
- **Never write "wide" in a crowd location.** In the club, every "wide" or "three-shot" came back as a dark master of the whole room (3 times). Write "waist-up three-shot at the bar", with each person's place and what they hold.
- **Restate wardrobe in every shot.** A jacket and bag worn in call R7 vanished in R8 when they were only in [START STATE].
- **What worked as written:**
  - an off-screen line over the listener's close-up ("she speaks off-screen; his lips stay closed");
  - "X-RAY VFX overlay on his real face in the same shot" between two crash zooms;
  - "brown glass bottle, golden beer; the body bursts; only the jagged neck stays in his fist";
  - a rack focus over a shoulder;
  - "the bike rides out along the wall, a metre clear of every man";
  - "pulls the tap handle; beer flows from the tap into the glass".
- **Falls still exit the bottom of the frame** despite "lands in frame". Frame the landing ("feet and asphalt in frame"), or plan to trim.

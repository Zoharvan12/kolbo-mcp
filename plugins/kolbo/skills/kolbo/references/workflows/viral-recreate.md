# Viral Recreate — Rebuild a Viral Reel's Format With Kolbo

The user gives a viral reel (a link or a file) and wants "a video like this". Recreate its **format** (the repeatable decisions: hook, gag, pacing, camera, look, sound, ending) with new characters, places and jokes. Never copy the clip itself.

Load with this file: [seedance-2-5.md](references/models/seedance25.md), [seedance25-craft.md](references/filmmaking/seedance25-craft.md), [video-investigation.md](references/workflows/video-investigation.md) and [visual-dna.md](references/workflows/visual-dna.md).

## Hard rules

- **Story before technique.** No formula, contract or prompt until every beat has a story line and the user confirmed the tell-back (step 2).
- **Contract before prompt.** Every paid take has a written concept contract (step 4). Never drop a contract element to make a prompt "safer". Missing elements are the most common reason a take is "nothing like the concept".
- **QC is blind and against the contract**, never against your own prompt. A wrong prompt passes a self-check every time.
- **Never feed the reference clip into a generation.** The reel is study material only: decode it with frames, measurements and analysis, then write what you learned as staging, light and motion text. Reference videos in a generation may only be the user's own or licensed footage.
- **Invented people only.** Character faces are invented, never a real actor, creator or public figure. Recognisable roles come from costume, hair, colour and one prop.
- **No famous names in prompts.** No studio, franchise, character, celebrity or brand-campaign names in any prompt (see the Seedance 2.5 rules). Real products the user names come from real product photos (step 5).
- **The supplied media is the evidence.** Articles and summaries only help locate things. Measure every reference before writing the formula.
- **Paid steps need the user's go with the credit cost stated.** Download, inspection, frames and cut detection are free; clip analysis and transcription bill usage.
- **Fire one take first.** Prove one beat before batching (step 6).
- **Format rules don't travel between formats.** Two formats can make opposite choices (step 3). Never copy one format's decisions into another.

## 1. Measure

1. Bring the reel into Kolbo: `download_media_from_url` for a public link (check progress with `get_download_status`); `upload_media` or `create_upload_ticket` for a local file. With several references, bring in and measure **every** one before writing anything.
2. `prepare_video_inspection` on the reel URL, then `get_video_inspection` until it is ready.
3. Map it:
   - `inspect_video` kind `frames` across the whole reel, then denser frames per beat (4 fps or more where actions are quick).
   - kind `cuts` for cut candidates. Verify each against nearby frames: flashes, explosions and fire add false cuts; whips and dissolves hide real ones.
   - kind `audio_levels` for loudness and silences.
4. Write a shot table: start, end, length per shot, average and longest shot, total length, aspect, loudness.
5. Sound: kind `audio` then `transcribe_audio` (or `transcribe_extracted_clip`) for speech and audio events. Music-only reels give little text: describe the track instead (genre, instruments, tempo, energy, whether cuts land on its hits, whether the reel's own audio or a trend track carries it).
6. **Classify the music: `added track` or `generator bed`.** AI-made reels often carry a faint music bed that the video model baked into the take. Signs of a generator bed: the reel's metadata names no track or artist, the bed is low and generic, and it never hits the cuts. Audio analysis and a stem split both "hear music" either way, so neither settles it; decide from those signs and confirm with the user before any music spend. A generator bed means the recreation needs no music. Write the class into the formula.
7. Per beat, extract kind `clip` and call `analyze_extracted_clip` focus `video` with a **neutral** question ("Describe who is in frame, what each person does in order, where the camera is and how it moves, and the light"). Never put your own reading into the question; the witness must be blind. It misses small things (hands below frame, speech under music), so check every claim against frames.
8. Count the real beats. A beat is a story event, not a cut. One beat can span several cuts.

Automated analysis is a lead, not a fact. A claim needs a frame time.

## 2. Read the story, then tell it back

1. **Creative read first.** Two sentences before anything technical: the illusion the reel sells ("someone really filmed this at a party") and why people share it. Every later choice serves that illusion.
2. **Story line per beat**, as a stranger would retell it:
   - who wants, wins or loses what;
   - what happens;
   - what is hidden (an off-screen cause, someone who left frame);
   - how it is revealed (a pan, a cut on impact, a wide);
   - the payoff.
   If a line could describe a different joke, it is an action list; re-read the frames. Never add structure (reveals, twists) the frames don't show.
3. **Who notices whom.** For every beat, write why the camera is where it is. The filmer can be a character, and being caught filming can be the gag.
4. **Tell-back check.** Show the user the beat chain in 3–5 short lines and wait for their "yes". Misreading a beat is the most expensive mistake in this workflow: every take built on it is wasted.

## 3. Formula and format decisions

Write the formula as numbered rules, each with its evidence (reel + time, a measured number, or the user's words):

- **Hook:** what is on screen at 0.0 s, already moving, and why it stops the scroll. Frame one is the most extreme, most recognisable thing.
- **Gag mechanic** per beat: setup, action, payoff, aftermath, and who owns which prop.
- **Pacing:** shots, average shot, acceleration, how cuts sit on the music.
- **Look:** medium (phone, camcorder, CCTV, film), light source, colour, era.
- **Ending:** last image, any call to action.
- **Subject test:** is the subject recognised in half a second?

Then the **format decisions block**. These decisions have no defaults; formats that look alike make opposite choices. State each one with its evidence:

| Decision | This format | Evidence |
|---|---|---|
| Shots per take (1 continuous, or N cuts inside a beat) | | |
| Do bystanders react to the gag? | | |
| Operator role (hidden observer, friend, crew member inside the action) | | |
| Who looks into the lens, and when | | |
| Extras per shot, and what each does | | |
| Zoom (in-camera moves with time and size, or none) | | |
| Audio in takes (diegetic only, dialogue, sirens) | | |
| Where the music comes from in the posted reel | | |

**Two anonymised examples** of how far these can differ:

- *Impossible found footage* (a past era filmed on a 1990s camcorder, one modern object per beat): 1 continuous shot per beat; bystanders never react, it is an ordinary day for them; a hidden observer who is never seen; nobody looks into the lens; busy extras, each with an ordinary task; one quick in-camera zoom per beat; diegetic sound only, no words.
- *Crime-spree reel* (costumed characters on a chaotic spree, filmed by a crew member running with them): 2–3 cuts and whip pans inside a take; bystanders react normally (duck, run, call for help); the operator is inside the action; only the final booking-photo beat looks into the lens; busy extras (tellers, guards, shoppers); zoom only in camera, never added in the edit; diegetic sound plus sirens.

Ask the user any open decisions (subject, aspect, length, budget) in one round.

## 4. Concept contract per shot

Before each prompt, write a contract with one line per element:

- on-screen text (spelled out);
- every person in frame and their action (hero and each extra);
- the location (and its location image);
- operator position and move;
- the gag;
- the payoff frame;
- every character's state at frame 0 (asleep or awake, standing or seated, who holds what). Without it Seedance starts mid-action;
- every contact action pinned to its exact target, with the wrong target named: "kisses the middle of her cheek, high on the cheekbone, well away from the mouth". "Kisses her cheek" produced a kiss on the mouth.

Each contract line maps to a prompt line. Compile the prompt with the block shape in [seedance25-craft.md](references/filmmaking/seedance25-craft.md): the camera written as a person, a populated world, about 1 s per action, real sounds only, an AVOID list that holds behaviours.

## 5. Build assets

- **Characters:** invented faces only. Generate a face batch, let the user pick, then a character sheet; store each recurring person as a Visual DNA (`create_visual_dna`, see [visual-dna.md](references/workflows/visual-dna.md)). Read every DNA description back and check the sheet for invented text.
- **A sheet must agree with itself.** Check every view for one hairstyle and one outfit before any take. A sheet that showed a bun in some views and loose hair in others made the hair flip between takes and even mid-shot. Fix or regenerate the sheet; never hope the prompt overrides it.
- **Locations:** one **empty** location image per beat, from the spot where the shot starts, with no people, in the reel's aspect. Use Seedream 5.5 text-to-image at 2K (confirm the current Seedream id in `list_models`). Edit it only with the matching Seedream edit model. Seedream shrinks small story props, so ask for them large. Attach it as a reference image with a role line, never as the start frame. A location described only in words drifts between takes.
- **Real products:** when the user names a real product, use real product photos (the official product page or press kit, clean product shots only; screenshots with fine print leak text into the video). Build a product DNA from them. A generic look-alike reads as fake.
- **No app screens as the gag.** Models can't render a real app interface. Show the physical product instead, and don't repeat one prop motif across beats.
- **Famous designs get blocked after the render.** Seedance's output filter blocks the most famous character designs after the take renders (0 credits, but the time is lost). Frontal shots of famous animated characters and their canon sidekicks block most often. Before writing a whole episode around a famous look, fire one test take. When it blocks, keep a generic look: go wider, into action or from behind, drop any canon names, and use a generic person with a clear role (a guard, a florist). Never put a blocked character's name back in a prompt.

## 6. Make the takes

1. `create_project` for the piece; keep every id in a production log.
2. Quote the cost: `list_models` for live rates, then state the total. Seedance 2.5 Draft is billed per second. **Budget one retake per take.** Measured baseline on a new format: first takes passed 72% of contract lines but 0 of 2 whole takes; after one targeted retake each, every story line passed.
3. Generate with `generate_elements`, `model: "seedance-2-5"`, `draft: true` (480p Draft), the DNA ids, `project_id` and `duration` equal to the prompt's total.
4. **Fire one take first.** Wait for it (`get_generation_status`), QC it (step 7), show it to the user. Only then fire the rest. Untested batches multiply the same mistake.
5. Then the rest, one beat per take. Put several shots in one generation only when the action continues across the cut.
6. Stay at 480p Draft until the user approves the cut. Finals: `video_tools` `draft_quote` on the approved draft, then `draft_enhance` only after the user approves that cost.

## 7. Blind QC against the contract

Run this on every take before the user sees it:

1. **Stranger read first.** From the frames only, before looking at the contract, write what happens in the take. If it doesn't match the story line, the take fails.
2. **Blind check.** A fresh reviewer (a subagent if available, otherwise a separate pass) gets the contract, a 4–6 fps frame strip, full-resolution frames and one reference frame. It never sees the prompt. It marks every contract line PASS or FAIL. A take passes only when every line passes.
3. **Prop in every frame.** Every prop must appear in every strip tile from its first appearance to the end. A prop that vanishes or morphs fails the take.
4. **Checks:** cut count and camera motion against the reference beat; the gag reads at phone size; cause and effect in one frame; no burned-in text or captions; no music in the take; nobody looks into the lens unless the format says so; extras are moving.

The blind reviewer is the gate, not your own read. In the measured run, the producer's stranger read caught one defect but missed a frame-0 defect (a character awake when the contract said asleep); the blind reviewer caught both.

Never call a take "works" and recommend locking it on your own read. Show only takes that pass; share them for review (see [review-collections.md](references/workflows/review-collections.md)).

**Fixing a note:** fix the unclear beat; don't swap it for a new idea. Make a weak action bigger and clearer, never safer. Keep the prompt text that produced approved beats word for word. Keep rejected and spare takes in an "unused" reel grouped by beat; never put a rejected take back into a cut because its retake failed: drop the beat or reshoot it generic.

## 8. Edit and deliver

- Cut from the measurements: hook length, average shot, beat order. Enter late, exit early, hard cuts, real time. Order beats by escalation and end on the biggest laugh.
- Any zoom happens in the take, never as a crop or scale in the edit.
- Grain, tape or VHS texture goes on as a post filter.
- Music goes in the edit, not the takes. Use music the user has the rights to on every platform they post to.
- **Music follows the class from step 1.** A `generator bed` reference: no music; deliver take audio only. An `added track` reference: make an instrumental with `generate_music` from the decoded genre, instruments and tempo. Don't fall back to generic stock music for a viral cut; it reads as an ad. For the closest match:
  - split the reference with `separate_audio_stems` (mode `full`), then either `cover_music` of its music stem (it can return 2+ minutes, so trim the opening) or `generate_music` on Suno V6 with the stem in `reference_audios`;
  - `cover_music` needs the user to confirm they hold the rights to the source. A third-party reel's track is not theirs, so ask before covering it and never set that confirmation on their behalf.
- **Mix the music low under voices:** about 18–22 dB under the dialogue, EQ'd out of the voice band (cut roughly 1–4 kHz, high-pass the lows).
- **Post the same music cut on every platform.** A version stripped to take audio for some platforms loses the timing the reel was cut to. If one platform needs different music for rights reasons, re-cut to that track rather than posting silence under the original edit.
- Deliver at the reel's aspect, without burned-in text unless the format uses captions, and give the user the review link for the final cut.
- After the user posts, compare their posted edit with your finals (hook length, what they dropped, the last image) and fold the differences into the formula for the next episode.

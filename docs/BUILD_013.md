# Build 0.13: the night (story, intruder, power, fuse box, phone, hunt, endings, menus)

This is Claude's continuation of 0.12, on `claude/pensive-volta-et0etl`. The owner asked for the following on 2026-10-24:

1. **An environment bug pass.** The example given: with every light off, there was still a strange light in the living
   room and the bedroom.
2. **A real game, AAA.** This covered:
   - The glass that breaks 3 s after the fridge shuts must be heard wherever the player is (it was inaudible).
   - Slowly built tension, smart dialogue and creative jump scares.
   - A silhouette far away in the dark.
   - Later, the feeling of an intruder who can kill you by surprise.
   - The question "intruder, or still dreaming?", in a plausible reality.
   - 10–15 minutes for a smart player, with high replay value.
   - Every asset downloaded and AAA ("do not do assets on your own").
   - The story thought through and double-checked with agents.
   - Gameplay, graphics, lighting, sounds and menus all AAA, and production ready.
3. **The intruder.** Mid-task the owner added: "Scream"-like, someone in a mask and creepy clothes, very scary.
4. **Publishing.** Publish straight to `main`, update the claude.ai artifact, and leave a hand-off for any AI that continues.

The design is [STORY.md](STORY.md): the truth, the space, Acts I–IV with triggers and fallbacks, the endings, the
evidence and the replay variations. It was reviewed by two agents (a horror-design critic and a logic/plausibility
checker) and revised: the truth table holds, every beat has a fallback, and nothing depends on the player finding one
thing.

## 1. The stray light (bug pass)

On **WebGPU**, the bounce/reflection probes never updated after start-up, so the rooms kept the light they had while
loading.

- **Cause:** the cross-fade pass (`AtlasBlend`, probes.js) declared its uniforms, textures and varyings on a single
  line. PlayCanvas's WGSL preprocessor reads those declarations line by line, so WebGPU bound no textures and the pass
  wrote zeros, then nothing.
- **Fix:** one declaration per line. A comment there, and a Gotcha in HANDOFF.md, keep it that way.
- **Check:** read back from the GPU, the living room's probe level with every light off went from 0.0631 to 0.00007.
  The "all lights off" renders are dark on both WebGL and WebGPU (`build-013/stray-light-webgpu.png`).
- The new WGSL shader (the camera's infrared pass) follows the same rule.

## 2. The story and its systems

One system per file, each opening with a comment on what it does.

| File | What it is |
| --- | --- |
| `story.js` | The story controller. Flags and play-time timers. Every beat in order, each with its fallbacks. Checkpoints, one per act, saved in the browser (`horror.save.v1`). The run's variations: where the spare key is (`SPARE_KEY`), and the nuisance circuit. |
| `story-events.js` | `STORY_EVENTS` in story order (the developer menu's Events list plays each one): the falling glass, the locked bathroom, the cut, the silhouette, power back, the tap, the nest, the alerts, LIVE, the hunt, caught, and the four endings. |
| `power.js` | The flat's electricity: main switch, RCD, seven breakers. A light works when its circuit is live. Cuts cascade out from the fault; restores stutter back on. `tools/check-power.mjs` covers it. |
| `fusebox.js` | The consumer unit at the corridor's west end (downloaded, below): its own levers move, the cover swings open, and a handwritten label is taped inside the cover. |
| `world.js` | What the story leaves in the flat: the shards and spill by the bed; the bathroom (locked with the tap running, later open, flooded, steamed up, the mirror wiped at a head height above yours, your hair-dryer in the basin); his wet prints in the corridor; the papers (the notice, the pills, the diary); the spare key's three hiding places; the empty key bowl; the alarm clock. |
| `nest.js` | His nest behind the right wardrobe door, the hatch above it, the dust and the drop of water. |
| `intruder.js`, `stalker.js`, `navgrid.js`, `zones.js`, `hunt.js` | The man: his body, animation and phone torch. His mind: patrol, alert, investigate, search, chase, kill, ambush, backstage, with a suspicion meter and a director. Walking (20 cm A* grid) and seeing (a baked height field, `sight.json`); hearing is by path distance. `tools/check-stalker.mjs` simulates a smart player and a careless one. |
| `phone.js`, `seccam.js` | The phone: found dead in the fridge, boots on a charger or after warming in a pocket, Q raises it. Home Cam has clips 00:47 and 02:58 and a LIVE feed rendered for real through an infrared pass. The emergency call has whispered answers that depend on what you found. |
| `death.js`, `endings.js` | The grab and waking at 03:07 again; the four endings and their cards. |
| `menu.js`, `hud.js`, `journal.js`, `credits.js`, `music.js`, `sound.js` | The menus (title, new night with difficulty, chapters, journal and endings, settings, brightness, credits, pause), prompts and captions, the evidence journal, the score and stings, and the recorded-sound bank. |

### The home camera sees in the dark

A real night camera has a ring of infrared LEDs round its lens; so does this one. `seccam.js` adds a spot light at the
lens with only the *lightmapped* bit in its mask, and the clustered-light patch in `probes.js` accepts such a light only
while the camera named `security camera` renders (`irView`):
- the player and the probes never see it;
- the infrared view (LIVE, and the baked clips) shows the bedroom even with every light off, and his white mask glows.

It needs no shadow: from the lens it reaches exactly what the lens sees.

`tools/bake-clips.mjs` records three things from the game itself with that camera:
- **00:47:** zoomed on the wardrobe, the left door opens a hand's width with his face in the gap.
- **02:58:** zoomed on the foot of the empty bed, he turns to the lens and looks up into it.
- **03:14:** the still for Sweet Dreams, you curled up asleep and him standing at the foot of the bed.

It also takes the polaroid: a flash photograph from inside the wardrobe, made to look like instant film and printed
into the polaroid model.

### The glass is heard everywhere (owner report)

The glass now plays the recorded `glass_break` through the sound bank:
- placed at the shards and routed through the doorways (`NavGrid.heardFrom`);
- with a gentle high-shelf and low-pass (never below 3.2 kHz) round corners;
- with a floor of `min: 0.32` of full level wherever the player is.

The 0.12 version used a 1.4–2.2 kHz low-pass plus distance roll-off, which made it about 17 dB too quiet from the
kitchen.

## 3. Assets (all downloaded; credits in [CREDITS.md](CREDITS.md))

### The intruder

`tools/intruder/` builds `public/assets/props/intruder.glb`:
- **Body:** Rocketbox "Male_Adult_18" (MIT), a hoodie with the hood up, all dyed black, with black leather gloves.
- **Animations:** 19 Rocketbox clips, retargeted by bone name.
- **Mask:** "White Mask" by shedmon (CC BY 4.0), fixed to the head bone. It is a blank, glossy, expressionless face
  with dark eye holes ("The Strangers" / "Scream").
- **Previews:** `tools/intruder/preview.mjs` renders them.

### The story's props

`tools/props/` builds `public/assets/props/story/*.glb`:
- Each prop is downloaded from a GitHub mirror pinned to a commit, with a SHA-256 lock.
- Each is fitted to its real size, simplified where it was heavy, and its textures resized.
- Licences are in `LICENSES.txt` next to the GLBs, and on the credits screen.

The props and what was done to them:
- **Fuse box:** Poly Haven's "Power Box 01". Its own 19 levers, the RCD and the red main switch are split out to move.
- **Phone:** "Smartphone" by Naudaff3D. Its own screen mesh shows the game's screen.
- **Pill bottle:** relabelled for zolpidem from Dr Haas.
- **Sleep diary:** a notebook.
- **Spare key:** keys on a ring. One key alone is the old key in the nest.
- **Red tin, alarm clock, wooden key bowl, wall camera:** Poly Haven models. The clock's hands are on pivots and start at 03:07.
- **Nest:** water bottles, a folded blanket (a towel scan dyed charcoal), an envelope, and three polaroids with their
  blood smears painted out and our photo printed in.
- **Hair dryer:** a scan.
- **Hangers:** pushed to the end of the wardrobe rail.

### Recordings

78 real recordings, CC0 / CC BY, from Freesound and OpenGameArt via GitHub mirrors:
- `tools/audio/sounds.json` lists the author, licence and source of each.
- `tools/audio/build.mjs` downloads, checks, trims and levels them.
- They include rain, room tone, thunder, footsteps, doors, the breakers and the arc, his breathing, the phone, police
  and sirens.

### Fonts

Caveat (his handwriting) and Special Elite (typed paper), both OFL / Apache.

## 4. Placement

Every prop sits on a surface measured in the built flat (the up-facing triangles in a box). For example:
- the nightstands' tops at 0.57 m;
- the coffee shelf's lower board at 0.83 m;
- the shoe shelf at 0.88 m;
- the basin bowl at x 6.56–6.86, z 1.07–1.42;
- the corridor wall face at z 4.337 (the fuse box's back sits on it);
- the bedroom's east wall panel at x 14.11 (the camera's bracket).

The staging renders are in `build-013/`.

## 5. Menus, HUD, saving

- **Title** (`menu.js`): New night (choose how you sleep: Story, Normal, Hard), Continue (the act's checkpoint),
  Chapters (after a first ending), Journal & endings, Settings, Credits.
- **Settings**: volumes per bus, mouse sensitivity, invert Y, head bob, subtitle size and backing, reduced flashes,
  brightness (with a calibration screen), and graphics (the native dialog).
- **Pause** (Esc, or when pointer lock is lost): resume, restart from the checkpoint, journal, settings, title.
- **HUD** (`hud.js`): key prompts that fade, the crouch mark, captions for voices (the dispatcher, the police), and
  documents read full-screen (typed and handwritten papers, the pill label, photographs, with F to turn them over).
- **Persistence**: settings in `horror.settings.v1`, the run in `horror.save.v1` (one checkpoint per act),
  endings and best times in `horror.progress.v1`, evidence ever found in `horror.evidence.v1`.
- The big title shows on the title screen only; every other screen has its own heading.

## 6. Assets kept for later

The owner asked to keep assets that were downloaded along the way:
- **`docs/asset-candidates.json`** lists the 78 models the scout found, with author, licence, how the licence was
  confirmed, raw download URLs and notes. It includes:
  - other masks: porcelain, rotten rubber, gas masks, a plague mask;
  - rigged characters, hoodies and gloves;
  - phones, cameras, pills, notebooks, keys, papers and clocks;
  - the gaps (an indoor Wi-Fi camera, a digital clock and a hockey or sack mask were not found on GitHub).
- **`docs/sound-candidates.json`** does the same for the sounds.
- **The unmasked intruder** is rebuilt by `node tools/intruder/build.mjs plain` into
  `assets-src/intruder/intruder-plain.glb`.

## 7. Verification

### Node regressions

`node --test tools/check-*.mjs`: 127 tests pass. They include the new tests:
- `check-power.mjs`: the RCD trips the flat, the label's way and the shortcut both work, the cascade.
- `check-stalker.mjs`: his senses and states, and a smart player versus a careless one.
- `check-story.mjs`: the beats with their timers and fallbacks, the front door before and during the hunt, the key bowl,
  the seeds, checkpoints, caught and waking.
- `check-story-wiring.mjs`: every `sys.<system>.<method>()` the story calls exists. It catches what stubs hide: the first
  play-through found the hatch asked of the world instead of the nest.

### A whole night, headless

The night is played headless on the built game: `#play`, with the systems stepped by hand because software
rendering runs at about a frame a second. Every check passes and there are no page errors:

| Act | Checks |
| --- | --- |
| Menus | Title, difficulty, settings, journal and endings, credits |
| I | Act I begins. Phone found in the fridge. The glass breaks 3 s after the fridge shuts. It plays routed to the kitchen with a floor of 0.32. The shards are seen. The knock is answered by the cut (Act II). |
| II | Fuse box opened. The figure at the end of the corridor, then gone. Power restored the label's way, the wet circuit off (Act III). |
| III | The wiped mirror. The nest found. Polaroids. The phone boots on the alerts. LIVE, then the hunt (Act IV). |
| IV | Caught, waking in bed. The police come: "The Lodger" card (time, clock, caught, evidence, what it points to). |

The first run found two problems: the hatch bug above, and the pause screen. The headless browser drops pointer lock;
pausing then is the right behaviour, so the test keeps the pause screen away. The captures from these runs are in
`build-013/`.

### The props in place

Staging renders of every placed prop are in `build-013/`. Each is shot from the floor beside it, with the camera set
directly: `place()` would move a camera standing on furniture to the nearest free cell.

### No shaders or shadow bursts in play

`tools/perf/final-check.mjs`, after the warm-up. The steps are Act I's interactions plus the night's: the cut, the fuse
box, the levers, the figure, the phone, LIVE, the hunt and the grab. Results are below.

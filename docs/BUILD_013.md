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

## 5. Verification

See the end of this file; it is filled in after the runs.

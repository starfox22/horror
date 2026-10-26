# horror
True horror game

A first-person browser horror game in the spirit of P.T., built on PlayCanvas. Current state: **build 0.14, a whole night
in one flat**: you wake at 03:07 in a storm; a notice on the fridge says the troublesome resident has finally been
evicted; a glass shatters in your empty bedroom; the power dies; a masked man with your kitchen knife runs into your
bedroom and up into the ceiling; you find where he has been living, and then he hunts you. Get out. Believable scares
(a crow at the window, the pipes, the light under a locked door, his sprint, the phone buzzing on the nightstand), a
death with a knife, blood and a fall to the floor, four endings, three difficulties, checkpoints, a journal of evidence,
downloaded models and recordings throughout, lighting with probes and shadows on WebGPU or WebGL 2.

Read `docs/HANDOFF.md` first if you are picking this up (state, owner's preferences, how things fit together). Claude Code sessions load `CLAUDE.md` automatically: it lists what to read, the working rules, commands and how to publish.
For Claude's continuation after the owner-approved 0.11 promotion, read [CLAUDE_HANDOFF.md](docs/CLAUDE_HANDOFF.md); build 0.12 is described in [BUILD_012.md](docs/BUILD_012.md).

All Codex reviews continue on `codex-review`, while Claude works on its own branch. Codex merges into or pushes to `main` only when the owner explicitly asks. The first review adds a lighting/material pass and interaction fixes. See [the change list and validation guide](docs/CODEX_ENVIRONMENT_PASS.md), [side-by-side screenshots](docs/review/README.md), and [preview deployment instructions](docs/PREVIEW_DEPLOYMENT.md).

The latest pass adds [a 60 FPS Auto target, lighter graphics budgets, sparse waking lights and a downloaded rigged hand drinking water](docs/REVIEW_11.md), with [comparison screenshots](docs/review-11/README.md). The [0.10 pass](docs/REVIEW_10.md) documents the waking opening, refrigerator and fixture/flashlight shadows; [0.9](docs/REVIEW_09.md) documents switch detail, coffee animation and shelf placement.

## Play

- Claude's latest build (0.14, the branch `claude/pensive-volta-et0etl`, published on every push): https://starfox22.github.io/horror/claude/
- Production (`main`; build 0.13 until the owner promotes a newer one): https://starfox22.github.io/horror/
- Codex review (`codex-review`): https://starfox22.github.io/horror/codex/
- The claude.ai artifact (always the latest Claude build): https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9
- Locally: `npm install && npm run dev`, open the printed URL. Click to enter.

Controls: WASD or arrows move · mouse look · Shift run · C crouch · E use (hold E: the front door's lock, going back to
sleep) · F torch (once found) · Q phone (once you have it; hold Q: silence it) · B head bob · G graphics · 1 / 2 / 3
quality · Esc pause. Use headphones.

Choose **Wake up** to begin in bed. The opening supports Space/Enter to skip and Esc/G to pause; resume continues the same sequence. Normal walking begins beside the bed. The bedside lamps, sofa arc lamp, extractor, bathroom mirror, the office computer and the laptop start on. Open the refrigerator with E, then press E again toward its glass to drink: the arm reaches in, drinks and puts the glass back. Shut the refrigerator afterwards and listen.

Graphics defaults to **Auto** with **VSync**: frames on whole display refreshes (60 FPS on a 60 Hz screen, every second refresh on 120-144 Hz), and Auto lowers resolution and effects if 60 cannot be held. Nothing in a preset change recompiles shaders or re-renders shadows, and every shader is built behind the loading screen. Type "developer" for the developer menu (lights, the scripted events, testing tools).

## Build

```sh
npm install
npm run dev                         # dev server
npm run build                       # static site in dist/ (relative paths: any static host)
node tools/make-artifact.mjs        # dist/ → dist-artifact/ for the claude.ai artifact (model packed as base64 GLB parts)
```

The built apartment (`public/assets/apartment/`) is committed, so the commands above need nothing else. To rebuild it from
the source model:

```sh
node tools/fetch-source.mjs         # source zip from this repo's GitHub release → assets-src/ (needs repo read access)
npm run assets                      # ~20 s with the KTX2 cache (~20 min the first time); --fast for PNG textures
node tools/check-reach.mjs          # every room reachable from the spawn point?
node tools/check-walk.mjs           # drives the real controller along a route at 60 updates/s (no browser)
node tools/check-collision.mjs      # picture of the walk grid → assets-src/collision.png
node tools/shoot.mjs dist out name=x,z,yaw ...   # headless screenshots (software rendering, ~1 min each)
```

## Layout

| Path | What |
|---|---|
| `src/main.js` | Boot: graphics device, decoders, loading, intro screen, quality, update loop |
| `src/player.js`, `src/walkgrid.js` | First-person controller and its collision/floor grid |
| `src/wake-sequence.js`, `src/wake-sequence.css` | First-person waking timeline, pause/skip/reduced-motion and dialogue |
| `src/fridge.js`, `src/fridge-geometry.js`, `src/fridge-water.js` | Refrigerator leaf, collision, downloaded jug and glass, fitted water and door-controlled light |
| `src/drink-sequence.js`, `src/drink-timeline.js`, `src/arm-rig.js` | Downloaded first-person arm (IK, fitted grip), glass reach/grip/sips/return, exhale, pause ownership |
| `src/story-events.js`, `src/falling-glass.js`, `src/thought.js` | Scripted events in story order (the developer menu plays any of them), the falling glass, the player's thoughts |
| `src/warmup.js`, `src/packed.js` | Shader warm-up behind the loading screen; GLBs shipped as base64 in the artifact build |
| `src/frame-limiter.js`, `src/graphics-settings.js` | Saved graphics preferences (Auto + VSync by default), FPS limit and native settings dialog |
| `src/scene-quality.js` | Pixel budgets, texture detail and rain quality (shadows and lit shaders identical at every preset) |
| `src/flashlight-surfaces.js` | Cached triangle tracing for occluded flashlight return light |
| `src/floor-normals.js` | The floors' leaning normals rebuilt at load, so the torch lights them as flat |
| `src/lighting.js` | Lamps at their fixtures, ceiling downlights, lightning-only sky light, night sky, probe capture |
| `src/post.js` | Camera effects (TAA, SSAO, bloom, volumetric haze, grading, vignette), eye adaptation, quality levels |
| `src/ambience.js` | Synthesised sound: rain, room tone, fridge, tap, footsteps, switches, thunder |
| `src/interact.js`, `src/switches.js` | Look-and-press-E interaction; light switches per area |
| `src/flashlight.js` | The flashlight (downloaded model on the shelf; in hand only the beam: cookie, shadows, bounce) |
| `src/closets.js` | Bedroom wardrobe: doors on hinges (opened by him too), interior, LED; the flashlight's shelf |
| `src/taps.js` | The kitchen and bathroom taps: E turns the water on and off (stream, pool, sound; a lure in the hunt) |
| `src/crow.js` | The crow that slams into a window the player is facing (once a night, before the man has been seen) |
| `src/doors.js` | Bathroom door (downloaded model): hinge, spring swing, collision (moving wall), pushes the player aside; he opens it too |
| `src/devices.js` | Bedside reading lamps, laptop lid and screen, office computer, coffee machine with steam |
| `src/probes.js` | Probes: per-room box-projected reflections; bounce light from 8 probes blended by position; captures spread over frames and cross-faded |
| `src/devmenu.js` | Developer options (type "developer"): flashlight beam size, lights (through the flat's own switches), story events played 3 s after resuming |
| `src/rain.js` | Rain on the glass (dark outside), rain outside seen in lightning, thunder |
| `src/story.js` | The story (docs/STORY.md): flags, play-time timers, the beats and their fallbacks, checkpoints, run variations |
| `src/power.js`, `src/fusebox.js` | The flat's electricity (main, RCD, seven circuits; cuts cascade) and the downloaded consumer unit with its own levers |
| `src/world.js`, `src/nest.js` | What the night leaves in the flat (shards, the bathroom, prints, papers, the spare key, bowl, clock) and his nest and hatch |
| `src/intruder.js`, `src/stalker.js`, `src/hunt.js` | The masked man: body, animation and phone torch; his senses and states; the hunt (Act IV) |
| `src/navgrid.js`, `src/zones.js` | Walking (A* on a 20 cm grid), seeing (baked height field `sight.json`), hearing through doorways; rooms and areas |
| `src/phone.js`, `src/phone-screen.js`, `src/seccam.js` | The phone (dead on the nightstand, its charger pulled; held in the first-person hand; Home Cam clips and LIVE, the emergency call), its screens drawn into a canvas, and the camera's infrared view |
| `src/death.js`, `src/endings.js` | Being caught (the knife, blood on the lens, the fall to the floor) and waking on the sofa; the four endings |
| `src/menu.js`, `src/hud.js`, `src/journal.js`, `src/credits.js` | Title, new night, chapters, journal and endings, settings, credits, pause; prompts, captions and documents; evidence |
| `src/sound.js`, `src/music.js` | Recorded sounds (doorway-routed, occluded, reverberant) and the score and stings |
| `src/props.js` | The story's downloaded props, placed with per-room materials |
| `tools/intruder/`, `tools/props/`, `tools/audio/` | Reproducible downloads and builds of the intruder (and his mask: `fit.mjs`, `fit-check.mjs` keep it clear of his face in every clip; `stage.html` previews him), the story's props (his knife, the kitchen's knives), the recordings |
| `tools/bake-clips.mjs`, `tools/surfaces.mjs` | Bakes the camera clips and the polaroid photo from the game; measures the flat's surfaces for placing things |
| `tools/crow/` | Reproducible download and build of the crow (and the blood smear it leaves) |
| `tools/perf/` | Browser checks: no shader builds in play (`final-check.mjs`), hitches, leaks; `scene-shots.mjs` captures story moments for the build docs |
| `assets/props/` | Downloaded models: merged into the apartment by the pipeline (door, flashlight) or converted by `tools/extract-props.mjs` (jug, glass); credits in docs/CREDITS.md |
| `public/assets/props/`, `public/assets/audio/`, `public/assets/clips/` | Runtime models (arm, intruder, `story/*.glb`), recordings (`sfx/*.mp3` + `sfx.json`), baked camera clips |
| `tools/arm/` | Reproduces the first-person arm from the Rocketbox avatar (see its README) |
| `tools/` | Asset pipeline and checks (see Build) |
| `public/assets/apartment/` | Built model: `scene.gltf`, `geometry-*.bin`, `textures/*.ktx2`, `collision.json` |
| `public/lib/` | PlayCanvas's Basis (KTX2) and Draco decoders |
| `docs/` | Hand-off notes, proposal history, credits |

Credits and licences: `docs/CREDITS.md`.

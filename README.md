# horror
True horror game

A first-person browser horror game in the spirit of P.T., built on PlayCanvas. Current state: **build 0.4, a walkable
night-time apartment** (no scares yet): light switches in every area, bedside reading lamps, a bathroom door and wardrobe that
open, a laptop, computer and coffee machine to use, a flashlight to find (only its beam is seen), rain gathering and running
down the windows, lightning and thunder, warm night lighting, post-processing and ambient sound.

Read `docs/HANDOFF.md` first if you are picking this up (state, owner's preferences, how things fit together).

## Play

- claude.ai link (latest build): https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9
- Locally: `npm install && npm run dev`, open the printed URL. Click to enter.

Controls: WASD or arrows move · mouse look · Shift walk faster · E use (switches, doors, lamps, laptop, computer, coffee machine) · F flashlight (once found)
· B head bob on/off · 1 / 2 / 3 quality (low / medium / high; it also drops automatically on slow GPUs) · Esc pause.
URL hash options: `#webgl` (force WebGL 2 instead of WebGPU), `#stats` (fps, draw calls); for tests `#dark`, `#flash`.

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
| `src/lighting.js` | Lamps (positions from the model), moonlight, night sky, room reflection probe |
| `src/post.js` | Camera effects (TAA, SSAO, bloom, volumetric haze, grading, vignette) and quality levels |
| `src/ambience.js` | Synthesised sound: rain, room tone, fridge, tap, footsteps, switches, thunder |
| `src/interact.js`, `src/switches.js` | Look-and-press-E interaction; light switches per area |
| `src/flashlight.js` | The flashlight (downloaded model on the shelf; in hand only the beam: cookie, shadows, bounce) |
| `src/closets.js` | Bedroom wardrobe: doors on hinges, interior, LED; the flashlight's shelf |
| `src/doors.js` | Bathroom door: hinge, spring swing, collision (moving wall), stops against the player |
| `src/devices.js` | Bedside reading lamps, laptop lid and screen, office computer, coffee machine with steam |
| `src/rain.js` | Rain on the glass (dark outside), rain outside seen in lightning, thunder |
| `assets/props/` | Downloaded models merged into the apartment by the pipeline (credits in docs/CREDITS.md) |
| `tools/` | Asset pipeline and checks (see Build) |
| `public/assets/apartment/` | Built model: `scene.gltf`, `geometry-*.bin`, `textures/*.ktx2`, `collision.json` |
| `public/lib/` | PlayCanvas's Basis (KTX2) and Draco decoders |
| `docs/` | Hand-off notes, proposal history, credits |

Credits and licences: `docs/CREDITS.md`.

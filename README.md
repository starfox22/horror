# horror
True horror game

A first-person browser horror game in the spirit of P.T., built on PlayCanvas. Current state: **build 0.1, a walkable
night-time apartment** (no scares yet): first-person walking, night lighting, post-processing and ambient sound.

Read `docs/HANDOFF.md` first if you are picking this up (state, owner's preferences, how things fit together).

## Play

- claude.ai link (current build): see `docs/HANDOFF.md` → Published builds.
- Locally: `npm install && npm run dev`, open the printed URL. Click to enter.

Controls: WASD or arrows move · mouse look · Shift walk faster · B head bob on/off · 1 / 2 / 3 quality (low / medium /
high; it also drops automatically on slow GPUs) · Esc pause.
URL hash options: `#webgl` (force WebGL 2 instead of WebGPU), `#stats` (fps, draw calls).

## Build

```sh
npm install
npm run dev                         # dev server
npm run build                       # static site in dist/ (relative paths: any static host)
node tools/make-artifact.mjs        # dist/ → dist-artifact/ for the claude.ai artifact (page without <html>/<head>)
```

The built apartment (`public/assets/apartment/`) is committed, so the commands above need nothing else. To rebuild it from
the source model:

```sh
node tools/fetch-source.mjs         # source zip from this repo's GitHub release → assets-src/ (needs repo read access)
npm run assets                      # ~20 min (KTX2 texture encoding); add --fast for a 20 s PNG build while iterating
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
| `src/ambience.js` | Synthesised ambience: rain, room tone, fridge, dripping tap, footsteps |
| `tools/` | Asset pipeline and checks (see Build) |
| `public/assets/apartment/` | Built model: `scene.gltf`, `geometry-*.bin`, `textures/*.ktx2`, `collision.json` |
| `public/lib/` | PlayCanvas's Basis (KTX2) and Draco decoders |
| `docs/` | Hand-off notes, proposal history, credits |

Credits and licences: `docs/CREDITS.md`.

# horror
True horror game

A first-person browser horror game in the spirit of P.T., built on PlayCanvas. Current state: **build 0.10 (first waking sequence, refrigerator and lighting review), a walkable
night-time apartment** (no scares yet): a first-person waking opening, an opening refrigerator with a lit interior and water jar, light switches in every area, lamps with their own switches (bedside, desk, arc lamp), a bathroom door and wardrobe that
open, a laptop, computer and coffee machine to use, a flashlight to find (only its beam is seen), rain gathering and running
down the windows, lightning and thunder, warm night lighting that fades softly into darkness (bounce light from probes
around the flat, eye adaptation), post-processing and ambient sound.

Read `docs/HANDOFF.md` first if you are picking this up (state, owner's preferences, how things fit together).

All Codex reviews continue on `codex-review`, while Claude works on its own branch. Codex merges into or pushes to `main` only when the owner explicitly asks. The first review adds a lighting/material pass and interaction fixes. See [the change list and validation guide](docs/CODEX_ENVIRONMENT_PASS.md), [side-by-side screenshots](docs/review/README.md), and [preview deployment instructions](docs/PREVIEW_DEPLOYMENT.md).

The latest pass adds [the waking opening, refrigerator, a saved FPS limit, stronger optional grain and corrected fixture/flashlight shadows](docs/REVIEW_10.md), with [matched comparison screenshots](docs/review-10/README.md). The [previous pass](docs/REVIEW_09.md) documents switch detail, coffee animation, shelf placement and lighting defaults.

## Play

- Codex review web build: https://starfox22.github.io/horror/codex/
- claude.ai link (latest build): https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9
- Locally: `npm install && npm run dev`, open the printed URL. Click to enter.

Controls: WASD or arrows move · mouse look · Shift walk faster · E use (switches, doors, refrigerator, lamps, laptop, computer, coffee machine) · F flashlight (once found)
· B head bob on/off · G graphics · 1 / 2 / 3 quality (low / medium / high; it also drops automatically on slow GPUs) · Esc pause.
URL hash options: `#webgl` (force WebGL 2 instead of WebGPU), `#stats` (fps, draw calls); for tests `#dark`, `#flash`.

Choose **Wake up** to begin in bed. The opening supports Space/Enter to skip and Esc/G to pause; resume continues the same sequence. Normal walking begins beside the bed. Only the bedside lamps, sofa arc lamp, extractor and bathroom mirror start lit. Open the refrigerator with E, then press E again toward its glass to drink. The downloaded rigged hand, glass and recorded gulp/exhale follow one pausable timeline.

Graphics defaults to a saved 60 FPS limit; Unlimited is an explicit menu choice. Auto targets 60 through progressively lighter effects, shadow filtering and resolution, down to Low at 50%. Presets also bound high-DPI/4K rendering and rain work. A frame cap cannot raise hardware throughput; see [review 0.11](docs/REVIEW_11.md) for validation and limits.

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
| `src/fridge.js`, `src/fridge-geometry.js`, `src/fridge-water.js` | Refrigerator leaf, collision, authored jar, fitted water and door-controlled light |
| `src/drink-sequence.js`, `src/drink-timeline.js` | Downloaded hand rig, glass reach/grip/sips/return, recorded audio and pause ownership |
| `src/frame-limiter.js`, `src/graphics-settings.js` | Saved graphics preferences, FPS limit and native settings dialog |
| `src/scene-quality.js` | Pixel budgets, shadow atlases/filtering, texture detail and rain quality |
| `src/flashlight-surfaces.js` | Cached triangle tracing for occluded flashlight return light |
| `src/lighting.js` | Lamps at their fixtures, ceiling downlights, lightning-only sky light, night sky, probe capture |
| `src/post.js` | Camera effects (TAA, SSAO, bloom, volumetric haze, grading, vignette), eye adaptation, quality levels |
| `src/ambience.js` | Synthesised sound: rain, room tone, fridge, tap, footsteps, switches, thunder |
| `src/interact.js`, `src/switches.js` | Look-and-press-E interaction; light switches per area |
| `src/flashlight.js` | The flashlight (downloaded model on the shelf; in hand only the beam: cookie, shadows, bounce) |
| `src/closets.js` | Bedroom wardrobe: doors on hinges, interior, LED; the flashlight's shelf |
| `src/doors.js` | Bathroom door (downloaded model): hinge, spring swing, collision (moving wall), stops against the player |
| `src/devices.js` | Bedside reading lamps, laptop lid and screen, office computer, coffee machine with steam |
| `src/probes.js` | Probes: per-room box-projected reflections; bounce light from 8 probes blended by position |
| `src/devmenu.js` | Developer options (type "developer"): flashlight beam size, every light on/off, test actions |
| `src/rain.js` | Rain on the glass (dark outside), rain outside seen in lightning, thunder |
| `assets/props/` | Downloaded models merged into the apartment by the pipeline (credits in docs/CREDITS.md) |
| `tools/` | Asset pipeline and checks (see Build) |
| `public/assets/apartment/` | Built model: `scene.gltf`, `geometry-*.bin`, `textures/*.ktx2`, `collision.json` |
| `public/lib/` | PlayCanvas's Basis (KTX2) and Draco decoders |
| `docs/` | Hand-off notes, proposal history, credits |

Credits and licences: `docs/CREDITS.md`.

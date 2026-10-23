# Hand-off: read this first

A browser horror game in the spirit of Konami's P.T. (first person, one quiet home, photoreal, AAA look). The owner
works with AI agents; whoever picks this up continues from the state below and keeps this file current.

## Owner's requirements and preferences
- AAA-looking graphics, playable in a desktop browser.
- Download existing free assets (Sketchfab, Poly Haven, GitHub…) instead of making them, to save tokens. Assets must
  have a licence that allows use in a game (CC0 / CC BY / MIT…); credit them in docs/CREDITS.md.
- Setting chosen: a modern apartment ("Modern Apartment" by Visthétique, CC BY 4.0). The player is alone.
- Milestone 1 (done, build 0.1): walk around the apartment in first person with AAA graphics and ambience. Nothing
  scary yet: no enemies, story or puzzles until the owner asks.
- Build 0.2 (done): light switches per area, a flashlight to find and carry, rain on and outside the windows,
  lightning and thunder, general polish.
- Build 0.3 (done, owner feedback on 0.2): no skyline, pitch-black outside like P.T. with rain on the glass; a real
  apartment's lighting (ceiling downlights everywhere, the corridor included); the bedroom wardrobe opens; a
  downloaded front door with a handle; a downloaded flashlight. Owner rule: download assets instead of building them.
- Build 0.4 (done, owner feedback on 0.3): softer, warmer, realistic lighting with everything on (not blown out);
  bedside reading lamps switch on their own; a regular handheld flashlight (downloaded) that is never seen in hand, only
  its beam (as in P.T.), wider and AAA-looking; drops on the windows gather and run down; the bathroom door opens and
  shuts and blocks you; more interactions (laptop lid, computer, coffee machine) with AAA feedback.
- Show screenshots and links before big decisions; publish each prototype to a web link.
- Keep everything documented so another AI can continue.

## Published builds
- Builds 0.1-0.4 (2026-10-22/23): claude.ai artifact https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9 (always the
  latest build; private to the owner unless shared from its Share menu).
- GitHub Pages: `.github/workflows/pages.yml` deploys `main` to https://starfox22.github.io/horror/ once the owner turns
  Pages on (Settings → Pages → Source: GitHub Actions). The repository is private, which needs a paid plan for Pages;
  the alternative is making it public. Until then the artifact is the link.

To republish the artifact: `npm run build && node tools/make-artifact.mjs`, then the Artifact tool with
`file_path: dist-artifact/index.html`, `root: dist-artifact`, `url` above, and `files` from the JSON list the script prints.
The host serves no .bin/.ktx2 files, so make-artifact packs the model into one GLB split into ~14 MB base64 text parts
(`assets/apartment/apartment-N.txt` + `apartment.json`); main.js reassembles it in memory. Limits: 15 MB per file,
64 MB per publish call (so: call 1 = small files + parts 0-2, call 2 = parts 3-6, both to the same url),
256 MB per version.

## How it fits together (see README.md for the file map)
- **Engine**: PlayCanvas 2.23 from npm, bundled by Vite (`base: './'`, so the build runs from any folder). WebGPU with a
  WebGL 2 fallback (`#webgl` forces it). No physics engine.
- **Asset pipeline** (`tools/build-assets.mjs`): source glTF (3M triangles, 300 MB) → flatten → open the bathroom door
  (it is modelled shut and is the bathroom's only entrance) → weld + meshopt simplify (error 0.0004 of mesh radius,
  removes the 1M-triangle door's redundant tessellation) → join by material (~92 draws) → textures capped at 2048 px →
  KTX2 (UASTC for normal maps, ETC1S for the rest) → Draco → .bin split ≤12 MB. Result ~65 MB, 878k triangles.
  The source zip lives on a draft GitHub release of this repo (asset `modern_apartment2.zip`); `tools/fetch-source.mjs`
  downloads it. The built files are committed (`public/assets/apartment/`).
- **Collision** (`tools/collision.mjs` bakes, `src/walkgrid.js` reads): 5 cm grid over x/z. A cell is blocked when any
  surface crosses 0.25–1.9 m height; floor height = highest up-facing surface under 0.5 m (floors are 0.15–0.24 m).
  The player is a 0.22 m circle that may step up 12 cm. `tools/check-reach.mjs` must report every room reachable.
- **Lighting** (`src/lighting.js`): night. Lamps placed at the model's own fixtures (arc lamp, two dining pendants,
  cooker hood, bathroom mirror LED, bedside strip, desk lamp, screens), one fake "living bounce" fill, a hall night
  light, blue moonlight (directional, shadows) through the windows, a procedural night-sky cubemap outside. After the
  first frame a cubemap probe is captured from inside the lit room (2.8, 1.5, 1.0) and becomes the environment atlas
  (ambient + reflections), scaled by `AMBIENT` in main.js.
- **Camera effects** (`src/post.js`, PlayCanvas `CameraFrame`): neutral tone mapping, TAA, SSAO, bloom, volumetric
  haze lit by the moon and the spot lamps, grading, vignette, slight fringing. Quality 3/2/1 (keys 1-3; automatic drop
  while walking below ~40 / ~24 fps).
- **Sound** (`src/ambience.js`): all synthesised with Web Audio (rain per window, droplets, room tone, city rumble,
  fridge cycling, dripping tap, footsteps by floor finish), HRTF-positioned with a generated reverb. Replace with
  downloaded CC0 recordings when a source is reachable.

## Build 0.4 changes (where they live)
- **Moving and switchable parts from the pipeline** (`tools/build-assets.mjs`): `FIXTURES` gives whole nodes their own
  material copy `<material>.<tag>` (iMac screen `.imac`, coffee panel `.coffee`, the bathroom door leaf `.bathdoor`
  via `BATH_DOOR`); `SPLITS` cuts triangles out by world centroid (the two bedside bulbs `Light.bedside-left/right`
  at z 0.5, the MacBook lid `*.laptoplid` above y 0.522). The door used to be baked open; now `NO_COLLISION` keeps
  the leaf out of the walk grid (`tools/collision.mjs` `skip`) and the game blocks the doorway itself.
- **Moving walls** (`src/walkgrid.js` `addBlocker`): a door leaf is a segment the player's circle may not cross.
  Bathroom door (`src/doors.js`): hinge (9.15, 0.375), 0.85 m leaf, opens -92 deg into the bathroom on a damped
  spring, stops against the player (soft bump), latches with a thud. Wardrobe doors are blockers too and also stop
  against you. If a door ever ends up overlapping the player, `Player.update` ignores blockers until they step out.
- **Static shadows and moving parts**: lamps render shadows once; `refreshShadows(app, pos, radius)` (lighting.js)
  re-renders the nearby lamps' shadows while a door, wardrobe door or the laptop lid moves.
- **Devices** (`src/devices.js`): bedside reading lamps (each a shadowed spot + spill at its bulb, E on the bulb),
  MacBook (lid on its measured hinge `LID_HINGE`/`LID_AXIS`, screen and keyboard light sleep/wake), the office computer
  (iMac + the desk's second screen: power button, chime, boot fade; off fades out), the coffee machine (panel lights,
  grind, pump, pour, beeps; steam particles over the cup). Screens are emissive-only: switched off they are black glass.
- **Flashlight** (`src/flashlight.js`): "Flash-Lite Flashlight" (CC BY 4.0) on the wardrobe shelf; once taken the
  model is hidden and only the beam exists, held at the right hand below the eye (shadows shift as you look). 42 deg
  cone with a reflector cookie (hot spot, corona, spill fading out), tremor + step sway + lag, switch-on stutter, and
  a warm bounce omni placed where the beam's axis meets the walk grid (wall/floor/ceiling).
- **Lighting levels** (`src/lighting.js`): downlights 2700 K at 1.35 (were 3.2) with wide soft cones (14/74 deg) and
  dimmer lenses; lamps ~35 % lower. With everything on the flat is warm and readable, not blown out. Curtains
  (`Plain_Natural_Sheer*`) no longer receive shadows (acne streaks on the thin double-sided cloth).
- **Rain on the glass** (`src/rain.js`): fine droplets keep landing; drops of some size gather touching ones (volumes
  add); past a size a drop runs down in stutters, sweeping up what it meets and shedding a bead trail until it stops.
  Drops are lens sprites (dark meniscus, brighter refracted underside, highlight) that glow faintly with the share of
  lights that are on (`rain.roomLight`, set after each probe capture). Tile 0.95 m of glass.
- **Prompt UI** (`src/interact.js`, `style.css`): `[E]` key cap + action, fading in under the reticle; the reticle
  opens into a ring over usable things and pulses on use. Labels no longer include "E ·".

## Build 0.3 changes (where they live)
- **Downloaded props** (`assets/props/`, merged into the apartment file by `tools/build-assets.mjs` PROPS): the front door
  ("Door with frame", witnessk, CC BY 4.0, from github.com/pmndrs/xr) replaces the model's entrance door (REMOVE);
  the flashlight was Poly Haven's "Vintage Flashlight" (0.4: replaced, see above). Prop materials are prefixed
  `Prop_<name>.` so the game finds them. Only GitHub is reachable from the cloud session: look for asset repos there.
- **Ceiling lights** (`src/lighting.js` DOWNLIGHTS): 23 recessed downlights at the ceiling height baked into
  collision.json (`ceilCm`, WalkGrid.ceilingAt), on each area's switch; everything starts on. Clustered lighting needs
  `maxLightsPerCell` 32 and cells 28x3x10, or lamps are dropped where many overlap (the bedroom went dark).
- **Wardrobe** (`src/closets.js`): the pipeline cuts four door panels and their handles out of `BedroomWardrobes_*`
  (WARDROBE boxes, materials `<name>.wardrobe-<id>`); the game hangs them on hinge pivots and swings them with E.
  The model is hollow behind the doors, so a carcass (floor, top, sides, divider, shelf, rail) is added in its wood;
  an LED comes on while a section is open. The flashlight lies on the tall section's shelf, behind the left door.
- **Windows**: city backdrop and street lamps removed; sheer curtains hidden; drops are grey water lit by the room
  (emissive only during lightning); the rain outside is visible only in a flash. The front door is locked (E rattles it).

## Build 0.2 features (where they live)
- **Interaction** (`src/interact.js`): look at a thing within 2.1 m and press E (or click). Prompt under the reticle.
- **Light switches** (`src/switches.js`, `ROOMS`): living lamp, dining pendants, kitchen, desk lamp, hall, bathroom,
  bedroom (+ closet light). Bathroom and bedroom use the model's own switch plates; the rest get a plate mounted on the
  first wall the walk grid meets from `from` along `dir`. A toggle fades the lamps and the fixture glow (per-room
  `Light.<room>` materials split off in the pipeline) and re-captures the room probe (ambient + reflections).
- **Flashlight** (`src/flashlight.js`): (0.3: now the downloaded model, in the wardrobe.) E takes it, F toggles.
  Shadow-casting spot with a cookie and volumetric scattering; the hand lags the view.
- **Rain** (`src/rain.js`): drops simulated on a 512 px canvas (1.4 m of glass) → normal map + opacity on the
  `WindowGlass` material (planar UVs from the pipeline); rain streak particles outside; lightning every 25-70 s
  (moon light spikes) with synthesised thunder. (0.2's city backdrop and street lamps were removed in 0.3.)
- **Polish**: static (render-once) shadows on every lamp, film grain overlay, idle breathing sway, sheer curtains
  thinned to 0.1 opacity, shorter volumetric haze (12 m) so the city stays visible.
- Blender was not used: baked lighting cannot follow the new light switches. If baking is wanted later, bake only
  what never changes (ambient occlusion, the moonlight) into a second UV set and keep the lamps live.

## Gotchas learned the hard way
- SSAO `radius` is in world units: this scene is in metres, so 1.2 (the engine's default of 30 blackens everything).
- Do not place the probe near a lamp: it then sees a bright table top and floods every ceiling with bounce light.
- `scene.exposure` set before the probe capture did not stick; tuning overrides are applied after it.
- `tools/shoot.mjs` loads `about:blank` between views: a hash-only change does not reload the page.
- Headless rendering is SwiftShader at ~1 fps with all effects; each screenshot takes about a minute.
- KTX2 encoding is cached by content in `assets-src/ktx2-cache/`: the first full build takes ~20 min, later ones ~20 s.
- `dedup()` merges materials that differ only by name (`keepUniqueNames: true` keeps the per-room copies) and
  `prune()` drops UVs no texture uses (`keepAttributes: true` keeps the window UVs the game textures at runtime).
- Window glass: dynamic refraction through CameraFrame blurred the city into a flat haze, and any lit diffuse on the
  glass washes the view out (street lamps shine on it). Drops are therefore dark-diffuse, self-lit beads.
- The volumetric haze filled the 25 m outside the windows with moonlit purple and hid the city: `maxDistance` 12.
- Spot lights shine along their local -Y: aim with `lookAt(target)` then `rotateLocal(90, 0, 0)`.
- Headless tests: SwiftShader runs ~1 fps, so animations barely advance in wall time. Step systems by hand in a page
  evaluate (`doors.update(0.033)` in a loop, `rain.update` with `rain.draw` stubbed out: drawing is the slow part).
- Do not `pkill -f <name>` from a shell whose own command line contains <name> (it kills itself); use `[n]ame`.
- Sketchfab models found in GitHub repos carry their licence in the GLB (`asset.extras.license`): check it there.
- The cloud session reaches GitHub (git, media.githubusercontent.com, api.github.com for this repo) and npm/PyPI only;
  Sketchfab, Poly Haven, Zenodo and Hugging Face are blocked unless the owner allows them.

## Next steps (suggested, not started)
1. Owner feedback on build 0.4.
2. Replace the synthesised sounds with downloaded CC0 recordings (search GitHub game repos, as for the props).
3. Kitchen cabinets and the wardrobe's top row could open the same way as the wardrobe doors.
3. Mirror reflections (bathroom) with a planar reflection; per-room reflection probes.
4. Upgrade PlayCanvas when `CameraFrameEffect` ships in a release (true film grain / lens effects in the compose pass).
5. Then the horror layer (the P.T. loop through the corridor), only when the owner asks.

## History
- 2026-10-22: proposal (docs/PROPOSAL.md) → owner picked Visthétique's apartment → build 0.1 walkable apartment.
  Proposal pages: https://claude.ai/artifact/3NwzpfHYfCAMCW5Mvb8uz2 and https://claude.ai/artifact/6PVjhA37A16UxRMxhQhnPz

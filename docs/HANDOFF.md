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
- Show screenshots and links before big decisions; publish each prototype to a web link.
- Keep everything documented so another AI can continue.

## Published builds
- Build 0.1 (2026-10-22): claude.ai artifact https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9 (private to the owner
  unless shared from its Share menu).
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

## Gotchas learned the hard way
- SSAO `radius` is in world units: this scene is in metres, so 1.2 (the engine's default of 30 blackens everything).
- Do not place the probe near a lamp: it then sees a bright table top and floods every ceiling with bounce light.
- `scene.exposure` set before the probe capture did not stick; tuning overrides are applied after it.
- `tools/shoot.mjs` loads `about:blank` between views: a hash-only change does not reload the page.
- Headless rendering is SwiftShader at ~1 fps with all effects; each screenshot takes about a minute.
- KTX2 UASTC encoding of the 11 normal maps takes ~12 minutes; use `--fast` while iterating on geometry.
- The cloud session reaches GitHub (git, media.githubusercontent.com, api.github.com for this repo) and npm/PyPI only;
  Sketchfab, Poly Haven, Zenodo and Hugging Face are blocked unless the owner allows them.

## Next steps (suggested, not started)
1. Owner feedback on build 0.1 (look, brightness, walking speed, sound).
2. Baked lighting: bake global illumination lightmaps in Blender (`pip install bpy`) for the look of the offline
   renders; the live lights then only add the dynamic part.
3. Mirror reflections (bathroom) with a planar reflection; per-room reflection probes.
4. Downloaded CC0 audio for rain and footsteps.
5. Then the horror layer (the P.T. loop through the corridor), only when the owner asks.

## History
- 2026-10-22: proposal (docs/PROPOSAL.md) → owner picked Visthétique's apartment → build 0.1 walkable apartment.
  Proposal pages: https://claude.ai/artifact/3NwzpfHYfCAMCW5Mvb8uz2 and https://claude.ai/artifact/6PVjhA37A16UxRMxhQhnPz

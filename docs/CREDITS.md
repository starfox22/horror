# Credits and licences

## Assets shipped with the game

- **"Modern Apartment"** by Visthétique (https://sketchfab.com/visthetique), licensed CC BY 4.0
  (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/modern-apartment-1fbb649cd6624f2bb7b7d6e30c6533a5
  Changes: simplified, re-compressed (Draco geometry, KTX2 textures); its bathroom door and entrance door removed
  (replaced by the downloaded door below); the wardrobe doors, laptop lid,
  bedside lamp glows, iMac screen and coffee machine panel cut into separate parts so the game can move or switch them.
  The detailed switch mesh in `src/switch-model.json` is extracted from the original `ElectricPlugs_White1_0` source
  before apartment simplification: its authored rocker and bevels are retained, the gang-frame end is cropped/mirrored
  into a single plate, and it is scaled/reused for wall controls. `tools/extract-switch.mjs` reproduces that extraction.
  The credit is also shown on the game's intro screen; keep it there.
  Review 0.10 also separates its actual upper refrigerator leaf, with fitted functional cabinet/liquid geometry. See
  `FRIDGE_ASSETS.md` for extraction and adaptation.
- **"Flash-Lite Flashlight"** by AndrewHunt95 (https://sketchfab.com/AndrewHunt95), licensed CC BY 4.0
  (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/flash-lite-flashlight-e20e52c7a0eb466086af727588839d48 .
  Downloaded from https://github.com/JulianQuenet/three.js-game (`public/flash-lite_flashlight.glb`; the licence and
  author are embedded in the file's glTF `asset.extras`); kept in `assets/props/flashlite_flashlight.glb`. Unchanged
  (re-compressed). Replaced build 0.3's "Vintage Flashlight" (Poly Haven, CC0).
- **"Door with frame"** by witnessk (https://sketchfab.com/witnessk), licensed CC BY 4.0. Source:
  https://sketchfab.com/3d-models/door-with-frame-2f2f149f3ec44d658a02c1f924dfa449 . Downloaded from
  https://github.com/pmndrs/xr (`examples/handle/public/door.glb`); kept in `assets/props/door_with_frame.glb`.
  Used as the apartment's front door and, since build 0.6, the bathroom door (each scaled to its opening; the bathroom
  copy's leaf swings). Its normal map is left out (it is not a tangent-space map and tilted the lighting).
- **PlayCanvas Engine** (MIT), https://github.com/playcanvas/engine
- **First-person arm**: "Male_Adult_13" from the **Microsoft Rocketbox Avatar Library**,
  https://github.com/microsoft/Microsoft-Rocketbox (commit `0943055db6ec570bcef9f2c8b41c9e5467c808f9`),
  Copyright (c) 2020 Microsoft, **MIT License**. Runtime: `public/assets/props/drinking-arm.glb` (+ `drinking-arm.json`
  rig data, `drinking-arm.LICENSE.txt`). Adaptation: the right arm only (knit sleeve, forearm, hand), cut below the
  shoulder, re-rigged to 18 joints in a wrist-origin frame, finger poses fitted to the glass, textures converted to
  glTF PBR. Reproduce with `tools/arm/` (see its README). Since build 0.12; it replaces the adapted "Rigged hand" by
  Elena FF (CC BY-SA 4.0) used in 0.11, which no longer ships.
- **"Glass Water Jug (High Poly)"** by ShotaB (https://sketchfab.com/ShotaB), **CC BY 4.0**,
  https://sketchfab.com/3d-models/glass-water-jug-high-poly-c0b82c381cd34115ba1462ba0310aca1 . Downloaded from the
  `Tejask001/EduQuest-AR` GitHub mirror (commit `5ed3fe7`). Normalised to metres (22 cm), one mesh, flat glass material;
  kept in `assets/props/water-jug.glb` (+ `.LICENSE.txt`), runtime mesh `public/assets/props/water-jug.json`.
- **"Glass Collection"** by RagingCow (https://sketchfab.com/marcussamiran), **CC BY 4.0**,
  https://sketchfab.com/3d-models/glass-collection-0ff8fc5007dd4e9da675109fe7c443d6 : its "highball glass". Downloaded
  from the `Nhucanada/Barline` GitHub mirror (commit `ded93c1`). Winding fixed (the source was inside-out), normalised
  to metres, scaled to 12.6 cm; kept in `assets/props/drinking-glass.glb` (+ `.LICENSE.txt`), runtime mesh
  `public/assets/props/drinking-glass.json`. Replaces the apartment's own table glass (0.11).
- **"Glass Break"** by unfa, https://freesound.org/people/unfa/sounds/221528/ (listed CC0 today; listed CC BY 3.0
  in 2015-2018 listings, so it is credited either way). Trimmed, faded, resampled to 48 kHz:
  `public/assets/audio/glass-break.wav` (the falling glass event).
- **"Exhale_10115a.wav"** by otherthings, CC0 1.0, https://freesound.org/people/otherthings/sounds/65619/ :
  `public/assets/audio/drink-relief.wav`, the exhale after drinking (downloaded from the `Wh1teDuke/WilhelmSFX`
  mirror, unchanged; provenance in `drink-sources.json`). The 0.11 gulp recording (Breviceps) no longer ships.
- **Cormorant Garamond** by the Cormorant Project Authors, SIL Open Font License 1.1,
  https://github.com/google/fonts/tree/main/ofl/cormorantgaramond. The opening dialogue uses a locally bundled
  weight-500 Latin subset; licence and derivation notes are in `public/assets/fonts/`.
- **Basis Universal transcoder** (Apache-2.0) and **Draco decoder** (Apache-2.0), as built by PlayCanvas
  (`public/lib/basis`, `public/lib/draco`, from playcanvas/engine `examples/assets/wasm`).

## Build tools (not shipped)

glTF Transform (MIT), meshoptimizer (MIT), ktx2-encoder (MIT, wraps Basis Universal), draco3dgltf (Apache-2.0),
sharp (Apache-2.0), Vite (MIT), Playwright (Apache-2.0).

## Made in code (placeholders until downloadable assets are reachable)

- Ambience and fixture sounds: synthesized in `src/ambience.js`; the exhale and glass-break recordings above are sampled audio.
- Rain drops, film grain and the flashlight's beam cookie are painted procedurally at runtime.
- Small built pieces with no asset worth downloading: recessed ceiling downlight discs and the
  wardrobe's inner carcass (shelf, rail, inner walls) in the model's own wood material.
- The coffee machine's steam puff texture and the flashlight's reflector cookie are painted at runtime.

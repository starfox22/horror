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
- **Basis Universal transcoder** (Apache-2.0) and **Draco decoder** (Apache-2.0), as built by PlayCanvas
  (`public/lib/basis`, `public/lib/draco`, from playcanvas/engine `examples/assets/wasm`).

## Build tools (not shipped)

glTF Transform (MIT), meshoptimizer (MIT), ktx2-encoder (MIT, wraps Basis Universal), draco3dgltf (Apache-2.0),
sharp (Apache-2.0), Vite (MIT), Playwright (Apache-2.0).

## Made in code (placeholders until downloadable assets are reachable)

- Sound: all synthesised in `src/ambience.js` (no third-party audio).
- Rain drops, film grain and the flashlight's beam cookie are painted procedurally at runtime.
- Small built pieces with no asset worth downloading: recessed ceiling downlight discs and the
  wardrobe's inner carcass (shelf, rail, inner walls) in the model's own wood material.
- The coffee machine's steam puff texture and the flashlight's reflector cookie are painted at runtime.

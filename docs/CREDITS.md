# Credits and licences

## Assets shipped with the game

- **"Modern Apartment"** by Visthétique (https://sketchfab.com/visthetique), licensed CC BY 4.0
  (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/modern-apartment-1fbb649cd6624f2bb7b7d6e30c6533a5
  Changes: simplified, re-compressed (Draco geometry, KTX2 textures), the bathroom door swung open.
  The credit is also shown on the game's intro screen; keep it there.
- **PlayCanvas Engine** (MIT), https://github.com/playcanvas/engine
- **Basis Universal transcoder** (Apache-2.0) and **Draco decoder** (Apache-2.0), as built by PlayCanvas
  (`public/lib/basis`, `public/lib/draco`, from playcanvas/engine `examples/assets/wasm`).

## Build tools (not shipped)

glTF Transform (MIT), meshoptimizer (MIT), ktx2-encoder (MIT, wraps Basis Universal), draco3dgltf (Apache-2.0),
sharp (Apache-2.0), Vite (MIT), Playwright (Apache-2.0).

## Sound

All current sounds are synthesised in `src/ambience.js` (no third-party audio).

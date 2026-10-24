# Refrigerator and water jar

The existing refrigerator and the new water jar both reuse **Modern Apartment** by **Visthétique**, licensed **CC BY 4.0**:

- Model: https://sketchfab.com/3d-models/modern-apartment-1fbb649cd6624f2bb7b7d6e30c6533a5
- Author: https://sketchfab.com/visthetique
- License: https://creativecommons.org/licenses/by/4.0/
- Original asset/source and the apartment's other credits: [CREDITS.md](CREDITS.md).

The original source was already downloaded into `assets-src/modern_apartment/` via `tools/fetch-source.mjs`. No third-party asset with uncertain licensing was added.

## Adaptations

- The refrigerator's actual detailed metallic upper leaf, opaque front face and black gasket are separated from the committed apartment **at runtime**; the author's normals, UVs and PBR maps are preserved. The lower freezer is unchanged. Only the original body's small front cap is removed to expose a genuine cavity. The body's sides and back remain as physical shadow occluders. Classifier bounds are measured in `src/fridge-geometry.js`, and tests decode the actual committed model to prove that unrelated kitchen geometry remains untouched.
- The jar is the author's existing **hollow glass jar** from `KDecor_Glass_0`, reused at 1.4 times its original size (approximately 14.3 cm wide and 28.3 cm tall), with no new generated jar model. `public/assets/props/water-jar.json` contains its normalized positions, authored smooth normals and original indices: 5,184 vertices, 2,620 triangles, approximately 327 KB before HTTP compression. The JSON preserves source attribution/license metadata.
- `tools/extract-water-jar.mjs` reproduces that JSON from the downloaded original. Run `node tools/fetch-source.mjs` if source files are absent, then `node tools/extract-water-jar.mjs`. Regenerating the large apartment build is unnecessary.
- The fitted cavity is functional cabinet geometry: lining, gasket, clear shelves, satin shelf supports, a crisper front, inner door skin, three attached bins and a recessed LED diffuser. Its white ABS lining and glass surfaces clone the authored apartment's `White1@main` and `Glass@main` materials, then tune roughness/opacity for these surfaces. The source white material has no texture map; no fake texture was substituted.
- The small still-water mesh is functional liquid geometry fitted to the jar's **actual inner walls and rounded floor**. Its level is 7+ cm below the jar's mouth. It has a subtle meniscus, nonemissive clear material and real environment reflections. Transparent glass and water do not cast opaque hard silhouettes. Opaque shelf supports, liner and door remain shadow casters.

## Interaction and lighting

`await Fridge.create({app, apartment, interactions, grid, player, sounds, recapture, configureMaterial})` loads the small jar JSON. Construct it before the first probe capture, and assign its new materials to the main-room probes with `configureMaterial: material => probes.assign(material, 'main')`.

E (or the existing left-click action) near the front/handle toggles the upper door. It eases to 106 degrees around the measured right hinge. Its interaction target follows the leaf. The door is a dynamic collision segment and stops against the player; the next press reverses the requested direction. The original static collision grid still blocks entry into the cabinet.

A cool-white interior light at `[0,1.935,0.18]` in fridge-local coordinates is physically below the recessed diffuser. It uses inverse-square falloff, shadow casting and a short 1.65 m range. It starts **off**. Opening releases the seal and enables the light; closing turns both source and lens emission completely off. The opaque cabinet and door block it from leaking through the closed appliance. Near lamps' shadows refresh during the swing; room bounce/reflections recapture once the door settles, rather than every frame.

The class exposes `light`, `glow`, `baseIntensity`, `applyLighting()`, `angle`, `openRequested`, `moving`, `door`, `jar`, `water`, absolute `waterLevel` and `jarHeight` for tests and developer tooling. The developer menu should treat it as an owned Kitchen fixture, hand it back on an actual door toggle and call `applyLighting()` when returning to switches.

## Verification

`node --test tools/check-fridge.mjs` checks the actual source split/open cavity, unchanged lower freezer/kitchen, rigid hinge, water-to-glass clearance at every water-mesh vertex, shelf/door-bin clearance, opening/reversing, seal light state and player collision. Six tests pass. Browser/native-action and visual results are recorded in the review notes after integration.

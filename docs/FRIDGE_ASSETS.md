# Refrigerator, water jug and glass

The refrigerator reuses **Modern Apartment** by **Visthétique**, licensed **CC BY 4.0** (the jug and glass are downloaded separately since build 0.12, below):

- Model: https://sketchfab.com/3d-models/modern-apartment-1fbb649cd6624f2bb7b7d6e30c6533a5
- Author: https://sketchfab.com/visthetique
- License: https://creativecommons.org/licenses/by/4.0/
- Original asset/source and the apartment's other credits: [CREDITS.md](CREDITS.md).

The original source was already downloaded into `assets-src/modern_apartment/` via `tools/fetch-source.mjs`. No third-party asset with uncertain licensing was added.

## Adaptations

- The refrigerator's actual detailed metallic upper leaf, opaque front face and black gasket are separated from the committed apartment **at runtime**; the author's normals, UVs and PBR maps are preserved. The lower freezer is unchanged. Only the original body's small front cap is removed to expose a genuine cavity. The body's sides and back remain as physical shadow occluders. Classifier bounds are measured in `src/fridge-geometry.js`, and tests decode the actual committed model to prove that unrelated kitchen geometry remains untouched.
- **Build 0.12:** the owner found the reused decor jar (scaled up 1.4x) and the apartment's table glass odd, so both were
  replaced by downloaded models (credits in [CREDITS.md](CREDITS.md)):
  - **Water jug:** "Glass Water Jug (High Poly)" by ShotaB, CC BY 4.0: a classic tapered glass pitcher, 16.1 x 22.0 x
    13.9 cm, 1.6 mm wall, waist ring, spout and hollow handle (1.5 L at the waist ring). It stands on the middle shelf
    (`FRIDGE.jug`, turned `jugYaw` -60 degrees so its handle faces front-right).
  - **Drinking glass:** RagingCow's "highball glass" (CC BY 4.0), its inside-out source winding fixed, scaled to 12.6 cm
    (7.3 cm across, about 300 ml) to match the arm's grip; on the same shelf at `FRIDGE.glass`.
  - Both normalised GLBs (metres, Y up, base at y = 0, axis at x = z = 0) are kept in `assets/props/` with their licence
    notes; `node tools/extract-props.mjs` writes the runtime meshes `public/assets/props/water-jug.json` and
    `drinking-glass.json` with attribution and each vessel's measured `interior` ([y, inner radius] profile, floor, brim).
- The fitted cavity is functional cabinet geometry: lining, gasket, clear shelves, satin shelf supports, a crisper front, inner door skin, three attached bins and a recessed LED diffuser. Its white ABS lining and glass surfaces clone the authored apartment's `White1@main` and `Glass@main` materials, then tune roughness/opacity for these surfaces. The source white material has no texture map; no fake texture was substituted.
- The still water (`src/fridge-water.js`) follows the jug's measured inner wall 1.2 mm inside it, with a closed floor; its level is 14 cm (about 1.3 L), below the waist ring. It has a subtle meniscus, nonemissive clear material and real environment reflections. Transparent glass and water do not cast opaque hard silhouettes. Opaque shelf supports, liner and door remain shadow casters.

## Interaction and lighting

`await Fridge.create({app, apartment, interactions, grid, player, sounds, recapture, configureMaterial})` loads the jug and glass meshes. Construct it before the first probe capture, and assign its new materials to the main-room probes with `configureMaterial: material => probes.assign(material, 'main')`.

E (or the existing left-click action) near the front/handle toggles the upper door. It eases to 106 degrees around the measured right hinge. Its interaction target follows the leaf. The door is a dynamic collision segment and stops against the player; the next press reverses the requested direction. The original static collision grid still blocks entry into the cabinet.

A cool-white interior light at `[0,1.935,0.18]` in fridge-local coordinates is physically below the recessed diffuser. It uses inverse-square falloff, shadow casting and a short 1.65 m range. It starts **off**. Opening releases the seal and enables the light; closing turns both source and lens emission completely off. The opaque cabinet and door block it from leaking through the closed appliance. Near lamps' shadows refresh during the swing; room bounce/reflections recapture once the door settles, rather than every frame.

The class exposes `light`, `glow`, `baseIntensity`, `applyLighting()`, `angle`, `openRequested`, `moving`, `door`, `jug`, `water`, `glass`, absolute `waterLevel` and `jugHeight` for tests and developer tooling. The developer menu should treat it as an owned Kitchen fixture, hand it back on an actual door toggle and call `applyLighting()` when returning to switches.

## Verification

`node --test tools/check-fridge.mjs` checks the actual source split/open cavity, unchanged lower freezer/kitchen, rigid hinge, water-to-glass clearance at every water-mesh vertex, shelf/door-bin clearance, opening/reversing, seal light state and player collision. Since 0.12 it also checks the jug's water against the jug's real walls and that jug and glass stand on the shelf clear of each other, the walls, the door bins and the shelf above. The interior light is a downward spot since 0.12 (one shadow view while the door swings, not six). Native browser E open/close/reopen passed with no unexpected page, console or request errors. The hosted WebGPU check also opened the final build through native E, confirmed full interior intensity and final jar bottom y=1.333600 (0.6 mm above the shelf), and verified that both flashlight shadow maps remained realtime after fridge/probe updates. Review notes and comparisons are in [REVIEW_10.md](REVIEW_10.md).

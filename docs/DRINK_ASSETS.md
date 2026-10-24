# Drinking interaction assets

The visible hand is a downloaded textured and rigged game asset. Its authored hand surface was not generated or built from primitives. The drinking sounds are downloaded human recordings.

## Hand and forearm

- **Rigged hand** by **Elena FF**: https://sketchfab.com/3d-models/rigged-hand-eae97cc2a742413cb5338ab942b12c1e
- Author: https://sketchfab.com/elenaferfor
- License: **CC BY-SA 4.0**, https://creativecommons.org/licenses/by-sa/4.0/
- Downloaded mirror, pinned to the reviewed commit: https://github.com/bizzkoot/Hand-Math/blob/4229f71c17cf7daf8ed060569b27c25b9697f687/assets/models/hand_right.glb
- The source license is also embedded in `asset.extras` and recorded by that repository's `assets/license.txt`.
- Source SHA256: `11fcdb53fd5c134a658dc93a8c331c4e9bb13df5f978aff44590e484ef5ceb11`.

Runtime asset: `public/assets/props/drinking-hand.glb`, about 2.23 MB. The single skin has 16,330 vertices, 28,994 triangles, 69 joints including source control/end joints, and three embedded skin textures: base color, metallic/roughness and specular. Its original **Open/Close** animation remains in the GLB: 3.208 seconds, open at time 0, closed around 0.8–1.2 seconds, returning open near the end. The interaction samples its finger motion up to **0.47 seconds** and blends three thumb-joint pose overrides to oppose the fingers across the tumbler. These are runtime poses of the downloaded rig; the source animation file is retained.

The adaptation retains the original hand surface, topology, UVs, skin weights, rig, inverse bind matrices, embedded textures and animation. The existing wrist loops are lengthened 74 cm and widened toward the distant end to keep an attached arm extending out of view, including during the shelf reach. Normals are rebuilt on that adapted wrist surface. No new hand or finger geometry is created. A rigid parent transform puts the wrist at the origin in metres: fingers point **+Y**, the palm faces **-Z**, the back of the hand faces **+Z**, and the thumb is on **-X**. Open wrist-to-middle-tip distance is approximately 19 cm; the arm ends about 75 cm behind the wrist. The distant arm section must stay outside the player's view.

The adapted hand remains **CC BY-SA 4.0**. Attribution and modification notices ship beside it as `drinking-hand.LICENSE.txt` and remain embedded in the GLB. Preserve those notices and the license when distributing or modifying this asset.

Reproduce the adaptation with `python tools/prepare-drinking-hand.py` (Python 3 and NumPy). The script downloads the checksum-pinned source to `work/asset-research/` if absent. It evaluates the original glTF skin and first open animation sample directly, modifies only the existing wrist vertices, and preserves all other binary data. A blind Blender re-export is avoided: its importer interprets some of the source's control-bone rest matrices differently, while the original glTF skin and animation evaluate correctly.

During preparation, the source's open and closed poses were evaluated from the actual glTF skin matrices and animation data, then rendered with the original UV-mapped skin in Blender. Open, closed and adapted-forearm previews were inspected for intact fingers, skin, nails, orientation and connected wrist geometry. These asset previews do not substitute for the in-game grip and camera checks.

The grip was also rendered from the actual skinned geometry against a cylinder matching the tumbler's 79 mm outer diameter and 139.5 mm height. `tools/drinking-grip-reference.json` records the source checksum, fixed clip time, coordinate basis, measured palm anchor, cylinder dimensions, thumb-joint local quaternion endpoints and inverse-kinematics target positions. The source wrist remains static across this clip; its original fist motion needs a separate thumb opposition pose for a wide glass. The local palm anchor is `[0, 0.099, -0.013]` in canonical metres. Keeping the palm, fingers and glass on one rigid transform during lift/tilt prevents their relative placement drifting with camera movement. The extended arm must still be reviewed in actual first-person reach, lift and sip views.

## Glass

`public/assets/props/drinking-glass.json` reuses the apartment author's existing glass, extracted by `tools/extract-drinking-glass.mjs`. It shares **Modern Apartment** by **Visthétique**, **CC BY 4.0**, and retains attribution metadata. See [CREDITS.md](CREDITS.md) and [FRIDGE_ASSETS.md](FRIDGE_ASSETS.md) for the source apartment and jar.

## Recorded drinking and relief

| Runtime file | Recording and author | Original source | License | Duration |
| --- | --- | --- | --- | --- |
| `public/assets/audio/drink-water.wav` | Drink / Drinking liquid — Breviceps | https://freesound.org/people/Breviceps/sounds/445970/ | CC0 1.0 | 0.568 s |
| `public/assets/audio/drink-relief.wav` | Exhale_10115a.wav — otherthings | https://freesound.org/people/otherthings/sounds/65619/ | CC0 1.0 | 1.243 s |

The recordings were downloaded from the `Wh1teDuke/WilhelmSFX` GitHub mirror; the original Freesound pages' CC0 licenses were checked on 2026-10-24. The WAV bytes are unchanged, stereo 44.1 kHz, 16-bit. `public/assets/audio/drink-sources.json` records each original URL, mirror URL/blob SHA, SHA256, duration and license URL. The gulp is a short human take, suitable for separately timed sips; the relief is a natural exhale. Other ambience and fixture feedback remain in the existing synthesized sound system.

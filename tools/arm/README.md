# Drinking arm: first-person right arm (sleeve + hand), from Microsoft Rocketbox

Deliverables in this folder:

| File | What |
|---|---|
| `drinking-arm.glb` | glTF 2.0 binary, metres, one skinned mesh (one primitive, one material), 18 joints. 1,085,944 bytes. SHA256 `5bf40ad8808da17e52bb0537fefa4b897c1c9c4d500bd1bd8ed5a76c4d594735` |
| `arm-data.json` | joints, rest transforms, landmark points, bone lengths, axes, `relaxed` and `grip` finger poses, the grip's glass cylinder |
| `preview/final/*.png` | 800x600 PlayCanvas 2.23.1 renders with the real textures (see Previews) |
| `preview/overview.png` | the nine previews on one sheet |
| `scripts/`, `viewer/` | everything that produced the above (Regenerate) |

Not integrated into the game; nothing under `src/`, `public/`, `tools/` or `docs/` was touched.

## Source and licence

- Library: Microsoft Rocketbox Avatar Library, https://github.com/microsoft/Microsoft-Rocketbox
  (commit `0943055db6ec570bcef9f2c8b41c9e5467c808f9`, branch `master`). Licence: **MIT**,
  "Copyright (c) 2020 Microsoft"; the full text is `downloads/Male_Adult_13/LICENSE.md`
  (https://github.com/microsoft/Microsoft-Rocketbox/blob/0943055db6ec570bcef9f2c8b41c9e5467c808f9/LICENSE.md).
- Avatar: **Male_Adult_13** (grey knit sleeves with a ribbed cuff, under an argyle vest; the vest is not
  part of the arm). Chosen from the 21 male adults + 7 business men preview sheets for a plain, neutral,
  full-length sleeve that reaches the wrist. The avatar wears a finger ring; it is dropped (see Caveats).
- Files used, fetched one by one from `raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/<commit>/` (they are
  plain git blobs, not LFS) into `downloads/Male_Adult_13/`:

| Repository path | SHA256 |
|---|---|
| `Assets/Avatars/Adults/Male_Adult_13/Export/Male_Adult_13.fbx` | `2898a6ff32144aed2fa57f383dfb9401580ad8b6f2c2857d06a7efdfe94b3f9a` |
| `Assets/Avatars/Adults/Male_Adult_13/Textures/m010_body_color.tga` | `af8d799127f243c9db2134de1fe1b93d99eacee4affadf27d5af77bb57b1db89` |
| `Assets/Avatars/Adults/Male_Adult_13/Textures/m010_body_normal.tga` | `aa410f558a30a5ceecabfde7ecfc6504d33f5bb7060a0629d20d1a81ebca7328` |
| `Assets/Avatars/Adults/Male_Adult_13/Textures/m010_body_specular.tga` | `fb9c26af298dd0d623ce979a5519f027e3b73ca2fecda222b9645aec76119367` |
| `LICENSE.md` | `17474e386e0b9e1a700cc3d06b2b0882a2c376d9c6b49c7f8274409b8f8d2352` |

  Also in `downloads/` (inspection only, not used by the build): a blobless tree-only clone for file listings
  (`rocketbox-tree/`), the avatar preview PNGs used to choose (`previews/`), the `_facial.fbx` variant (checked: same
  6,710-triangle mesh plus face blendshapes, so the plain Export FBX is already the "hipoly" level), the README, and the
  npm `gltf-validator@2.0.0-dev.3.10` package (`npm-gltf-validator/`).
- The licence and attribution are also in the GLB: `asset.copyright` and `asset.extras`
  (`source`, `sourceCommit`, `sourceFiles`, `avatar`, `library`, `license: "MIT"`, `licenseUrl`, `attribution`,
  `modifications`, `frame`). Each joint node carries `extras.biped` (its 3ds Max Biped source bone).
- Credit line for the game's credits:
  `First-person arm: "Male_Adult_13" from the Microsoft Rocketbox Avatar Library (https://github.com/microsoft/Microsoft-Rocketbox), Copyright (c) 2020 Microsoft, MIT License; cut, re-rigged and re-textured for this game.`

## Frame and skeleton (what the game relies on)

Normalised rest pose, metres, right-handed:

- origin = the wrist joint (`hand_r`);
- **+Y** wrist -> middle-finger knuckle: fingers point +Y, forearm and upper arm extend along -Y (straight arm);
- **+X** toward the little finger: the thumb is on **-X** (a right hand);
- **+Z** the back of the hand: the palm faces **-Z** (`points.palmNormal` = [-0.18, 0.12, -0.98]).

That is the convention the current drinking code uses for its hand (wrist 0, fingers +Y, thumb -X, back +Z).

Joints, in hierarchy order (all rest rotations are **identity**; translations in `arm-data.json` `joints[].restLocal`):

```
upperarm_r (0, -0.5567, 0)            Bip01 R UpperArm   (the mesh starts 7 cm below it, at y = -0.4867)
 forearm_r (0, -0.2709, 0)            Bip01 R Forearm
  hand_r   (0, 0, 0)                  Bip01 R Hand
   thumb_01_r thumb_02_r thumb_03_r   Bip01 R Finger0, Finger01, Finger02
   index_01_r  index_02_r  index_03_r Bip01 R Finger1x
   middle_01_r ...                    Bip01 R Finger2x
   ring_01_r   ...                    Bip01 R Finger3x
   pinky_01_r  ...                    Bip01 R Finger4x
```

The source has no forearm/upper-arm twist bones, so there is none here. Do pronation/supination on `forearm_r`
(the sleeve hides the rigid twist), not on `hand_r`.

Scene roots are the mesh node `drinking_arm` and the skeleton root `upperarm_r` (glTF wants skinned meshes at the
root); `instantiateRenderEntity()` puts both under one entity, as with the old hand.

## arm-data.json

- `joints[]`: name, parent, Biped source name, `restLocal` {translation, rotation [x,y,z,w]}, `restPosition`.
- `points`: `shoulder` (upper-arm joint), `elbow`, `wrist` (0,0,0), `palmCentre` (on the palm skin, by ray cast)
  and `palmNormal`, `fingertips` (end of each finger on its bone line), `knuckles`, `cutEnd` (where the mesh stops).
- `wristToPalm` = `palmCentre` = [0.0043, 0.0526, -0.0261].
- `boneLengths`: upperArm 0.2858, forearm 0.2709, hand 0.0956 (wrist -> middle knuckle), upperArmKept 0.2158, and
  the three segment lengths of each finger (last one to the fingertip).
- `elbowBendAxis` = [-0.229, 0, 0.973]: rotate `forearm_r` about it (in its parent frame, = the hand frame at rest)
  by a **positive** angle to flex the elbow; the wrist then moves toward -X (the thumb side), as a forearm in the
  neutral thumb-forward position does. It is the avatar's own bind-pose elbow bend (20.7 deg), carried into the
  straightened pose, so it is the axis the elbow's skin weights were made for.
- `fingerFlexAxes` / `jointAxes`: the source rig's bone axes in the hand frame (Biped: x along the bone, y toward
  the pad, z the bend axis; positive rotation about z flexes). Useful for procedural curls.
- `poses.rest` (identity), `poses.relaxed`, `poses.grip`: local quaternions [x,y,z,w] for all 15 finger/thumb joints
  (the arm joints stay identity). Slerp from identity / between poses.
  - relaxed: a cascade (index 10/16/8 deg ... little finger 22/28/14 deg at MCP/PIP/DIP), thumb eased in 8 deg.
  - grip: a 72 mm glass. Fit on the shipped GLB by a vectorised search per finger (every MCP/PIP/DIP triple, linear
    blend skinning of the real vertices): no vertex inside the glass beyond 1 mm, the pad of every segment touching,
    DIP ~ 2/3 PIP; the glass placement (across the palm under the knuckles, axis tilted 12 deg) chosen among 12 by
    contact. The thumb base was searched over its three rotations (roll/swing/flex about the source bone axes), then
    MCP/IP, for the widest opposing wrap that touches. Result (`grip.check`): **max penetration 0.98 mm** over
    every vertex against the finite 72 x 120 mm glass; every finger and the thumb touch (end segments within ~1 mm of
    the surface); thumb wraps 131 deg round the glass on the opposite side to the fingers, 12.6 mm above the index.
- `grip.cylinder`: `centre` [0.0090, 0.0901, -0.0565], `axis` [-0.978, 0.208, 0] (the glass's UP: toward the thumb
  and index side), radius 0.036, height 0.12, in the hand frame (hand_r at rest; the grip only moves finger joints).
  To hold the glass upright, orient `hand_r` so that `axis` maps to world up and put the glass centre at `centre`.
  The centre is the mid-height of a 120 mm glass whose rim is 25 mm above the index finger; any point on the axis
  line works for another height.

## What was changed (scripts/build_arm.py)

1. **Cut**: body-material triangles of the right arm, clipped exactly by the plane 7 cm down the upper arm from the
   shoulder joint (after straightening the upper arm lies on -Y, so the cut is the plane y = -0.4867; triangles are
   split, so the open end is a clean ring). Off-arm pieces dropped, largest connected piece kept. The ring finger's
   ring (20 triangles, separate piece) dropped (`--ring` keeps it, as metal).
2. **Re-weighting**: weights on every other bone (clavicle, spine, neck) moved to `upperarm_r` (nearest kept bone);
   4 influences, renormalised.
3. **Straightening**: the bind pose's elbow (20.7 deg) and wrist (4.0 deg) bends taken out by linear blend skinning to
   a straight pose (upper arm and forearm on the wrist -> middle-knuckle axis); hand and fingers untouched.
4. **Normalisation** to the frame above, metres; identity joint orientations; inverse bind matrices = translations.
5. **Smoothing**: PN-triangle tessellation (each source triangle -> 9) on the author's normals, crack-free across UV
   seams; UVs and weights linear, normals quadratic; PN offsets fade on sharply bending edges (finger crotches) so no
   surface folds (0 back-facing sub-triangles). No decimation (the source arm is only 1,031 triangles).
6. **Normals fixed** where the cuff meets the skin: the source shares one averaged normal there (pointing up the arm),
   which lit a bright wedge on the palm heel; those 22 vertices take their own side's face normals. Tangents
   (MikkTSpace-style, per-vertex, glTF convention, handedness from each triangle's UV orientation) are included.
7. **Textures** (cropped from the 2048 body atlas at native density, UVs remapped; 568 x 1008, NPOT):
   - base colour: JPEG q92 4:4:4 (sRGB); a mild unsharp mask on the skin (0.35, sigma 1.2 texels);
   - normal: PNG, copied as is: the Rocketbox map is already **green-up (OpenGL/glTF)**, measured with
     `scripts/normal_convention.py` (normal-map divergence vs. the colour map's baked cavities: +0.19/+0.51 on
     hand/sleeve for green-up);
   - metallic-roughness: JPEG; G = roughness from the specular map: skin 0.60 -> 0.47 with specular (median 0.57),
     nails ~0.35, sleeve 0.86 +/- 0.04 from the knit's brightness (the source specular is flat on cloth); B = metal
     0 (`metallicFactor` 0);
   - **seam levelling** on the skin (the hand island's palm and back halves meet along the finger sides and on the
     palm heel, where the source maps do not match): colour, normal and roughness corrections spread from both sides
     of every seam (mean colour step across seams 0.026 -> 0.007);
   - gutters push-pull filled from the islands so mip-maps never pull in the atlas's black/white gutters.

Counts: **9,279 triangles, 4,964 vertices, 18 joints**, max 4 influences, 1 material, 3 embedded images
(141 KB colour JPEG, 454 KB normal PNG, 73 KB metal-roughness JPEG). glTF-Validator 2.0.0-dev.3.10:
0 errors, 0 warnings, 3 infos (NPOT images).

## Previews (preview/final, PlayCanvas 2.23.1 from the repo, headless Chromium, SwiftShader)

`rest_dorsal`, `rest_palm`, `rest_side` (rest pose, 3 angles); `grip_near_side` (roughly the first-person side:
thumb across the near side), `grip_far_side` (fingertips on the glass), `grip_back_of_hand` (grip, 72 x 120 mm
translucent cylinder); `closeup_nails`, `closeup_back`, `closeup_palm` (relaxed pose, skin and nails). Key / fill /
rim directional lights that follow the camera, ACES, sRGB; the key casts PCF shadows except in `closeup_palm`
(software GL leaves a few shadow-acne specks on grazing skin; checked against a shadowless render: not geometry).

## Regenerate

```sh
sh work/arm/scripts/make_all.sh            # build -> fit -> copy -> validate -> previews (about 2 min)
```

Steps it runs: `python3 -I scripts/build_arm.py downloads/Male_Adult_13 build` (GLB, textures, build-facts.json),
`python3 -I scripts/fit_poses.py build` (arm-data.json), `node scripts/validate_glb.mjs`,
`node scripts/render_previews.mjs viewer/views-final.json preview/final` (PlayCanvas page `viewer/index.html`).
Tools: Python 3.13 + numpy 2.5 + Pillow 12.3 (no other Python packages; the binary FBX reader in `scripts/rbx_fbx.py`
is adapted from /home/user/GTA/tools/player_model.py), Node 22 with the repo's `playcanvas`, the global `playwright`
(Chromium already installed; no `playwright install`), npm `gltf-validator` (validation only). No Blender/FBX2glTF.
Other scripts: `inspect_avatar.py`, `fbx_objects.py`, `analyze_arm.py`, `analyze2.py`, `uv_overlay.py`
(exploration), `ortho_check.py` / `thumb_explore.py` (grip debugging splats), `contact_sheet.py`, `grid.py`, `crop.py`.

## Caveats for the integrator

- **Texel density** is the source's: the hand gets ~1.5 texels/mm (the whole hand is ~568 x 360 texels). Fine at
  first-person distance, soft in extreme close-up. A tiling skin-pore detail normal map would help but would have to
  be another downloaded asset.
- **Low source poly count** (1,031 triangles for the arm) is smoothed by PN tessellation; silhouettes are round, but
  the shapes are Rocketbox's (e.g. folds in the upper sleeve, a slightly tight cuff).
- **Grip shape**: the fingers wrap ~95-115 deg round a 72 mm glass from the knuckles (that is all ~85 mm fingers can
  do on that diameter); the glass sits against the distal palm under the knuckles (the rigid palm cannot cup), MCPs
  flex little (index 7, middle 22, ring 18, little -3 deg), PIPs 15-31, DIPs 10-15; the thumb's MCP is slightly
  hyperextended (-16 deg), IP straight. Thumb and fingers are 66+ mm apart, adjacent finger bones >= 14 mm apart.
- **Old hand quirks** that no longer apply: no authored animation clip; drive the fingers from `poses.*`.
- **Skin shading**: plain metallic-roughness (no subsurface); skin roughness 0.47-0.6. If the game wants softer skin,
  a sheen or a slight wrap term on the skin texels (where roughness < 0.65) is the place.
- The open end at the shoulder is a clean planar ring; it is see-through from inside (single-sided), keep it
  off-screen. Textures are NPOT (568 x 1008): fine for WebGL2/WebGPU mip-mapping; KTX2/Basis needs multiples of 4,
  which they are.
- The ring on the source avatar's ring finger is removed; the skin under it is the source's (no visible mark).

# Drinking interaction assets (build 0.12)

Everything the player sees and hears while drinking is downloaded; nothing is modelled from primitives.

## First-person arm

- **Source:** "Male_Adult_13" from the **Microsoft Rocketbox Avatar Library**, https://github.com/microsoft/Microsoft-Rocketbox
  (commit `0943055db6ec570bcef9f2c8b41c9e5467c808f9`). Copyright (c) 2020 Microsoft, **MIT License**. The avatar wears a
  grey knit jumper: its full-length sleeve with a ribbed cuff covers the arm, so the cut near the shoulder is never seen.
- **Runtime:** `public/assets/props/drinking-arm.glb` (1.09 MB: one skinned mesh, 9,279 triangles, 18 joints, base
  colour / normal / metallic-roughness textures embedded at 568x1008), `drinking-arm.json` (rig data, below) and
  `drinking-arm.LICENSE.txt` (MIT text and the change notice; also linked from the start screen's credits).
- **Made by** `tools/arm/` (`make_all.sh`: a pure-Python FBX reader adapted from the sibling GTA project, numpy and
  Pillow; no Blender). It cuts the right arm out of the avatar, keeps its real UVs and skin weights, re-weights everything
  onto upper arm, forearm, hand and the 15 finger joints, gives every joint an identity rest rotation in a wrist-origin
  frame, converts the Rocketbox colour/normal/specular maps to glTF PBR, fixes three source flaws (a bright wedge on the
  palm heel from shared cuff/skin normals, texture seams on the hand, the finger ring dropped) and fits the finger poses.
  Source files, SHA256s and every step are in `tools/arm/README.md`; the downloads (about 200 MB) are not committed.

### Rig conventions (what `src/arm-rig.js` relies on)

- Metres. Origin = the wrist joint (`hand_r`). Fingers point **+Y**; forearm and upper arm run straight along **-Y**
  (elbow at y = -0.271, shoulder joint at y = -0.557; the mesh starts 7 cm below the shoulder). Thumb on **-X**, back of
  the hand **+Z**, palm **-Z**. Every rest rotation is identity, so a pose is a local rotation slerped from identity.
- Joints: `upperarm_r > forearm_r > hand_r > thumb_01..03_r, index_, middle_, ring_, pinky_01..03_r`.
- `drinking-arm.json`: `boneLengths` (upper arm 0.2858, forearm 0.2709), `elbowBendAxis` (a positive rotation of the
  forearm about it flexes the elbow), `poses.relaxed` and `poses.grip` (local quaternions for the 15 finger joints),
  `grip.cylinder` (the glass axis and centre in the hand frame for the grip: all fingertips and the thumb touch a 72 mm
  glass within ~1 mm, at most 0.98 mm interpenetration), `wristToPalm`, landmark `points`.
- No twist bones: pronation is carried by the forearm (under the sleeve), so the wrist only bends.

### How the game poses it (`src/arm-rig.js`, `src/drink-sequence.js`, `src/drink-timeline.js`)

- The arm hangs in camera space under the camera, drawn only by the player's camera (`MeshInstance.isVisibleFunc`), so
  probe captures never bake it into reflections. It casts no shadow.
- `ArmRig.pose(shoulder, wrist, handRotation, {open, grip})`: two-bone IK from a shoulder 19 cm right, 25 cm below and
  9 cm behind the eye (`SHOULDER`) to the wrist, the elbow bending down and out (`ArmRig.POLE`); if the wrist is out of
  reach the shoulder follows (it is never in view). Fingers blend relaxed -> open -> grip.
- `gripInGlass()` turns the asset's grip into the hand's pose in the glass's own frame, palm on the glass's right and a
  little towards the eye (`GRIP_SIDE`); while the glass is held, the hand is exactly that pose relative to the glass, so
  it cannot slip. The glass is round, so at the start it is turned about its own axis to face the way the player looks.
- Timeline (9 s, pausable, tab-hide safe): the eyes go to the glass and the body leans in as far as the arm needs (up to
  60 cm: a small step), the hand comes up from below the view, opens beside the glass, closes on it (0.86-1.18 s), lifts
  it 2.5 cm clear of the shelf, swings it to the chest, then to the lips; three sips with small swallows while the head
  tips back 7 degrees and the glass tips from 48 to 72 degrees as it empties; back to the chest, onto the shelf, the hand
  opens, slides back and drops out of view. Reduced motion: the glass is simply in hand, no reach, no camera motion.
- Checks: `tools/check-drink-sequence.mjs` drives the real joint hierarchy without a GPU: the wrist reaches its target
  within 1 mm all the way through, the glass centre stays at the fitted grip within 1.5 mm, the sleeve's open end never
  enters the view frustum, the elbow never folds past 150 degrees and the wrist never bends past 80, the camera framing
  never jumps and the original view and position come back at the end.

## Glass, jug and water

See [FRIDGE_ASSETS.md](FRIDGE_ASSETS.md). The tumbler is "Glass Collection" by RagingCow (its highball glass, CC BY 4.0),
scaled to 12.6 cm so the arm's 72 mm grip fits it; `src/drink-timeline.js` `GLASS_INTERIOR` follows its measured, slightly
tapered inner wall (23.7 mm radius at the floor to 33.5 mm at the rim, 0.6 mm clearance), and the water's free surface
stays level in the world whichever way the glass and camera turn.

## Sound

| Runtime file | Recording and author | Original source | License |
| --- | --- | --- | --- |
| `public/assets/audio/drink-relief.wav` | Exhale_10115a.wav — otherthings | https://freesound.org/people/otherthings/sounds/65619/ | CC0 1.0 |
| `public/assets/audio/glass-break.wav` | Glass Break — unfa (trimmed to the impact, 48 kHz) | https://freesound.org/people/unfa/sounds/221528/ | CC0 (credited; older listings say CC BY 3.0) |

Only the refreshed exhale plays while drinking (after the last sip); the owner asked for no gulping, so the 0.11 gulp
recording was removed. `drink-sources.json` keeps the exhale's provenance. The glass break is the falling-glass event
(`src/falling-glass.js`).

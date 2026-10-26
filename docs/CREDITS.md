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

### Build 0.13: the intruder, the story's things, the recordings, the type

- **The intruder**: "Male_Adult_18" and its animations (walks, run, crouch, idles, listening and trying doors, taking a
  picture, texting) from the **Microsoft Rocketbox Avatar Library** (MIT, commit `0943055`), converted and retargeted
  by `tools/intruder/` (FBX2glTF, BSD; glTF Transform): clothes, head and hands dyed black (hood, balaclava, leather
  gloves). Runtime `public/assets/props/intruder.glb` + `intruder.LICENSE.txt`. "Male_Adult_20" (charcoal hoodie,
  unmasked) is kept in `assets-src/intruder/intruder-plain.glb` and only used to bake the sleeper in the camera clips.
- **His mask: "White Mask"** by shedmon (https://sketchfab.com/shedmon), **CC BY 4.0**,
  https://sketchfab.com/3d-models/white-mask-c0d85900a7be438c8d2400bb71649d31 . Downloaded from the
  `discover3d/godot_game_101` GitHub mirror (commit `242e1d6`, `tools/intruder/mask.json`; licence text in the
  mirror's `license.txt`). Fitted to the head bone, textures resized to 1024/512 px; baked into `intruder.glb`.
  Replaced in build 0.14 by "Porcelain Mask" (below); no longer ships.
- **The story's props** (`public/assets/props/story/*.glb`, built by `tools/props/build.mjs` from
  `tools/props/props.json`, each download pinned to a commit and checked against `tools/props/sources.lock.json`;
  every licence and source is listed in `public/assets/props/story/LICENSES.txt`):
  - CC BY 4.0 (Sketchfab, via GitHub mirrors; the licence is embedded in each glTF's `asset.extras`): "iPhone 17 Pro" by
    Ranguel (the phone, from build 0.15: its maker's logo filled in, recoloured graphite, planar UVs on its screen, which
    shows the game's canvas; until 0.14 "Smartphone" by Naudaff3D) · "Prescription Pill Bottle" by 3Dexter (label repainted
    for the story's zolpidem prescription) · "Note Book [2K]" by Lyndschoko (the sleep diary) · "door keys" by
    artemtem (the spare keys; one of its keys alone is the old key in the nest) · "Water Bottles" by HGowl (two loose
    bottles) · "Papers & Envelopes" by bossdeff (one envelope: the returned letter) · "Polaroid pictures" by
    maria.jardan (three of its photos; their blood smears painted out and the photos replaced by the baked night shot
    of your bed) · "Wood Clothes Hanger" by tedpermana.
  - CC BY 4.0, **Google Scanned Objects** (Google Research), via `kevinzakka/mujoco_scanned_objects`: "Provence Bath
    Towel, Royal Blue" (dyed charcoal: the nest's folded blanket) · "Remington T|Studio Hair Dryer" (in the basin).
  - CC0 1.0, **Poly Haven**: "Power Box 01" by Rico Cilliers and Yann Kervran (the fuse box: its own levers, RCD and
    main switch split out to move, its cover hinged) · "Cleaner Tin 01" by Tom Phillips · "Alarm Clock 01" by James
    Ray Cock and Yann Kervran (hands on pivots, 03:07) · "Wooden Bowl 01" by Oliver Harries (the empty key bowl) ·
    "Security Camera 02" (the Home Cam on the bedroom wall).
- **Recordings** (`public/assets/audio/sfx/*.mp3`, 78 sounds; built by `tools/audio/build.mjs` from
  `tools/audio/sounds.json`, which lists each one's author, title, licence, original page and GitHub mirror, pinned in
  `sounds.lock.json`): real recordings from Freesound and OpenGameArt contributors, CC0 and CC BY 3.0/4.0, trimmed,
  made mono, levelled and faded. The credits screen lists every author with the titles used (`src/credits.js` reads
  `sfx.json`).
- **Caveat** (the handwritten notes) by the Caveat Project Authors, SIL Open Font License 1.1; **Special Elite**
  (typewritten papers) by Astigmatic, Apache License 2.0. Files and licences in `public/assets/fonts/`.

### Build 0.14: the night's new recordings

Seven more recordings in `public/assets/audio/sfx/` (85 in all), built the same way (`tools/audio/sounds.json`, each
mirror pinned to a commit and its file to a SHA-256 in `sounds.lock.json`; trimmed, levelled to a -1 dBFS peak):

- `crow_caw`: **"Hooded Crow: Panic Cawing"** by Mish7913, **CC0**, https://freesound.org/s/741365/ (Freesound pack
  "Birds"), from the `hatmix/gwj-78` mirror (commit `48863cf`, its `_readme_and_license.txt`). Mono, its four caws
  played one at a time.
- `window_thud`: **Kenney "Impact Sounds"** (www.kenney.nl), **CC0**, https://kenney.nl/assets/impact-sounds:
  `impactGlass_heavy_000` (the pane's thunk and ring) with `impactSoft_heavy_000` (a soft heavy thud) mixed under it,
  a bird against the window; from the `series-ai/jam-ready-assets` mirror (commit `2d7c410`, its `License.txt`).
- `wing_flap`: **"wings-flap-large-1"** by dave.des, **CC0**, https://freesound.org/people/dave.des/sounds/127197/,
  from the `arianne/stendhal` mirror (commit `fcd8330`, `doc/sources/audio-sfx.txt`).
- `knife_stab`: **"Nasty knife stab 2"** by Aris621, **CC BY 3.0**, https://freesound.org/people/Aris621/sounds/478145/,
  from the `Mooses2k/SecretHistories` mirror (commit `902ce1c`; licence per `Fris0uman/CDDA-Soundpacks`
  `melee_hit_flesh/big_cutting/credits.md`). Trimmed to the stab and its tail.
- `knife_slash`: **"Deep Cut / Slash / Gash"** by SypherZent, **CC0**,
  https://freesound.org/people/SypherZent/sounds/420674/, from the `Mooses2k/SecretHistories` mirror (commit `902ce1c`).
- `body_fall`: **"Falling body hits the floor"** by courtneyeck, **CC0**,
  https://freesound.org/people/courtneyeck/sounds/673424/, from the `erladitia14/Silencio` mirror (commit `51836ab`,
  its `MANIFEST.json`). Trimmed to the fall itself.
- `faucet_open`: **"Kitchen Faucet with Water running into the Sink (Take B)"** by ani_music, **CC0**,
  https://freesound.org/s/632456/, from the `NARBEHOUSE/Narbehouse.github.io` mirror (commit `c7efeff`, its
  `CREDITS.md`). The first 1.6 s (the water coming on), faded.

The credits screen picks them up from `sfx.json` like the rest.

### Build 0.14: the crow at the window

- **"Crow"** by Alexei Ostapenko (https://sketchfab.com/alexanders823), **CC BY 4.0**
  (https://creativecommons.org/licenses/by/4.0/), https://sketchfab.com/3d-models/crow-d5a9b0df4da3493688b63ce42c8a83e2 :
  the bird that strikes the window (STORY.md beat 5). Downloaded from the `Jazhikho/project_harvest` GitHub mirror
  (commit `851d18e`, `assets/models/crow (1).glb`, Git LFS, SHA-256 checked); the licence is in the file's glTF
  `asset.extras` and confirmed by the `Rico-Rodriguez/critter-clash` mirror's `assets/sidekicks/LICENSE-sidekicks.txt`
  (verified there through the Sketchfab API). Built by `tools/crow/build.mjs` into `public/assets/props/crow.glb`
  (+ `crow.LICENSE.txt`): scaled to a 0.90 m wingspan, Sketchfab's lamp and camera removed, two clips cut from its one
  animation (a wing beat, looped, its climb damped to level flight; the glide into the landing that flings up and folds
  the wings), its feather cards alpha-tested, its metalness removed and roughness taken from its gloss map, textures
  resized (1024 / 512 px); quads added that show the loose feather cards painted in its own texture (the burst of
  feathers, and the one left stuck to the glass). In play (`src/crow.js`) its black is lit a little lighter and
  glossier, so that it reads against the night.
- **"Blood Splatter"** by ExileGL, **CC0 1.0**, https://opengameart.org/content/blood-splatter : one patch of it, given a
  soft edge, is the smear the crow leaves on the glass; the same patch dragged down in streaks is that smear as the rain
  washes it. From the `KurtBliss/Karnage` mirror (commit `8dfaa32`, SHA-256 checked), baked into `crow.glb` by
  `tools/crow/build.mjs`.

### Build 0.14: his porcelain mask, his knife, the kitchen's knives

- **His mask: "Porcelain Mask"** by sleepwalker77 (https://sketchfab.com/sleepwalker77), **CC BY 4.0**
  (http://creativecommons.org/licenses/by/4.0/), https://sketchfab.com/3d-models/porcelain-mask-596d7fbddfdd4cbab5a81878e1bd7741 .
  Downloaded from the `LucasTBorges/VideoPlayground` GitHub mirror (commit `d6437ba`, `src/assets/mask/`; licence in
  the glTF's `asset.extras` and the mirror's `license.txt`; pinned in `tools/intruder/mask.json`, SHA-256 in
  `tools/intruder/sources.json`). Baked into `public/assets/props/intruder.glb` by `tools/intruder/build.mjs`: turned
  upright and fitted to the head bone with its eye holes on his eyes (checked against his face and hood through every
  clip by `tools/intruder/fit-check.mjs`); its glaze made non-metallic, glossy, with a rougher crackle; its blood tear
  kept (simplified from 35k to 4k triangles, wet dark red); textures cropped to the face and resized (1024 / 512 px);
  its spare UV sets and vertex colours dropped. It replaces "White Mask" by shedmon, which no longer ships.
- **The blood on his right glove**: "Blood Splatter" by ExileGL (**CC0 1.0**, above), the same download, recoloured
  to dried blood and laid in patches over the glove in `intruder.glb`'s body texture (`tools/intruder/build.mjs`).
  The same build darkens his clothes (less sheen) and works grime into his cuffs (texture edits of the Rocketbox maps).
- **"Knife collection"** by Helindu (https://sketchfab.com/Helindu), **CC BY 4.0**,
  https://sketchfab.com/3d-models/knife-collection-7f6df3818e5544c982e8cbbbbcb6305c . Downloaded from the
  `nkanyi73/empathy-machines` GitHub mirror (commit `62dda23`, `Assets/Models/knife_collection/`; licence in the glTF's
  `asset.extras` and the mirror's `license.txt`), pinned in `tools/props/props.json` and `sources.lock.json`. Built by
  `tools/props/build.mjs` (op `knives`) at the set's real scale (0.495: the chef's knife 33 cm): `story/knife.glb`, the
  chef's knife he carries (`src/intruder.js`), and `story/knives.glb`, its paring (bird's beak), utility, slicing and
  bread knives as separate nodes for the kitchen's magnetic strip. Each knife in its own frame (heel at the origin,
  point down, edge +X), handles and rivets simplified, the blades' mirror polish turned to satin, textures resized
  (1024 / 512 px). Listed in `public/assets/props/story/LICENSES.txt` and on the credits screen.

## Build tools (not shipped)

glTF Transform (MIT), meshoptimizer (MIT), ktx2-encoder (MIT, wraps Basis Universal), draco3dgltf (Apache-2.0),
sharp (Apache-2.0), Vite (MIT), Playwright (Apache-2.0), FBX2glTF (BSD-3-Clause, via the `fbx2gltf` npm package),
FFmpeg (LGPL, for the recordings).

## Made in code (placeholders until downloadable assets are reachable)

- Ambience and fixture sounds: synthesized in `src/ambience.js`; the exhale and glass-break recordings above are sampled audio.
- Rain drops, film grain and the flashlight's beam cookie are painted procedurally at runtime.
- Small built pieces with no asset worth downloading: recessed ceiling downlight discs and the
  wardrobe's inner carcass (shelf, rail, inner walls, the hatch and its lid) in the model's own wood material; the
  story's paper (the building notice on the fridge, the label strips in the fuse box, the handwritten label in its
  cover), his wet footprints, the spilt water and the bathroom's flood and mirror steam are painted at run time.
- The coffee machine's steam puff texture and the flashlight's reflector cookie are painted at runtime.

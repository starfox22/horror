# Hand-off: read this first

A browser horror game in the spirit of Konami's P.T. (first person, one quiet home, photoreal, AAA look). The owner
works with AI agents; whoever picks this up continues from the state below and keeps this file current. A new Claude
session starts from `CLAUDE.md` (repo root: what to read, rules, commands, publishing); keep it current too.

## Current continuation — Codex 0.17, 2026-10-26

The owner requested a further bug pass, a review of the held phone, and a phone already charged at first pickup. Continue on `codex-review` from build 0.17; read [REVIEW_17.md](REVIEW_17.md) and the [matched screenshot gallery](review-17/README.md). New nights and chapter presets use `freshPhoneState()` (100%, booted), and old dead-phone saves migrate without requiring a charge. The later alert is an independent story reminder; ordinary early LIVE works but its scripted visitor waits for restored power and alerts. An early credible police call still dispatches immediately; its forced hunt waits for that beat and respects an active LIVE scene.

The phone-specific grip is in `src/phone-grip.js` and its play-time motion is in `src/phone-motion.js`. Keep the existing licensed hand and phone and the drinking pose separate from this grip. `tools/check-phone-grip.mjs` skins the real asset through the actual runtime pose and verifies screen projection/contact. Phone/media lifecycle, input, appliance-power recovery, coffee interruption and reading/wake guards have new regressions. Use [REVIEW_17.md](REVIEW_17.md) for the complete change list and validation. The playable review URL remains https://starfox22.github.io/horror/codex/?v=0.17. Do not promote it to main without a new explicit owner request.

Published application `4958780b84461aa75c5fd0dad89a63ac5b51e8a7`, [successful deployment 40334455169](https://github.com/starfox22/horror/actions/runs/40334455169). Final 272 CPU checks, 27 WebGPU scenarios and 28 final-bundle WebGL event/ending cases passed, plus four real phone startup/save checks. Hosted version/provenance/JavaScript hash and public screenshots are verified. Main and Claude remain at `c5a619f`. Later docs-only commits skip CI; continue development from the branch HEAD while retaining that published baseline.

## Prior continuation — Codex 0.16, 2026-10-26

The owner moved development back to Codex and requested a branch comparison, incorporation of all latest Claude work, a bug pass and an updated playable link. Fresh remote `main` and `claude/pensive-volta-et0etl` were exactly identical at build 0.15, commit `c5a619f1e75881f46edbcf392f6c7f1e27e7a47e`. Existing `codex-review` was fast-forwarded to that shared commit, including all 59 newer Claude commits and preserving all prior Codex work. Development now continues on `codex-review`, with the 0.16 bug pass documented in [REVIEW_16.md](REVIEW_16.md). The gameplay/story baseline is the complete 0.15 night, including [BUILD_015.md](BUILD_015.md), [BUILD_014.md](BUILD_014.md) and [STORY.md](STORY.md). Earlier main-promotion permissions and Claude branch instructions remain historical; Codex must not push to either source branch without a current explicit request.

## Main promotion and Claude continuation — 2026-10-24

The owner explicitly requested promoting verified build 0.11 to `main` and handing continuation to Claude. Read [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) for the current baseline, publication verification, Claude's existing branch, asset licenses, regression commands and implementation guardrails. The gameplay baseline is `259e12e6ade8d6ad97fcd6af81be4d2e95e453a4`; its review documentation is included. The canonical production URL is https://starfox22.github.io/horror/. This approval covers the current promotion; future main pushes still require an explicit owner request. Codex continues on `codex-review`; Claude updates its separate branch from the promoted `main` before continuing.

## Owner's requirements and preferences
- Current branch policy: reuse `codex-review` for all Codex reviews; Claude works on a separate branch. Merge into or push to `main` only when the owner explicitly asks. Historical approvals below apply only to those completed builds.
- AAA-looking graphics, playable in a desktop browser.
- Download existing free assets (Sketchfab, Poly Haven, GitHub…) instead of making them, to save tokens. Assets must
  have a licence that allows use in a game (CC0 / CC BY / MIT…); credit them in docs/CREDITS.md.
- Setting chosen: a modern apartment ("Modern Apartment" by Visthétique, CC BY 4.0). The player is alone.
- Milestone 1 (done, build 0.1): walk around the apartment in first person with AAA graphics and ambience. Nothing
  scary yet: no enemies, story or puzzles until the owner asks.
- Build 0.2 (done): light switches per area, a flashlight to find and carry, rain on and outside the windows,
  lightning and thunder, general polish.
- Build 0.3 (done, owner feedback on 0.2): no skyline, pitch-black outside like P.T. with rain on the glass; a real
  apartment's lighting (ceiling downlights everywhere, the corridor included); the bedroom wardrobe opens; a
  downloaded front door with a handle; a downloaded flashlight. Owner rule: download assets instead of building them.
- Build 0.4 (done, owner feedback on 0.3): softer, warmer, realistic lighting with everything on (not blown out);
  bedside reading lamps switch on their own; a regular handheld flashlight (downloaded) that is never seen in hand, only
  its beam (as in P.T.), wider and AAA-looking; drops on the windows gather and run down; the bathroom door opens and
  shuts and blocks you; more interactions (laptop lid, computer, coffee machine) with AAA feedback.
- Build 0.5 (done, owner feedback on 0.4): dining pendants, kitchen and hall start off; the bathroom door's handle
  moves with the door; shadows and reflections must be physically believable (no shadow from a light you cannot see);
  flashlight circle a little smaller; a hidden developer menu (type "developer") for testing.
- Build 0.6 (done, owner feedback on 0.5): lights slightly dimmer but spreading further; no pitch-black areas: light must
  fade softly into darkness; the bathroom door's knob still looked wrong when open (replace the door if easier).
- Build 0.7 (done, owner feedback on 0.6): the desk lamp and the arc lamp by the sofa switch on their own; more AAA
  lighting; flashlight default 27 deg; with every light off the flat is pitch dark (only lightning shows through the
  windows, which are otherwise almost black); switches must behave consistently (lights got darker after flicking
  switches); typing "developer" toggles developer mode with a splash, and while on the menu shows whenever paused or
  on the start screen. Owner approved pushing this build to `main`.
- Build 0.12 (Claude, on `claude/pensive-volta-et0etl`, owner request of 2026-10-24 after 0.11): no freezes or stutters;
  Auto graphics with VSync by default (stable 60); no light through walls (the bedroom closet, the corridor), a lighting
  bug pass, AAA lighting; computer and laptop on at the start; a better drinking arm (downloaded), no gulping, only the
  refreshing exhale; a normal water jug and glass; the first scripted event (3 s after the fridge is shut after drinking,
  glass shatters in the bedroom, "What was that?") and a developer-menu Events list to play events in story order.
  Details: [BUILD_012.md](BUILD_012.md). Published to the claude.ai artifact; the owner then approved merging it into `main`.
- Build 0.13 (Claude, on `claude/pensive-volta-et0etl`, owner request of 2026-10-24 after 0.12): an environment bug pass
  (with every light off there was still light in the living room and bedroom); then a real game, AAA: the glass that
  breaks 3 s after the fridge shuts must be heard wherever the player is; slowly built tension, smart dialogue, creative
  jump scares, a silhouette far away in the dark, later an intruder who can kill you by surprise; the question "intruder,
  or still dreaming?" in a plausible reality; 10-15 minutes for a smart player with high replay value; every asset
  downloaded and AAA (never made by us); the story thought through and double-checked with agents; gameplay, graphics,
  lighting, sounds and menus AAA and production ready. Mid-task: the intruder must look like "Scream", a masked man in
  creepy clothes, very scary (assets already downloaded may be kept for later). When done: publish directly to `main`,
  update the claude.ai artifact, write a hand-off, and summarise every change with screenshots. Details:
  [BUILD_013.md](BUILD_013.md), the design in [STORY.md](STORY.md).
- Build 0.14 (Claude, on `claude/pensive-volta-et0etl`, owner request of 2026-10-25 after 0.13): a smaller notice on the
  outside of the fridge door ("the resident who had been causing disturbances ... has finally been evicted"); the
  fridge door never sticking on the player; the phone out of the fridge (nightstand or living-room table); the first
  sighting must not vanish: he runs into the bedroom, believably; a knife and a creepier look; being caught: a jump
  scare, blood and falling to the floor; loud scare sounds, the opening glass very loud anywhere; a crow hitting a
  window when the player faces it, with crow sounds; taps that turn on and off; a Hollywood story agent (inspired by
  Netflix's "Unhinged"); a bug and polish pass; scary but feasible; the goal is to escape. Mid-task: developer-menu
  events play 3 s after resuming (never while paused) and its light controls are not a permanent override (switches
  and the fuse box keep working). Story decision: the owner rejected the caretaker twist and a chained door as too
  close to "Unhinged"; the story stays simple (the evicted man never left, no details: "let the player imagine the
  rest"), with plenty of believable jump scares and tension before he shows up; then creative control was handed over
  ("make the game AAA"), work stays on this branch, with a playable link online. Details: [BUILD_014.md](BUILD_014.md),
  the design in [STORY.md](STORY.md) v3.
- Build 0.15 (Claude, on `claude/pensive-volta-et0etl`, owner request of 2026-10-25 after 0.14): shadows that make
  sense on the floor when the dark corridor is lit by the torch; an AAA phone (downloaded model) with AAA screens and
  messages, and screenshots of it and of the scenes that use it; a dramatic power cut (the flat's lights flicker with a
  repeating short-circuit "tzzz" for about a second, then out); every developer-menu event working 3 s after unpausing;
  no flashlight for the attacker, and his steps heard when he is near. Mid-task: the power must not go off until the
  player has the torch (it was pitch black with no way to find it), and the torch is picked up switched off, F turns it
  on, with a prompt on screen. Then: a general bug pass and AAA graphics, and when done, push to `main` (the owner
  asked in that conversation). Details: [BUILD_015.md](BUILD_015.md).
- Show screenshots and links before big decisions; publish each prototype to a web link.
- Keep everything documented so another AI can continue.

## Ongoing Codex review branch

All Codex review passes use `codex-review`. Build 0.8 is its first environment, lighting and interaction pass; Claude continues on a separate branch.
Read [CODEX_ENVIRONMENT_PASS.md](CODEX_ENVIRONMENT_PASS.md) for the full change list, validation commands, comparison methodology and follow-up constraints.
[PREVIEW_DEPLOYMENT.md](PREVIEW_DEPLOYMENT.md) documents the separate `/codex/` Pages build and deployment prerequisites.
The first Codex reviews were quiet apartment prototypes; the current 0.15/0.16 baseline includes the full night and scripted scares developed later. The default Vite configuration handles optional missing assets correctly, so the earlier external onboarding override is unnecessary on this branch.

## Codex review 0.9

Read [REVIEW_09.md](REVIEW_09.md) for the previous review's feature and test guide. Graphics is available with G or the start/pause button; FPS is on by default and preferences persist. The authored switch asset is reused with precise wall mounting. Flashlight body and lens rest diagonally on the shelf. Coffee uses a shared visual/audio timeline with two cups, crema, drips and steam. Bedroom/bathroom ceilings start off; mirror and extractor lights have separate dim controls and start on. Fixed closet illumination and bedside lamps remain independent.

## Codex review 0.10

Read [REVIEW_10.md](REVIEW_10.md) for the waking/refrigerator implementation and continuation guide. The owner has now requested the first scripted events: a first-person waking sequence with the exact nightmare/water dialogue, then standing control beside the bed; and an opening refrigerator with a water jar and door-controlled interior light. These are implemented without adding another scare. `wake-sequence.js` owns the camera until handoff, pauses with pointer unlock and supports skip/reduced motion. `fridge.js` separates the existing authored upper leaf and adds its cavity, authored jar, fitted water and shadowed interior light. [FRIDGE_ASSETS.md](FRIDGE_ASSETS.md) records assets and adaptation. Graphics now saves a 30/60/90/120/Uncapped FPS limit (default60), with FPS display still on by default. Optional grain is stronger. Extractor output is doubled. The arc lamp source is inside its real shade opening; flashlight fill now respects actual surface occlusion and both flashlight maps remain realtime through probe/door refreshes. All 74 Node regressions pass. Keep later reviews on this branch and preserve the opening's pause/handoff and owned fridge-light restoration.

## Codex review 0.11

Read [REVIEW_11.md](REVIEW_11.md) and [DRINK_ASSETS.md](DRINK_ASSETS.md). Auto now targets 60 FPS through six transient steps, including resolution below Low. Presets reduce actual shadow-atlas/filter, backing-buffer and rain costs while preserving occlusion. Default cap remains 60; Unlimited requires a manual selection. Startup has only bedside lamps, sofa arc lamp, extractor and mirror on; ceilings, pendants, desk/closet lamps and screens are off. Refrigerator E then second E at the glass starts a nine-second visible-hand drinking action with downloaded rig/skin, authored apartment tumbler and CC0 gulp/exhale recordings. Preserve pause/hidden-tab timing, synchronous input blocking, camera-specific hand/carried-glass culling and the adapted hand's CC BY-SA attribution/license. Publication and current checks are recorded in REVIEW_11.md. Codex reviews remain on `codex-review`; Claude continues from the promoted main baseline using [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md).

## Published builds

- Current Codex 0.16: https://starfox22.github.io/horror/codex/?v=0.16 from `0690cf2d7b0aa5afafed66f925907305a9952f36`; [deployment 40319600101](https://github.com/starfox22/horror/actions/runs/40319600101) passed. All 59 newer Claude commits are incorporated, followed by the bug pass. All 231 CPU checks, 26 WebGPU scenarios, 28 WebGL event/ending cases and normal-menu label check passed. Both live provenance files match and the hosted JS equals the local build byte for byte. Main and Claude remain at their shared 0.15 commit `c5a619f`. See [REVIEW_16.md](REVIEW_16.md). Documentation-only follow-ups skip CI and do not change the deployed game revision.

- Production 0.15 (Claude) is on `main` since 2026-10-26 at the owner's request ("when you are finally done, go ahead
  and push to main"): https://starfox22.github.io/horror/ (the Pages workflow deploys `main`; `main` fast-forwarded to
  `claude/pensive-volta-et0etl`), the preview https://starfox22.github.io/horror/claude/, and the claude.ai artifact
  https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9 (version 18: since 0.14 only the bundle, `index.html`, the phone
  (`assets/props/story/phone.glb.b64.txt`) and the props' `LICENSES.txt` changed; the apartment parts,
  `apartment.json`, `collision.json`, `sight.json` and `lib/` were not re-sent; the old `index-BzN0g41R.js` removed).
- Build 0.14 (Claude), 2026-10-25, from `claude/pensive-volta-et0etl` at `46d0265`: the preview
  https://starfox22.github.io/horror/claude/ (`pages-claude.yml`, every push to the branch) and the claude.ai artifact
  https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9 (version 17: only the bundle changed from version 16, `26b739e`,
  which lacked the pause hold and the touch-screen note; for 0.14 the apartment parts, `apartment.json`,
  `collision.json`, `sight.json` and `lib/` were unchanged since 0.13 and not re-sent; new: the crow, his knife and
  the kitchen's knives, the porcelain-masked intruder, the blood, the re-baked clips, the new recordings; the old
  `index-*.js` / `.css` removed). Superseded by 0.15 on `main`.
- Production 0.13 (Claude) is on `main` since 2026-10-25 at the owner's request ("publish directly to main"):
  https://starfox22.github.io/horror/?v=0.13 (the Pages workflow deploys `main`), and on the claude.ai artifact
  https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9 (same URL; the apartment parts were unchanged and not re-sent; new:
  the recordings `assets/audio/sfx/`, fonts, the intruder and story props as `.glb.b64.txt`, the clips, `sight.json`).
- Production 0.12 (Claude) was on `main` since 2026-10-24 at the owner's request: https://starfox22.github.io/horror/?v=0.12 (the Pages workflow deploys `main`; a main deployment removes the `/codex/` review path until the preview workflow is rerun, see PREVIEW_DEPLOYMENT.md). Also on the claude.ai artifact.
- Production 0.11 was on `main`: https://starfox22.github.io/horror/?v=0.11. Deployed source `73f66df26830f888c3c17869543f6df25a9ec844`, [Pages run 40111353532](https://github.com/starfox22/horror/actions/runs/40111353532), succeeded and native production WebGPU drinking passed. Later handoff-only commits do not change this gameplay. The review URL was restored by run `40109659758`, attempt 2; build-info records the promoted main source plus review source `259e12e6ade8d6ad97fcd6af81be4d2e95e453a4`.

`/codex/` serves the latest review. The `?v=` query refreshes cached HTML; it does not preserve older builds. Historical entries below record their deployment commits and captures.
- Current Codex review 0.11: https://starfox22.github.io/horror/codex/?v=0.11-final from `259e12e6ade8d6ad97fcd6af81be4d2e95e453a4`; deployment `40109659758` passed and live build-info matches. Auto targets 60, sparse waking lights and downloaded-hand drinking are documented in REVIEW_11.md. All 90 regressions, local WebGL/WebGPU and hosted native drinking checks pass.
- Codex review 0.10: https://starfox22.github.io/horror/codex/?v=0.10 from `7c8af57a2a0e2962483f51fd538184418a7b7410`; deployment `40103998454` passed and live build-info matches. First waking sequence, refrigerator, FPS limit, grain and physically occluded lighting are documented in REVIEW_10.md.
- Codex review 0.9: https://starfox22.github.io/horror/codex/?v=0.9 from `f39809820f6f3416f5330bb0fb4a7fae6efffc91`; deployment `40098710673` passed. Graphics/FPS, fixtures, lighting defaults and coffee changes are documented in REVIEW_09.md.
- Builds 0.1-0.7 and 0.12-0.14 (2026-10-22/25): claude.ai artifact https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9
  (always the latest Claude build; private to the owner unless shared from its Share menu). Build 0.12 was also merged
  into `main` at the owner's request, so the production Pages site serves it.
- Codex review build 0.8: https://starfox22.github.io/horror/codex/ is published from `codex-review` commit `f6ae1f49d48478c08e0d88329480265a02e177fb`; deployment run `40094343463` succeeded. At that deployment the original main build was served at https://starfox22.github.io/horror/. The owner enabled Pages and selected no deployment-branch restriction. See the deployment guide before publishing later reviews.

To republish the artifact: `npm run build && node tools/make-artifact.mjs`, then the Artifact tool with
`file_path: dist-artifact/index.html`, `root: dist-artifact`, `url` above, and `files` from the JSON list the script prints.
make-artifact keeps `collision.json` and `sight.json` beside the parts and packs every `.glb` under `assets/props/`
(subfolders too: `story/`). The host serves no .bin/.ktx2 files, so make-artifact packs the model into one GLB split into ~14 MB base64 text parts
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
- **Lighting** (`src/lighting.js`): night. Lamps at the model's own fixtures (arc lamp, two dining pendants, cooker
  hood, bathroom mirror LED, desk lamp, screens; bedside lamps in `devices.js`) and recessed ceiling downlights in every
  area, with cached physical shadows and quality-dependent PCF5/PCF3/PCF1 filtering; no moonlight (only during a lightning flash); a procedural night-sky cubemap
  outside. Reflections and bounce light come from probes captured inside the flat (`src/probes.js`, build 0.5/0.6
  sections below), scaled by `AMBIENT` in main.js.
- **Camera effects** (`src/post.js`, PlayCanvas `CameraFrame`): neutral tone mapping, TAA, SSAO, bloom, volumetric
  haze lit by the spot lamps and the torch, grading (no contrast: see Gotchas), vignette, slight fringing, eye
  adaptation (`EyeAdaptation`). High/Medium/Low (keys 1-3); Auto targets 60 FPS through effect, shadow and resolution budgets (`scene-quality.js`, `graphics-settings.js`). The limiter defaults to 60; Unlimited is manual.
- **Sound**: Web Audio ambience/fixture feedback (`src/ambience.js`) includes rain, droplets, room tone, fridge, tap and footsteps with HRTF/reverb. Drinking (`src/drink-sequence.js`) uses downloaded CC0 gulp/exhale recordings, synchronized with the paused animation clock. See DRINK_ASSETS.md for attribution and provenance.

## Build 0.15 changes (where they live)
Full list, the bug pass and verification: [BUILD_015.md](BUILD_015.md). In short: no light for the intruder and his
footsteps (`intruder.js`, `stalker.js` looking/lookYaw, `hunt.js` STEPS, `seccam.js` footfall, `death.js` with the
player's gripped torch or a lightning flash); the cut waits for the torch and flickers with a synthesized buzz first
(`story.js` waitForTorch/brownout/tookTorch/powerCut/blackout, `power.js` surge, `sound.js` buzz); the torch picked up
off with its F prompt (`flashlight.js`, `hud.js`); every developer event replayable from anywhere (`story.js` dev*,
`story-events.js`, `tools/perf/events-audit.mjs`); the floors' normals rebuilt at load (`floor-normals.js`, `main.js`
fixFloorNormals); the phone: a new model ("iPhone 17 Pro" by Ranguel, `tools/props/build.mjs` op phone), its screens
(`phone-screen.js`, previewed by `tools/phone/preview.mjs`; the model alone by `tools/phone/model-check.mjs`), the hand
holding it (`phone.js` setHand/poseHand/HAND); capture scenes in `tools/perf/scenes/` (phone, hall-torch, tour).

## Build 0.14 changes (where they live)
Full list, the director's review and verification: [BUILD_014.md](BUILD_014.md); the design: [STORY.md](STORY.md) v3. In
short: the notice on the fridge door (`world.js`), doors that push the player instead of sticking (`walkgrid.js
swingInto`, `fridge.js`, `doors.js`, `closets.js`), the taps (`taps.js`), the phone on the nightstand with a screen that
lights (`phone.js`), the man's run into the bedroom and the wardrobe (`story.js` sighting), the knife rack's gap
(`world.js buildKnives`), his knife and porcelain mask (`intruder.js`, `tools/intruder/`, `tools/props/`), the crow
(`crow.js`, `tools/crow/`), the death with the knife, blood and the fall (`death.js`), loud never-clipped scares
(`sound.js`), a fairer hunt (`stalker.js`, `hunt.js`, `navgrid.js`), the developer menu's delayed events and non-
permanent light controls (`devmenu.js`, `story-events.js`), sound captions (`hud.js`, Settings), staged captures
(`tools/perf/scene-shots.mjs`), his clip held while a menu or a paper is open (`intruder.js hold`, `main.js`), a note
on the title for touch screens alone (`menu.js`).

## Build 0.13 changes (where they live)
Full list and verification: [BUILD_013.md](BUILD_013.md); the design (truth, beats, triggers, fallbacks, endings,
evidence, replay): [STORY.md](STORY.md). In short:
- **Stray light** (WebGPU): the probe cross-fade's WGSL had its declarations on one line, so nothing was bound and the
  probes never changed after loading (probes.js). One declaration per line (Gotchas).
- **The story**: `story.js` (flags, play-time timers, beats, fallbacks, checkpoints `horror.save.v1`, run variations),
  `story-events.js` (`STORY_EVENTS`, the developer menu's Events list), `world.js` (what the night leaves in the flat),
  `nest.js`, `power.js` + `fusebox.js` (main, RCD, seven breakers; the downloaded consumer unit's own levers),
  `phone.js` + `seccam.js` (the phone, Home Cam clips and LIVE through an infrared pass, the emergency call),
  `intruder.js` + `stalker.js` + `navgrid.js` + `zones.js` + `hunt.js` (his body and mind: patrol, alert, investigate,
  search, chase, kill, ambush, backstage), `death.js`, `endings.js` (four endings), `menu.js`, `hud.js`, `journal.js`,
  `music.js`, `sound.js` (the recorded-sound bank), `credits.js`, `props.js` (the story's downloaded props).
- **Assets**: the intruder (Rocketbox Male_Adult_18 dyed near-black + "Porcelain Mask" by sleepwalker77 since 0.14;
  "White Mask" by shedmon before) from `tools/intruder/` (`fetch.mjs`, `build.mjs [masked|plain]`, `preview.mjs`,
  `fit.mjs` and `fit-check.mjs`: the mask's clearance in every clip); his knife and the kitchen's set from
  `tools/props/` ('knife', 'knives'); the story's props from `tools/props/` (`props.json`, pinned
  downloads, `build.mjs` with per-prop handling: the fuse box's levers and cover, the clock's hands, the pill label, the
  polaroids); 78 recordings from `tools/audio/` (`sounds.json`, `build.mjs`); the camera clips and the polaroid photo from
  `tools/bake-clips.mjs` (`public/assets/clips/`). Credits: CREDITS.md and the credits screen (credits.js reads
  `sfx.json` and `props.json`).
- **Placement**: `tools/surfaces.mjs` lists the flat's shelves, tops and wall faces in a box (measured, not guessed).
- **Tests**: `tools/check-power.mjs`, `tools/check-stalker.mjs` (Node); the night end to end in a headless browser with
  `#play` (runs the night without pointer lock), see BUILD_013.md.

## Build 0.12 changes (where they live)
Full list, measurements and before/after renders: [BUILD_012.md](BUILD_012.md). In short:
- **Freezes**: `fixShadowAtlas()` (lighting.js) fixes the shadow-atlas grid (re-layouts re-rendered every shadow);
  `warmUp()` (warmup.js) builds every shader behind the loading screen, with later-only things shown and lamps that start
  off switched on at zero; the lightning's directional light stays enabled at zero (toggling it recompiles everything);
  probe captures are spread over ~20 frames and cross-faded (`Probes.captureAll`, `AtlasBlend`), the flashlight kept out
  per camera by a light-mask patch of the clustered-light chunk instead of being switched off; `refreshShadows()` only
  takes lamps that see the moving part; presets never change lit shaders or the shadow atlas (PCF3 + 4096 + AO on at
  every level); particles on an `Effects` layer that probe cameras do not draw.
- **VSync + Auto default** (frame-limiter.js `VSYNC` = -1, graphics-settings.js storage key v2).
- **Light leaks**: every light shadowed (bedside spill, closet light, wardrobe LEDs, screen glows as spots); bedside
  cone 55 deg. **Screens on at start** (devices.js).
- **Drinking**: downloaded Rocketbox arm with IK and a fitted grip (arm-rig.js, drink-sequence.js, drink-timeline.js;
  DRINK_ASSETS.md); only the exhale plays. **Jug and glass**: downloaded (FRIDGE_ASSETS.md, `tools/extract-props.mjs`).
- **Scripted events**: `STORY_EVENTS` (story-events.js) in story order with `Director` (signals, play-time delays, once);
  the falling glass (falling-glass.js: HRTF-placed recording, muffled through walls) and `Thought` subtitles; developer
  menu > Events plays any event now.

## Build 0.7 changes (where they live)
- **Switches gave different light each time** (owner report), three causes, all fixed and checked (probe levels after
  "All off" -> "Back to switches", and after a room off -> on, equal the start-up values to 0.001):
  1. Eye adaptation set `scene.exposure`, which the probe cameras use too: a capture after the eye had adapted to the
     dark came out up to 35 % too bright, which moved the adaptation, and so on. Adaptation is now the player camera's
     grading brightness (`EyeAdaptation`, post.js); probes always capture at exposure 1.
  2. Captures fed on earlier captures (bounce light and reflections in what the probes saw), so a single capture after a
     change depended on history. Probe cameras now see direct light only: a global uniform `bounceLive` (set per camera
     on the scene's `prerender` event: 0 for cameras named `probe-*`) scales the bounce chunk and the engine's
     `reflectionEnvPS`/`reflectionEnvHQPS` (patched at start-up from `ShaderChunks`). One capture per change, gain in
     `AMBIENT` (0.9). Every capture also re-renders all lamp shadows (`rerenderShadows`).
  3. Developer-menu overrides: forcing a light kept it forced when its wall switch or lamp was pressed. Now a press
     hands it back (`Switches/Devices.override` -> `DevMenu.handBack`) and flips from the state you saw. "All off"
     also switches off the fixtures' glow meshes (mirror LEDs, hood, pendant globes stayed lit before).
- **Pitch dark with everything off**: night sky ~20x darker (almost black), window drops glow only by how many lights
  are on (`rain.roomLight` = lights on / 12, set before a capture; 0 when all are off), no volumetric-fog ambient, no
  `scene.ambientLight`. All off: every probe level < 0.0001. Lightning still lights the windows and throws its light.
- **Own lamps** (`devices.js` `ownLamp`): arc lamp (E at the dome shade, a small bulb sphere) and desk lamp (E at the
  bulb, its `Light.office` glow) left the living/office switches, which now control only the ceiling downlights.
  `devices.lamps` entries carry `name`/`group` for the developer menu.
- **Developer mode** (`devmenu.js`): "developer" toggles `mode` with a splash (`#devsplash`, "Developer mode
  enabled!" / "disabled"); the panel is shown whenever mode is on and the pointer is not locked (pause, start screen).
- **Downlight beam profile**: a cookie (`profileCookie`, `downProfile`: full to ~33 deg, 28 % field beyond) like a
  photometric profile, so walls near downlights get scallops; downlights 1.0. Bloom 0.024. Cookie atlas 2048.
- Flashlight `BEAM_SIZE` 27.

## Build 0.6 changes (where they live)
- **No more pitch black** (the main cause): `CameraFrame` grading applies contrast to linear light before tone mapping,
  `mix(0.5, colour, contrast)`, so 1.12 subtracted 0.06 from everything and clipped the darkest quarter of the image to
  black. `grading.contrast` is now 1.0. SSAO power 5 -> 3 (intensity 0.55), vignette 0.45.
- **Bounce light that fades with distance** (`src/probes.js`): eight bounce probes (`BOUNCE`: the four room probes plus
  living room, office, corridor west end and corridor by the bedroom door), each lambert-filtered with
  `reprojectTexture` into a 64x32 slot of one 512x32 atlas (`this.bounce`, one sampler for all). Open-plan surfaces
  blend three probes along x (`CHAIN.main`: living -> dining/kitchen -> office), corridor surfaces three more
  (`CHAIN.hall`), mixed across the corridor's mouth and office opening by `envBlendWeight` as before; bathroom and
  bedroom use their own probe. So the corridor is brighter by a lit doorway and dims away from it. Strength `AMBIENT`
  0.6 (was 0.3; 1 = what the probes saw); probes captured 3 times at start-up (multiple bounces), once per change.
  `Probes` is now created before the doors, wardrobe and flashlight take their parts out of the apartment (before, the
  door leaf and wardrobe doors were missed and lit by the open-plan room's probe); the flashlight is assigned 'bed'.
  Reflections are unchanged (per-room env atlases, box-projected). The bathroom door's leaf takes the bathroom's or the
  bedroom's bounce by which way it faces (`bounceMix.z`).
- **Dimmer lights that reach further** (`src/lighting.js`, `devices.js`): downlights 0.8 (was 1.35) with range 6 m
  (was 4.2; PlayCanvas windows inverse-square falloff to zero at `range`, so a short range cut the light off hard);
  lamps ~25 % dimmer with ~1.5x range. Measured on six default-state views against 0.5: the brightest 10 % of pixels
  a little darker (p90 167-174 vs 173-181), pure-black pixels 0-2 % (were 23-99 %). Spot cones stay <= 72 deg: an 80 deg cone makes a 160 deg shadow frustum
  whose edges leak light through walls (seen as bright V shapes on the corridor ceiling).
- **Eye adaptation** (`EyeAdaptation` in `src/post.js`): `scene.exposure` follows the bounce level around the eye
  (`Probes.levelAt`, the CPU copy of the shader's blend; levels read back from the atlas after each capture):
  `(0.26 / level) ^ 0.35` (0.26 = the lit living room's level), clamped 0.65-1.35, faster to light (0.7 s) than to
  dark (2.4 s), snaps after a teleport; +0.05 level while the torch is on. Levels: `readLevels` (immediate reads,
  retried when a read comes back empty, see Gotchas).
  The dark corridor opens up a little; with every light on the flat is not washed out. Developer menu: Testing ->
  "Eye adaptation" toggle with the current exposure. `#ev=<n>` fixes the exposure (adaptation off).
- **Bathroom door replaced** (`tools/build-assets.mjs` PROPS): the model's own door (leaf, frame and the handles
  modelled into the frame: `Door.001_*`, now in `REMOVE`) is gone; a second copy of the downloaded "Door with frame"
  (as the front door) stands in the opening (wall hole z 0.363-1.287, top 2.272, wall x 9.145-9.256), scaled so its
  casings sit on the wall faces, hinges on the bathroom side. PROPS `moving: { node, tag }` marks the leaf subtree
  (leaf, lever, latch) and `separateMaterials` gives it its own materials `Prop_bath_door.<mat>.bathdoor` after dedup
  (dedup would otherwise merge them with the front door's); the frame is zone-split like the walls. `src/doors.js`:
  hinge (9.1086, 0.390) at the hinge pins, 0.86 m to the free edge, lever at 1.245 m. The file's normal map is not
  tangent-space (every texel tilts the surface ~55 deg): `noNormalMap` drops it for both doors.

## Build 0.5 changes (where they live)
- **Per-room probes** (`src/probes.js`, pipeline `zoneSplit` in `tools/build-assets.mjs`): every surface is cut exactly
  at the walls (`ZONE_CUTS`: x 1.55 corridor mouth, x 6.40 main/bath wall, x 9.20 bath/bed wall, z 2.57 hall wall;
  Sutherland-Hodgman, attributes interpolated) and its material copied per room as `<material>@main|hall|bath|bed`
  (look names up with `baseName()`; tagged/moving parts, props, lamp glows and screens are left whole: `UNZONED`).
  Each room has a cubemap probe captured inside it (`ZONES[room].at`) and turned into its own env atlas: reflections are
  box-projected onto the room's walls (custom `cubeMapProjectPS` chunk, relative to the capture point), bounce light
  comes from the room's own probe (custom `ambientPS` chunk, scaled by `AMBIENT`), so an unlit room is really dark.
  The open-plan room and corridor blend their bounce light by position (`envBlendWeight`) so no seam shows at the
  corridor's mouth. GLSL and WGSL versions of both chunks: verified on WebGL 2 and WebGPU (see Gotchas for the
  headless WebGPU flags). Probes are re-captured (one room per frame) after any switch, lamp or developer-menu change.
- **Shadows that make sense**: no moonlight any more (the 'moon' light is enabled only for a lightning flash); every
  lamp moved onto its fixture's bulb (arc lamp dome, pendant shades at 1.92 m, desk lamp bulb, cooker hood, the
  bathroom mirror's LED strips), the stand-in lights (living bounce, arc lamp shade glow, hall night light) removed;
  glass and other see-through materials cast no shadows; PCF5 filtering; curtains (`White1.curtain`, sheer drapes) do
  not receive shadows (acne on thin double-sided cloth) and are matte (the model's roughness 0.36 made the folds mirror
  the black windows as dark streaks). The dining pendants are opal globes: `SPLITS` cuts them out (`White1.pendant`),
  they glow on the dining switch and cast no shadow, with an omni light at each bulb inside.
- **Developer code and E**: while "developer" is being typed, its E does not use things (`interactions.blockKey`).
- **Bathroom door handle**: (superseded in 0.6: the whole door is now the downloaded model.)
- **Defaults**: dining pendants, kitchen and hall lights start off (`switches.js` ROOMS `on`).
- **Flashlight**: `BEAM_SIZE` 38 deg (was 44); `Flashlight.setSize(deg)`.
- **Developer menu** (`src/devmenu.js`): typing "developer" (in game or on the start screen) toggles it; it releases the
  mouse. Flashlight beam size slider (15-75 deg) + default, give/toggle the flashlight; Lights submenu: every light by
  area (37), each forced on/off (overrides its switch; "Back to switches" hands them back), all on/off; lightning
  strike; FPS counter. New lights are picked up automatically (group "Other") unless registered in `collect()`.
- Test hash `#allon` switches every switch on. `tools/find-meshes.mjs` lists source meshes in a box.

## Build 0.4 changes (where they live)
- **Moving and switchable parts from the pipeline** (`tools/build-assets.mjs`): `FIXTURES` gives whole nodes their own
  material copy `<material>.<tag>` (iMac screen `.imac`, coffee panel `.coffee`, the bathroom door leaf `.bathdoor`
  via `BATH_DOOR`); `SPLITS` cuts triangles out by world centroid (the two bedside bulbs `Light.bedside-left/right`
  at z 0.5, the MacBook lid `*.laptoplid` above y 0.522). The door used to be baked open; now `NO_COLLISION` keeps
  the leaf out of the walk grid (`tools/collision.mjs` `skip`) and the game blocks the doorway itself.
- **Moving walls** (`src/walkgrid.js` `addBlocker`): a door leaf is a segment the player's circle may not cross.
  Bathroom door (`src/doors.js`): hinge (9.15, 0.375), 0.85 m leaf, opens -92 deg into the bathroom on a damped
  spring, stops against the player (soft bump), latches with a thud. Wardrobe doors are blockers too and also stop
  against you. If a door ever ends up overlapping the player, `Player.update` ignores blockers until they step out.
- **Static shadows and moving parts**: lamps render shadows once; `refreshShadows(app, pos, radius)` (lighting.js)
  re-renders the nearby lamps' shadows while a door, wardrobe door or the laptop lid moves.
- **Devices** (`src/devices.js`): bedside reading lamps (each a shadowed spot + spill at its bulb, E on the bulb),
  MacBook (lid on its measured hinge `LID_HINGE`/`LID_AXIS`, screen and keyboard light sleep/wake), the office computer
  (iMac + the desk's second screen: power button, chime, boot fade; off fades out), the coffee machine (panel lights,
  grind, pump, pour, beeps; steam particles over the cup). Screens are emissive-only: switched off they are black glass.
- **Flashlight** (`src/flashlight.js`): "Flash-Lite Flashlight" (CC BY 4.0) on the wardrobe shelf; once taken the
  model is hidden and only the beam exists, held at the right hand below the eye (shadows shift as you look). 42 deg
  cone with a reflector cookie (hot spot, corona, spill fading out), tremor + step sway + lag, switch-on stutter, and
  a warm bounce omni placed where the beam's axis meets the walk grid (wall/floor/ceiling).
- **Lighting levels** (`src/lighting.js`): downlights 2700 K at 1.35 (were 3.2) with wide soft cones (14/74 deg) and
  dimmer lenses; lamps ~35 % lower. With everything on the flat is warm and readable, not blown out. Curtains
  (`Plain_Natural_Sheer*`) no longer receive shadows (acne streaks on the thin double-sided cloth).
- **Rain on the glass** (`src/rain.js`): fine droplets keep landing; drops of some size gather touching ones (volumes
  add); past a size a drop runs down in stutters, sweeping up what it meets and shedding a bead trail until it stops.
  Drops are lens sprites (dark meniscus, brighter refracted underside, highlight) that glow faintly with the share of
  lights that are on (`rain.roomLight`, set after each probe capture). Tile 0.95 m of glass.
- **Prompt UI** (`src/interact.js`, `style.css`): `[E]` key cap + action, fading in under the reticle; the reticle
  opens into a ring over usable things and pulses on use. Labels no longer include "E ·".

## Build 0.3 changes (where they live)
- **Downloaded props** (`assets/props/`, merged into the apartment file by `tools/build-assets.mjs` PROPS): the front door
  ("Door with frame", witnessk, CC BY 4.0, from github.com/pmndrs/xr) replaces the model's entrance door (REMOVE);
  the flashlight was Poly Haven's "Vintage Flashlight" (0.4: replaced, see above). Prop materials are prefixed
  `Prop_<name>.` so the game finds them. Only GitHub is reachable from the cloud session: look for asset repos there.
- **Ceiling lights** (`src/lighting.js` DOWNLIGHTS): 23 recessed downlights at the ceiling height baked into
  collision.json (`ceilCm`, WalkGrid.ceilingAt), on each area's switch; everything starts on. Clustered lighting needs
  `maxLightsPerCell` 32 and cells 28x3x10, or lamps are dropped where many overlap (the bedroom went dark).
- **Wardrobe** (`src/closets.js`): the pipeline cuts four door panels and their handles out of `BedroomWardrobes_*`
  (WARDROBE boxes, materials `<name>.wardrobe-<id>`); the game hangs them on hinge pivots and swings them with E.
  The model is hollow behind the doors, so a carcass (floor, top, sides, divider, shelf, rail) is added in its wood;
  an LED comes on while a section is open. The flashlight lies on the tall section's shelf, behind the left door.
- **Windows**: city backdrop and street lamps removed; sheer curtains hidden; drops are grey water lit by the room
  (emissive only during lightning); the rain outside is visible only in a flash. The front door is locked (E rattles it).

## Build 0.2 features (where they live)
- **Interaction** (`src/interact.js`): look at a thing within 2.1 m and press E (or click). Prompt under the reticle.
- **Light switches** (`src/switches.js`, `ROOMS`): living lamp, dining pendants, kitchen, desk lamp, hall, bathroom,
  bedroom (+ closet light). Bathroom and bedroom use the model's own switch plates; the rest get a plate mounted on the
  first wall the walk grid meets from `from` along `dir`. A toggle fades the lamps and the fixture glow (per-room
  `Light.<room>` materials split off in the pipeline) and re-captures the room probe (ambient + reflections).
- **Flashlight** (`src/flashlight.js`): (0.3: now the downloaded model, in the wardrobe.) E takes it, F toggles.
  Shadow-casting spot with a cookie and volumetric scattering; the hand lags the view.
- **Rain** (`src/rain.js`): drops simulated on a 512 px canvas (1.4 m of glass) → normal map + opacity on the
  `WindowGlass` material (planar UVs from the pipeline); rain streak particles outside; lightning every 25-70 s
  (moon light spikes) with synthesised thunder. (0.2's city backdrop and street lamps were removed in 0.3.)
- **Polish**: static (render-once) shadows on every lamp, film grain overlay, idle breathing sway, sheer curtains
  thinned to 0.1 opacity, shorter volumetric haze (12 m) so the city stays visible.
- Blender was not used: baked lighting cannot follow the new light switches. If baking is wanted later, bake only
  what never changes (ambient occlusion, the moonlight) into a second UV set and keep the lamps live.

## Gotchas learned the hard way
- SSAO `radius` is in world units: this scene is in metres, so 1.2 (the engine's default of 30 blackens everything).
- Do not place the probe near a lamp: it then sees a bright table top and floods every ceiling with bounce light.
- `scene.exposure` set before the probe capture did not stick; tuning overrides are applied after it.
- `tools/shoot.mjs` loads `about:blank` between views: a hash-only change does not reload the page.
- Headless rendering is SwiftShader at ~1 fps with all effects; each screenshot takes about a minute.
- KTX2 encoding is cached by content in `assets-src/ktx2-cache/`: the first full build takes ~20 min, later ones ~20 s.
- `dedup()` merges materials that differ only by name (`keepUniqueNames: true` keeps the per-room copies) and
  `prune()` drops UVs no texture uses (`keepAttributes: true` keeps the window UVs the game textures at runtime).
- Window glass: dynamic refraction through CameraFrame blurred the city into a flat haze, and any lit diffuse on the
  glass washes the view out (street lamps shine on it). Drops are therefore dark-diffuse, self-lit beads.
- The volumetric haze filled the 25 m outside the windows with moonlit purple and hid the city: `maxDistance` 12.
- Spot lights shine along their local -Y: aim with `lookAt(target)` then `rotateLocal(90, 0, 0)`.
- Headless tests: SwiftShader runs ~1 fps, so animations barely advance in wall time. Step systems by hand in a page
  evaluate (`doors.update(0.033)` in a loop, `rain.update` with `rain.draw` stubbed out: drawing is the slow part).
- Do not `pkill -f <name>` from a shell whose own command line contains <name> (it kills itself); use `[n]ame`.
- Sketchfab models found in GitHub repos carry their licence in the GLB (`asset.extras.license`): check it there.
- Headless WebGPU works with Chromium flags `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader
  --enable-features=Vulkan --use-vulkan=swiftshader` on a localhost page (not about:blank); keep page sizes small
  (480x270, `#q=1`) or screenshots time out. Check every custom shader chunk on both WebGL 2 and WebGPU.
- With `material.envAtlas` set, the engine does not apply `scene.skyboxIntensity`; and with only `scene.envAtlas` +
  `scene.skybox`, glossy surfaces reflected the night-sky cubemap (ENVATLASHQ): another reason for per-room atlases.
- The volumetric haze draws a spot light's cone as a flat disc when the camera is near the light: keep the
  flashlight's `volumetricScattering` low (0.35) or its circle gets a hard edge.
- `CameraFrame` grading contrast is applied to linear HDR before tone mapping around 0.5: any contrast > 1 clips the
  darks to pure black (1.12 clipped everything below 0.054). Keep it 1; grade contrast elsewhere if ever needed.
- Spot shadows use a frustum of twice the outer cone: above ~72 deg the map is so stretched at its edges that light
  leaks through walls.
- Never drive game exposure through `scene.exposure` while probes are captured: their cameras use it too.
- A probe that sees the result of earlier probes (bounce, reflections, glowing windows set from probe levels) makes
  lighting depend on history; keep captures direct-only (`bounceLive`).
- Headless captures take ~30 s with SwiftShader: wait long enough before reading `probes.levels` in a test.
- `Texture.read` on WebGPU sometimes resolves with all zeros (non-immediate reads especially): check alpha and retry.
- WGSL needs texture reads in uniform control flow: when the texture or slot depends on position, pick the slot with
  arithmetic and use `textureSampleLevel`, never sample inside a branch.
- `dedup()` merges identical materials and meshes across props (two copies of the same downloaded door share both):
  give a prop copy its own materials after dedup (`separateMaterials`), never before.
- The cloud session reaches GitHub (git, media.githubusercontent.com, api.github.com for this repo) and npm/PyPI only;
  Sketchfab, Poly Haven, Zenodo and Hugging Face are blocked unless the owner allows them.

- Never toggle a directional light, the shadow filter, the shadow-atlas size or SSAO's LIGHTING mode during play: each
  is part of every lit shader's key (or reallocates every shadow) and freezes the game while the flat recompiles.
- Leave `scene.lighting.atlasSplit` fixed (`fixShadowAtlas`, after adding any shadowed or cookie light): the engine's
  default grid follows the number of visible shadowed lights and re-renders all of them whenever it changes.
- A light without shadows shines through walls. Every lamp casts shadows; keep it that way for new lights.
- A camera that sees something for the first time builds its shaders then: new things that appear only later (props,
  effects, the arm) belong in the warm-up's `reveal` list (main.js), and things probes must not see on the `Effects`
  layer or behind `isVisibleFunc`.
- WGSL: one declaration per line (attributes, varyings, uniforms, textures, samplers). The engine's WGSL preprocessor
  finds them line by line; several on one line compile but bind nothing (the 0.12 probes cross-fade wrote zeros on
  WebGPU: the "stray light" of 0.13).
- A light seen by one camera only: give it the lightmapped mask bit alone (`MASK_AFFECT_LIGHTMAPPED`); the
  clustered-light patch in probes.js accepts it only while the camera named `security camera` renders (`irView`).
  The flashlight (dynamic + lightmapped) is the opposite case: every camera but the probes.
- Placing a prop: measure the surface (`node tools/surfaces.mjs x0 x1 z0 z1 [y0 y1] [x|y|z]`). The corridor's south
  wall face is at z 4.337, not 4.42 (a prop put on 4.42 sat half inside the wall), the bed wall's panel at x 14.11.
- Headless staging shots: `place()` puts the player through the collision grid, so a spot on the bed or in furniture
  is moved to the nearest free cell; shoot from the floor beside things.
- A downloaded prop's mirror may have lost its opacity maps (Poly Haven's clock and camera glass came out black):
  `props.json` `materials` overrides fix the material in the build.
- The polaroid photo is baked from the game (`tools/bake-clips.mjs`), then printed into the polaroids' texture
  (`node tools/props/build.mjs polaroids`): bake first, then rebuild that prop.
- Build 0.14: `sight.json` keeps only the tallest point of each cell, so door heads made every doorway opaque to his
  eyes: `navgrid.sees()` ignores walkable cells (collision guarantees nothing between 0.25 and 1.9 m stands in them).
- The walk grid bakes the wardrobe doors shut: a player can never stand inside it; `hunt.inWardrobe` counts standing
  pressed into the open right half's doorway.
- Animate him only through `intruder.play()`: it respects `hold()` (main.js holds his clip while a menu or a paper is
  open). Writing `body.anim.speed` directly would run his clip behind the pause menu again.
- His meshes refuse shadow cameras (`intruder.js seenBy`): a cached lamp shadow re-rendered while he stood there would
  keep a ghost of him. Only a realtime light may draw him into its shadow.
- A texture transform that becomes the identity is a different shader (the taps' stream is tiled (1, 2) so its scroll
  never hits it); an opacity of exactly 0 or 1 is too (the ripples never go below 0.004). Force a transparent mesh's
  order with `meshInstance.calculateSortDistance`.
- An additive blend (BLEND_ADDITIVE) ignores opacity: put a glow's gradient in the emissive map (the light under the
  bathroom door), or use BLEND_ADDITIVEALPHA.
- The flashlight follows the camera with a lag (a slerp): in staged shots snap `flashlight.rot` to the camera.
- The phone's canvas is drawn only when it is dirty and either held or lying on the nightstand (that copy shares it).
- Story fallbacks use `story.soonest()`: a later event must never push a fallback later (the cut, the hunt).
- Warming a shadow pass: the light must actually draw the thing. Clustered lighting leaves out a light of intensity 0
  (warm the torch at 0.01), and a spot only draws what is inside its cone (the warm-up's torch aims at his head: aimed
  along the camera it drew his body and knife but not his head and mask, whose shadow shaders were then built in play).
  To see what a warm-up missed, compare `material.variants.size` before and after the moment in a page evaluate.
- A black thing outside a lit window reads as nothing (the crow): show its broad side to the room. The window bars stand
  2.2 cm out of the glass and the wall face 3.6-4.3 cm; transparent decals on a window must sort against the room's
  single glass mesh. Headless captures that jump far ahead in time keep a trace of the previous frame (TAA): render
  about 16 frames after a big jump.
- A bone that a clip does not animate keeps whatever was last written to it: per-frame overrides (his fist, the knife
  arm) must be absolute, never relative to the previous frame.
- Black cloth reads grey under the torch because of its specular reflection, not its colour: cut the specular per texel
  (`KHR_materials_specular`); pruning with gltf-transform does not fold a specular texture into a factor. The torch
  blows out anything within about 1 m: judge how dark something reads at 2-4 m.
- `tools/perf/scene-shots.mjs` loads the build once for many staged shots; freeze a sequence by stepping it by hand and
  then replacing the instance's `update` (`death.update = () => {}`). With several headless browsers running, the
  warm-up alone takes 30-45 minutes: run one browser job at a time.
- `app.stats` frame counters and `_shaderStats` are only filled in the engine's profiler build: to count shadow renders
  and new shaders, wrap `app.renderer.shadowRenderer.renderFace` and watch `graphicsDevice.shaders.length`
  (`tools/perf/hitch.mjs` does, see its README).

### Build 0.15
- A floor that shades oddly under the torch is a normals problem, not shadows: the downloaded flat's floors share
  vertices between top and sides. `fixFloorNormals` (main.js) rebuilds them at load; anything new laid on the floor
  that looks banded under the torch should go through it (it takes meshes whose bounds start below 0.35 m).
- The phone's screen mesh must face +Z and the game's screen material is single-sided: a model whose screen faces the
  back shows nothing at all (the build's phone op winds it). Check a new phone with `tools/phone/model-check.mjs`
  before any in-game capture.
- A prompt belongs to its key: hide it with `hud.hidePrompt(key)`, never unconditionally.
- `power.update` stands still while paused (`power.paused`, main.js): a cut, a restore or a surge waits behind the menu.
- Developer-menu replays (story.js dev*) must leave a night that normal play can still finish: stop the hunt with
  `devStopHunt` (it re-arms the hunt fallback and mends the main switch), never by clearing flags alone.

## Continuation

1. Codex resumes on `codex-review` from the complete 0.15 game shared by `main` and `claude/pensive-volta-et0etl`,
   with the 0.16 bug pass on top. Read [REVIEW_16.md](REVIEW_16.md), [BUILD_015.md](BUILD_015.md),
   [BUILD_014.md](BUILD_014.md) and [STORY.md](STORY.md). The synchronization is already done; do not restart from 0.11/0.13.
2. The night is complete: four endings, deaths that wake you at 03:07, checkpoints per act, chapters after a first
   ending, a journal of 18 pieces of evidence, three difficulties. Node regressions: `node --test tools/check-*.mjs`;
   browser checks: `tools/perf/final-check.mjs` (WebGL and WebGPU) and the headless play-through described in
   BUILD_013.md (Verification).
3. Ideas not yet asked for (need an owner request): more rooms for him to use (the bathroom ceiling, the balcony), a
   mirror reflection pass, voice acting for the dispatcher and police (captions only today), more polaroid photos (only
   one shot is baked), more replay variations (where he starts, which circuit is wet), localisation.
4. Assets to keep in mind: the unmasked Rocketbox man (`assets-src/intruder/intruder-plain.glb`, used only for the
   sleeper in the baked clips) and every candidate model the scout found (masks, phones, cameras, papers: the
   list and their licences are recorded in BUILD_013.md, Assets kept for later).

## History
- 2026-10-22: proposal (docs/PROPOSAL.md) → owner picked Visthétique's apartment → build 0.1 walkable apartment.
  Proposal pages: https://claude.ai/artifact/3NwzpfHYfCAMCW5Mvb8uz2 and https://claude.ai/artifact/6PVjhA37A16UxRMxhQhnPz

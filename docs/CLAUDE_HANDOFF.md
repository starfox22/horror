# Claude continuation handoff — build 0.11

> **Update: build 0.12** (Claude, branch `claude/pensive-volta-et0etl`, published to the claude.ai artifact and merged into `main` at the owner's request on 2026-10-24) supersedes parts of the table below: the drinking hand is now a downloaded Rocketbox arm (MIT) with IK, the jar and glass are downloaded models, the defaults are Auto + VSync with lit shaders identical at every preset, the computer and laptop start on, and scripted events live in `src/story-events.js`. Read [BUILD_012.md](BUILD_012.md) first.

Read [HANDOFF.md](HANDOFF.md), this file, [REVIEW_11.md](REVIEW_11.md), and [AGENTS.md](../AGENTS.md) before editing. The user explicitly requested promotion of the verified 0.11 review to `main` on 2026-10-24 and asked for this handoff. That authorization covers this promotion; future pushes or merges to `main` still require a new explicit request.

## Baseline and publication

- Final gameplay revision: `259e12e6ade8d6ad97fcd6af81be4d2e95e453a4`.
- Review documentation revision before promotion: `e6c3b6eb2f2ba4cc6fe0f82733f0e1585fd350af`.
- Verified review deployment: [run 40109659758](https://github.com/starfox22/horror/actions/runs/40109659758), with matching preview build-info and hosted WebGPU interaction checks.
- The main promotion preserves the final gameplay revision above and includes its review documentation and this handoff. Later publication-record commits may be documentation-only descendants; distinguish branch HEAD from the commit actually deployed.
- Canonical production URL after promotion: **https://starfox22.github.io/horror/**.
- Main promotion source: `73f66df26830f888c3c17869543f6df25a9ec844`. [Production deployment 40111353532](https://github.com/starfox22/horror/actions/runs/40111353532) succeeded. The production root identifies build 0.11 and the expected compiled bundle; native production WebGPU drinking, decoded audio, 60 FPS default cap, menu/hidden-tab pause, glass return and control handoff passed without unexpected page, console or HTTP errors. See [production validation](production-0.11-validation.json).
- Restored review deployment: [run 40109659758, attempt 2](https://github.com/starfox22/horror/actions/runs/40109659758/attempts/2) succeeded after the main deployment. Live `/horror/codex/build-info.json` records `73f66df26830f888c3c17869543f6df25a9ec844` as `original` and `259e12e6ade8d6ad97fcd6af81be4d2e95e453a4` as `preview`; both URLs are available. Runtime files match the verified gameplay revision exactly.

This promotion includes the 0.8 environment pass, 0.9 graphics/coffee work, 0.10 waking/fridge work and 0.11 changes. Merge the full updated main baseline.

Claude continues on its existing separate branch; Codex continues on `codex-review`. The observed remote Claude branch is `claude/pensive-volta-et0etl`, at `7b93acb3f34085e078ad32f0c2baae415341e486` before promotion. That remote observation does not account for Claude's unpushed commits or local edits. Fetch the current remote `main`, inspect your branch and working tree, and merge the promoted baseline into your existing Claude branch before new work. Preserve independent Claude changes and resolve conflicts deliberately. Do not reset your branch to the old 0.7 commit, force-push, overwrite another agent's branch, or create an additional worktree without the user's instruction.

## What the owner asked for, now implemented

1. Improve efficiency across graphics settings, target 60 FPS in Auto and cap at 60 by default, with manual Unlimited available.
2. At waking, only the two bedroom bedside lamps, living-room curved arc lamp, dim kitchen extractor and bathroom mirror lamp are on. Other ceilings, pendants, desk/closet lamps and screens start off.
3. Add a glass beside the refrigerator's water jar. E opens the fridge; a second E toward the glass starts a visible-hand drinking action, with recorded gulp and relief sounds. The hand is a downloaded textured rigged asset, not a generated hand mesh.

The apartment remains quiet and alone. The waking opening, refrigerator and drinking action are the scripted events already requested. No additional scares, enemy, puzzle or P.T. loop has been authorized. There is no remaining implementation item from this request; await the owner's next direction or feedback.

## Where to continue safely

| Area | Files and behavior to preserve |
| --- | --- |
| Graphics | `src/graphics-settings.js`, `src/scene-quality.js`, `src/post.js`, `src/frame-limiter.js`. Fresh preferences default to 60 FPS and visible FPS. `0` means Unlimited; existing saved 30/60/90/120/0 choices remain compatible. Auto measures actual accepted frames and steps through High 100%, Medium 85%/75%, Low 75%/65%/50%. Its runtime choice is transient, not saved over the user's preset. |
| Rendering budgets | The backing-buffer budget is installed at device creation and before the initial probe capture. High/Medium/Low pixel budgets are 2560×1440 / 1920×1080 / 1280×720 before resolution scaling. Shared shadow atlases/filtering, anisotropy and effects follow quality. Keep physical shadow casters, cookies, light-cluster capacity and both realtime flashlight maps. Reducing per-light resolution alone does not reduce clustered local-shadow atlas cost. |
| Rain | `src/rain.js` simulates/merges/uploads wet glass at 20/15/10 Hz; lightning stays at engine cadence. Invisible exterior particles do not simulate. Keep separate elapsed-simulation and cadence-remainder clocks: combining them previously double-counted fractional time at 120/144 Hz. |
| Camera ownership | `src/main.js`, `src/wake-sequence.js`, `src/drink-sequence.js`, `src/player.js`. Skip `Player.update` while waking or drinking owns the camera. Starting drinking clears keys/velocity and disables cached interactions synchronously. Menu/pointer unlock and document hiding freeze visible time and stop drinking voices; resume uses saved clip offsets without repaying hidden time. Finish restores position, gaze and control. |
| Fridge | `src/fridge.js`, `src/fridge-geometry.js`, `src/fridge-water.js`. Retain the authored upper leaf, moving handle/collision, jar, compact vertex subsets and door-controlled light. The developer menu owns the fridge fixture explicitly and restores it from current door state. A sealed fridge must stay fully off, including diffuser glow, after developer reset. |
| Drinking | `src/drink-timeline.js` and `src/drink-sequence.js`: nine-second reach/grip/lift/three sips/return, then a mostly empty glass. The hand and held glass/water render only in the player camera through `MeshInstance.isVisibleFunc`; probe cameras copy player layers, so a custom layer alone does not exclude them. Returned shelf glass participates normally again. |
| Grip and framing | The source finger clip is sampled to 0.47 s; three thumb joints oppose around the 79 mm tumbler. Keep the measured palm anchor `[0, 0.099, -0.013]`, basis and rigidly rotated contact. References are in `tools/drinking-grip-reference.json`. Normal camera framing raises the view above the glass during reach/return and restores it after hand withdrawal. Removing that framing exposes the adapted arm's cut end when looking directly at the glass. Reduced motion instead cuts directly to a supported chest-held glass, keeps the camera stationary and directly replaces it after sipping. |
| Water and probes | Water uses local gravity derived from the glass's actual world rotation, including camera pitch/roll. Keep it level in world space. Preserve direct-only probe capture, `bounceLive`, camera grading exposure rather than `scene.exposure`, and the all-off/restoration invariants documented in HANDOFF. |

The original waking dialogue is still `I just had a nightmare, I will go get some water at the kitchen`. Space/Enter skips waking, Esc/G pauses, and normal control starts on the collision-tested bedside aisle. The flashlight continues to show only its beam when carried; this hand is for drinking.

## Assets and licenses

Read [DRINK_ASSETS.md](DRINK_ASSETS.md), [FRIDGE_ASSETS.md](FRIDGE_ASSETS.md) and [CREDITS.md](CREDITS.md) before replacing or redistributing assets.

- `public/assets/props/drinking-hand.glb`: **Rigged hand**, Elena FF, **CC BY-SA 4.0**. Its existing wrist loops were extended into an offscreen arm; source hand topology, skin, rig, textures and animation remain authored. Preserve embedded/adjacent license, modification notices and the start/pause-screen credit. The adapted hand asset remains CC BY-SA. Final SHA256: `30f4eecc7ea1e76a887dc4f4fcd6d247ca0b6bcc86fdfd14ed8b6c4966dd20cd`.
- `tools/prepare-drinking-hand.py`: reproduces the adaptation from a checksum-pinned download; Python 3 and NumPy are needed only when regenerating it. Blind Blender re-export can misinterpret source control-bone rest matrices.
- `public/assets/props/drinking-glass.json`: extracted from Visthétique's **Modern Apartment**, **CC BY 4.0**, using `tools/extract-drinking-glass.mjs`.
- `public/assets/audio/drink-water.wav` and `drink-relief.wav`: real recordings by Breviceps and otherthings, **CC0**. Provenance and checksums are in `drink-sources.json`. Remaining ambience/fixture sounds are synthesized.

The owner's standing preference is to download suitable licensed assets rather than fabricate replacements. Do not replace the downloaded hand with primitive geometry or lose its attribution.

## Validation and reproduction

The verified baseline has **90 passing Node regressions**, all eight room destinations reachable, a successful production build, graphics UI/persistence checks, full WebGPU gameplay checks and native WebGL/WebGPU drinking checks. [Review captures](review-11/README.md) and [validation JSON](review-11/validation.json) contain evidence and precise methods.

```sh
npm ci
node --test tools/check-interactions.mjs tools/check-graphics-settings.mjs tools/check-frame-limiter.mjs tools/check-scene-quality.mjs tools/check-lamp-lighting.mjs tools/check-flashlight-shadows.mjs tools/check-wake-sequence.mjs tools/check-fridge.mjs tools/check-drink-sequence.mjs tools/check-coffee.mjs tools/check-flashlight-placement.mjs tools/check-switches.mjs
node tools/check-reach.mjs
npm run build
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
```

With Python Playwright and Chromium available:

```sh
python3 tools/check-graphics-ui.py http://127.0.0.1:4175/
python3 tools/check-browser.py http://127.0.0.1:4175/ webgpu
DRINK_QUALITY=2 python3 tools/check-drink-browser.py http://127.0.0.1:4175/ work/drink-webgpu webgpu
DRINK_QUALITY=2 DRINK_AIM_GLASS=1 python3 tools/check-drink-browser.py http://127.0.0.1:4175/ work/drink-direct webgl
```

Native input starts the browser actions; deterministic class stepping freezes animation poses on slow cloud SwiftShader. These renders verify behavior/shaders, not desktop GPU performance. 60 FPS is a cap and Auto target, not a guarantee on every computer. The rain microbenchmark excludes canvas and GPU work. An absent optional `assets/apartment/apartment.json` 404 is expected in the normal committed glTF build; unexpected request/console errors are not.

For future visible changes, keep matched before/after cameras, document settings and inspect both WebGL 2 and WebGPU. Recheck alternate glass aim, reach and return framing, pause while holding the cup, reduced motion, and developer all-off/restoration if touching those systems. Run checks appropriate to what changed; there is no need to rebuild the large apartment assets for ordinary runtime edits.

## Deployment behavior

`.github/workflows/pages.yml` publishes `main` to the production root. `.github/workflows/pages-preview.yml` builds `main` at the root plus the exact Codex revision under `/codex/`; both share one Pages site and concurrency group. **A normal main deployment removes `/codex/`.** For this promotion the publishing agent reran the existing preview workflow after the main deployment and restored the main 0.11 build at the root and the reviewed 0.11 revision at https://starfox22.github.io/horror/codex/. Keep the root as the canonical continuation link. A future main deployment will remove that review path again until the preview workflow is rerun; `/codex/` is not a permanent archived version. Query parameters refresh cached HTML and do not preserve old game versions.

Do not infer a new deployment authorization from the historical 0.11 promotion. Keep new Claude work on its separate branch, keep this handoff/HANDOFF current, and wait for the owner to authorize any subsequent main promotion or new game content.

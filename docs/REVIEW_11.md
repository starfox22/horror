# Review 0.11 — performance, waking lights and drinking water

Continue on `codex-review`. The owner has not authorized a merge or push to `main`.

## Changes

- **60 FPS target:** the existing real engine-tick limiter still defaults to 60, independent of display refresh and quality. Unlimited must be selected explicitly. Existing saved 30/60/90/120/0 preferences remain compatible. Auto now reacts to sustained throughput below 92% of its 60 FPS target (or a deliberately lower manual cap), rather than waiting for 40/24 FPS. It steps through High 100%, Medium 85%/75%, then Low 75%/65%/50%. Hardware adaptation is transient; selecting Auto again retries detail. Menu, hidden-tab and reflection-capture time do not lower quality. Locked waking/drinking sequences can adapt even though movement is disabled.
- **Real preset budgets:** High/Medium/Low backing buffers are bounded to 2560×1440 / 1920×1080 / 1280×720 pixels before resolution scaling; pixel density is capped at 1.5/1/1. Shared local-shadow atlas size is 4096/2048/2048 with PCF5/PCF3/PCF1 filtering. Shadow casters, cookies, cluster capacity and realtime flashlight shadows remain intact. Medium reduces SSAO cost; Low removes SSAO, haze, bloom and grain while retaining TAA. Texture anisotropy follows the preset. These bounds avoid silently turning Low on a high-DPI or 4K monitor into a much larger workload.
- **Rain:** wet-glass simulation, merging and two canvas uploads run at 20/15/10 Hz instead of merging every game frame. Lightning remains at engine cadence; exterior particles stop simulating while invisible. Scheduling tracks actual simulated time separately from the fractional cadence remainder, including 120/144 Hz and jitter. No game-speed change accompanies the FPS cap.
- **Waking lights:** only the two bedside lamps, curved sofa lamp, dim kitchen extractor and bathroom mirror start on. All ceilings, dining pendants, desk/closet lamps, laptop screen/keyboard and computer screens/glow start off. Existing independent controls and developer All off/Back to switches restoration are preserved. The fixed closet lamp now has its own E control. Wardrobe LEDs and refrigerator lighting remain controlled by their doors.
- **Drink water:** E opens the refrigerator, revealing its existing jar and an extracted, authored apartment glass of water. A second E toward the interior glass starts a nine-second reach, grip, lift, three sips and return. A downloaded textured hand and its authored finger rig remain visible, with an attached forearm adapted from the existing wrist geometry. The glass tips toward the mouth, the free water surface stays level and the amount falls. Real CC0 gulp and relief/exhale recordings use the same timeline. The glass returns mostly empty; closing/reopening the refrigerator remains available.

The hand, glass and audio provenance, licenses and preparation are documented in [DRINK_ASSETS.md](DRINK_ASSETS.md). The adapted hand is distributed under CC BY-SA 4.0 with embedded attribution, an adjacent license and a start/pause-screen credit link. No hand or finger mesh was built from primitives. The surrounding game remains a collection of separately licensed assets.

## Continuation details

`SceneQuality` applies the initial graphics budget before the first probe capture; the backing-buffer budget is also installed when the graphics device is created, before model/hand downloads complete. It follows Graphics changes. Local clustered shadow resolution is governed by the shared atlas, so per-lamp shadow-resolution settings should not be presented as the source of those savings. Directional moon-map resolution is reduced separately on lower presets. High detail can be restored without losing the original light settings.

`DrinkSequence` owns the camera and movement until completion. The main update skips `Player.update` while it runs; start clears keys/velocity and disables interactions synchronously, preventing rapid E/clicks from closing the door mid-reach. Pointer unlock, graphics/pause and document hiding freeze time and stop only the drinking voices. Resume schedules remaining recording offsets without repaying paused time. A smooth head lift frames the glass below the eye during the reach and return, including direct or slightly lower initial gaze; the original orientation returns after the hand withdraws. Reduced motion keeps the camera stationary and cuts directly to a supported glass in hand, then directly back to the shelf after sipping. It omits the long reach and swallow tremor. Player position and viewing direction are restored at handoff.

The downloaded Open/Close clip is evaluated with PlayCanvas `AnimEvaluator`/`DefaultAnimBinder`; no additional animation component system is needed. Its palm contact rotates rigidly with the glass. Public `MeshInstance.isVisibleFunc` callbacks keep the hand and carried glass/water out of probe cameras while retaining the real World-layer lights. A custom camera layer alone is insufficient because `captureCube` copies the primary camera layers. Returned shelf glass participates in ordinary rendering again. Refrigerator mesh extraction now compacts referenced vertex streams instead of copying every source vertex into each subset.

`window.__app.drink` exposes `running`, `time`, `clock`, `apply(time)` and `finish()` for deterministic inspection. Do not use an inspection clock in production. Native inputs start browser tests; deliberate class stepping freezes poses on CPU SwiftShader. Performance measurements from this renderer are not desktop GPU benchmarks and cannot establish 60 FPS on every computer.

## Validation and publication

All **90 Node regressions** pass across twelve check files, and all eight room destinations remain reachable. Production build passes. The review workflow now includes scene/rain quality and drinking regressions alongside the previous interaction, lighting, limiter, waking, fridge, coffee, switch and flashlight checks.

Native graphics UI checks passed presets/effects, fresh default 60 FPS and FPS counter, explicit Unlimited/caps, persistence after reload, focus, pointer capture and the 320×480 layout. The real engine tick/cadence check compares accepted callbacks with independently counted RAF supply while temporarily stubbing update/render work. It validates the limiter without presenting software rendering as a GPU performance result.

Full WebGPU gameplay checks passed startup fixture defaults, natural waking and clear handoff, menu controls, movement, developer lighting off/restoration, flashlight pickup/realtime shadows, coffee pour/completion/replay and refrigerator opening. No unexpected page, console or HTTP/request failures occurred. The absent optional apartment manifest remains expected.

Native drinking checks start with actual E input and a second E from the unchanged opening view. They verify loaded hand/audio, immediate locomotion/input blocking, held-glass poses, reduced water, G pause/resume with stopped voices, hidden-tab freeze, completion at the same player position and native refrigerator closing afterward. Exact poses are stepped deliberately for slow software rendering; deterministic tests separately verify timeline continuity, thumb/palm contact, per-camera visibility, world-horizontal water under camera rotation and clip-offset audio resume.

A five-trial deterministic CPU-only rain microbenchmark measured medians of 208 ms before and 35/22/17 ms at High/Medium/Low over ten simulated seconds at 120 offered updates/second. Canvas drawing/uploads and all engine/GPU work are excluded. These figures demonstrate reduced simulation work, not a whole-game FPS multiplier. The final rain cadences and display-clock/jitter regressions also bound upload counts. Run `node tools/benchmark-rain.mjs` to reproduce against the pinned 0.10 source.

[Matching captures](review-11/README.md) and [machine-readable validation](review-11/validation.json) record the visual comparison and checks.

```sh
npm run build
node --test tools/check-interactions.mjs tools/check-graphics-settings.mjs tools/check-frame-limiter.mjs tools/check-scene-quality.mjs tools/check-lamp-lighting.mjs tools/check-flashlight-shadows.mjs tools/check-wake-sequence.mjs tools/check-fridge.mjs tools/check-drink-sequence.mjs tools/check-coffee.mjs tools/check-flashlight-placement.mjs tools/check-switches.mjs
node tools/check-reach.mjs
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
python3 tools/check-graphics-ui.py http://127.0.0.1:4175/
python3 tools/check-browser.py http://127.0.0.1:4175/ webgpu
DRINK_QUALITY=2 python3 tools/check-drink-browser.py http://127.0.0.1:4175/ work/drink-check webgpu
```

## Original review publication before main promotion

Published revision: `259e12e6ade8d6ad97fcd6af81be4d2e95e453a4`. [Original deployment run 40109659758, attempt 1](https://github.com/starfox22/horror/actions/runs/40109659758/attempts/1) passed. Play **https://starfox22.github.io/horror/codex/?v=0.11-final**. Live build-info matches that preview commit and the unchanged original `main` revision `7b93acb3f34085e078ad32f0c2baae415341e486`. Both site roots load; the hosted hand SHA256 matches the final local asset, and both recordings and the hand license return HTTP 200.

The actual hosted HTTPS WebGPU check passed native E opening and second-E drinking, decoded recorded audio, default 60 FPS cap, visible hand/glass, pause/resume, hidden-tab freeze, mostly empty glass return, restored walking control and native refrigerator closing. No unexpected page, console or HTTP failures occurred. [Hosted result](review-11/validation.json) records the check. A session proxy CA public-key pin was used for the cloud browser; general certificate-error bypass was not enabled.

The `?v=` query refreshes cached HTML; it does not preserve an older build. Documentation-only follow-ups skip CI and do not change this deployed game revision. `main` was neither committed nor pushed during the review. The owner subsequently authorized promoting 0.11 to `main`; current production and continuation details are recorded in [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md).

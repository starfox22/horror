# Review 0.10 — waking, refrigerator and lighting

Continue all Codex reviews on `codex-review`. The owner has not authorized merging or pushing this review to `main`. Play at https://starfox22.github.io/horror/codex/?v=0.10. Publication verification is recorded below after deployment.

## Player-facing changes

- **First scripted opening**: begin in bed, wake, sit, turn to the bedside and stand into normal first-person control. The requested nightmare/water line appears in a locally bundled Cormorant Garamond font. Space/Enter skips, Esc/G pauses, and resume continues the same opening. Reduced motion uses a shorter stationary bedside view.
- **Refrigerator interaction**: E at the refrigerator opens its real upper door, revealing shelves, door bins and a glass jar of water. Its cool interior light switches with the door, and the swinging leaf blocks the player and nearby light. E closes it again.
- **FPS limit** in Graphics: 30, 60, 90, 120 or Uncapped. Default 60. Applies immediately, survives reload and is independent of the quality preset and FPS counter. The counter remains on by default; existing saved preferences are preserved.
- **Stronger optional film grain**: fine monochrome overlay opacity increased from 0.025 to 0.05. Eight noise offsets cycle at 24 Hz. Disabling Film grain still removes it completely; reduced-motion preferences keep it static.
- **Brighter extractor**: source intensity increased from 0.22 to 0.44, with matching diffuser glow increased from 0.28 to 0.52 of the original authored emission. It remains independently switchable and starts on; kitchen ceiling starts off.
- **Corrected sofa arc lamp**: the emitter and visible bulb now sit inside the shade's opening. Its broad, center-bright beam fades smoothly, retaining real furniture and shade shadows. The existing lamp interaction and fades continue to control the same light.
- **Flashlight occlusion**: a weaker shadowed return from the first actual mesh hit replaces the unshadowed fill that washed light through the hallway plant. Both moving flashlight lights retain realtime shadows through probe and door updates.

These are the first scripted events requested by the owner; no additional scare event was added. Bedroom and bathroom ceilings remain initially off, the dim bathroom mirror light remains initially on, and the earlier switch, shelf and coffee work is retained. The jar and refrigerator reuse the licensed apartment asset; the new font has a bundled SIL OFL licence.

## Opening and refrigerator

`src/wake-sequence.js` owns the camera until completion. It samples a smooth phased track measured against the bed and landing aisle: head/pillow at +x, then sit, turn to the open +z side, plant feet, lean forward, rise and settle. Subtle breathing/roll and an eye-opening fade accompany the movement. The exact line is `I just had a nightmare, I will go get some water at the kitchen`. `src/wake-sequence.css` styles it with the locally bundled weight-500 Cormorant Garamond font; public font and licence files live under `public/assets/fonts/` and resolve relative to the deployed subdirectory.

Normal duration is 12 seconds of active visible wall time. Time pauses on pointer unlock, graphics/pause screens and document hiding; resume does not repay hidden time. Movement and interactions stay disabled until handoff. Space/Enter can skip even while the original entry button retains focus. Reduced-motion mode stays upright and stationary for 6.5 seconds. Final spawn is `[12.85, floor+1.62, 1.80]`, yaw 112, on the collision-tested bedside aisle. `#shot` skips the opening for inspection captures. `window.__app.wake` exposes the timeline; tests inject a clock rather than relying on GPU frame throughput.

`src/fridge.js` loads the small jar JSON and separates the actual upper door at runtime, retaining its authored metallic materials, handle, normals and UVs. `src/fridge-geometry.js` contains measured bounds, frame and hinge; `src/fridge-water.js` fits the liquid to the jar's actual rounded inner walls/floor. The lower freezer and unrelated kitchen geometry remain untouched. Only the old cabinet's front cap is removed to reveal a real cavity. New lining and glass clone the original apartment materials, with tuned roughness/opacity. See [FRIDGE_ASSETS.md](FRIDGE_ASSETS.md) for source, licence, extraction command and physical dimensions.

The upper leaf eases to 106° around its right hinge, carries its interior bins, and moves its E target and dynamic collision segment with it. It stops against the player and reverses direction on the next action. The interior source sits below the diffuser, casts shadows and has a short 1.65 m range; source and diffuser go fully off when sealed. Door motion refreshes nearby static shadows, and settled door positions recapture probes once. Transparent shelves, jar and water do not cast opaque hard shadows; opaque cabinet/door/supports do. The developer menu owns this fixture explicitly and restores the light from the current door state, including after All off.

## Implementation notes for the next agent

`src/frame-limiter.js` wraps the PlayCanvas 2.23.1 `app.tick` **before** it consumes a RAF timestamp. Skipped callbacks schedule exactly one next callback and perform no update/render work. Accepted ticks retain elapsed engine time, so changing the cap does not change walking speed. Phase-based deadlines avoid long-term undershoot on 120/144 Hz displays. A visibility change, clock discontinuity or cap change resets cadence; there is no catch-up loop. XR keeps its headset cadence. Cleanup restores the original tick and removes the visibility listener. Recheck this integration if upgrading PlayCanvas.

`fpsLimit` extends the existing `horror.graphics.v1` preferences object without invalidating saved effects. Valid values are numeric 0/30/60/90/120; 0 means Uncapped. `GraphicsSettings.apply` updates the limiter, while its existing pipeline signature avoids rebuilding render effects for an FPS-only change. Auto quality compares performance against the lower of its existing threshold and 80% of the chosen cap. `window.__app.frameLimiter` exposes the active limiter for inspection.

The arc lamp bug was physical: the previous source at `[-4.88, 1.52, 2.70]` sat above the shade's closed top at y=1.481516. Its central ray hit that top after about 38.5 mm, producing a dark center and bright edge. Shared `ARC_LAMP` data in `src/lamp-profiles.js` now places the source and 40 mm bulb at `[-4.880912, 1.31, 2.698840]`. The bulb's bottom clears the lower rim at y=1.278535 by about 11.5 mm. The full downward cone clears the actual mesh; the shade continues to block upward light. `arcLampProfile` supplies a smooth center-bright cookie, with a 28° inner / 70° outer cone. Intensity is 1.6 rather than the old 2.3 to balance the newly unobstructed beam. The lamp uses the existing shadow system and probe recaptures, with no disabled shade shadows or fake fill lights.

`tools/check-lamp-lighting.mjs` decodes the committed glTF and tests the actual triangles. It reproduces the original blocker, checks the new cone every degree at twelve azimuths, tests bulb clearance and upward occlusion, and verifies a monotonic beam profile and the extractor's placement beneath its diffuser. Do not move the lamp source above the shell to adjust brightness.

The hallway pot and leaves were already opaque shadow casters and the beam's atlas allocation was healthy. The old flashlight return was an unshadowed omni of about 0.428 intensity at the inspected pose, placed from the coarse walking grid. It lit through the plant and masked its silhouette. `src/flashlight-surfaces.js` now uses mesh-local cached triangle BVHs and current instance transforms to find the first rendered occluder, including moving doors. Queries run at 10 Hz; measured cached traces are about 0.1 ms here, with a one-time lazy construction cost of roughly 25–50 ms for the inspected scene. The return is a shadowed outward-facing spot with maximum intensity 0.12, attenuated by distance, incidence and reflectance (0.056 at the captured pot). Beam normal bias is 0.006 for closer contact. Both lights explicitly use `SHADOWUPDATE_REALTIME`; `rerenderShadows` and `refreshShadows` preserve realtime modes rather than converting the moving return into a cached map. Probes suspend both flashlight sources during capture.

## Validation

All 74 Node regressions pass, including real PlayCanvas tick update/render counts, elapsed movement time, 120-second simulated 60/120/144 Hz display clocks, fractional timestamp jitter at multiple starting phases, cap changes, resume, persistence, Auto quality, actual fixture/plant/fridge geometry, camera-track continuity, water clearance, door collision, interactions, coffee, switches and flashlight placement. All eight room destinations remain reachable. Production build passes. The preview workflow runs the new timing, lamp, shadow, wake and fridge regressions before publishing.

```sh
npm run build
node --test tools/check-interactions.mjs tools/check-graphics-settings.mjs tools/check-frame-limiter.mjs tools/check-lamp-lighting.mjs tools/check-flashlight-shadows.mjs tools/check-wake-sequence.mjs tools/check-fridge.mjs tools/check-coffee.mjs tools/check-flashlight-placement.mjs tools/check-switches.mjs
node tools/check-reach.mjs
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
python3 tools/check-graphics-ui.py http://127.0.0.1:4175/
python3 tools/check-wake-browser.py http://127.0.0.1:4175/
python3 tools/check-fridge-browser.py http://127.0.0.1:4175/ /tmp/horror-fridge-check
python3 tools/check-browser.py http://127.0.0.1:4175/ webgpu
```

The graphics browser check exercises native controls, saved FPS limits after reload, focus, mouse capture and a 320×480 viewport. For cadence measurements it briefly stubs expensive update/render work while retaining the actual engine tick, RAF scheduler, limiter and frame-end counts, restoring methods in `finally`. This verifies scheduling without treating the software-rendered apartment as a GPU benchmark. Deterministic tests separately cover refresh rates beyond the cloud browser's display cadence. A cap is an upper target; it cannot raise hardware throughput or exceed the display's refresh rate.

The natural opening browser check passed movement blocking, G pause/resume, a 12.46-second natural completion, safe standing handoff, no replay on later resume, loaded local font, native skip with the entry button focused, and a 6.75-second stationary reduced-motion completion, with no page errors. Graphics controls, effect changes, genuine preference reload and the 320×480 layout passed; a focused real engine tick check passed after waiting for the software compositor's initial transient to settle. Final bundled timing, refrigerator and hosted checks are recorded below when complete.

[Matched side-by-side captures](review-10/README.md) compare the published 0.9 application with this review. Both use the same camera, Medium quality, fixed exposure 1, seeded noise, 720×480 viewport and disabled random lightning. Grain animation is frozen only for captures; the stronger grain remains visible. FPS is hidden only in geometry comparisons. The isolated lamp view turns other emitters off and recaptures probes in both versions, making its corrected pool visible without ceiling-light overlap. No color retouching is applied.

## Publication

Pending final local browser and visual checks, followed by the `codex-review` Pages deployment and hosted verification. See [PREVIEW_DEPLOYMENT.md](PREVIEW_DEPLOYMENT.md) for deployment policy and provenance.

# Review 0.9 — graphics controls and apartment interactions

Ongoing branch: `codex-review`. Keep future reviews on this branch; merge or push to `main` only when the owner explicitly requests it. The playable address remains https://starfox 22.github.io/horror/codex/.

## Graphics and performance display

Graphics is available on the start/pause screen and with **G** while playing. Opening it releases the mouse and pauses player movement. **G**, **Esc**, **Done**, or the close button dismiss the menu; use the normal entry/resume button to return to mouse look. Keyboard focus stays inside the dialog.

Presets are Auto, Low, Medium, High and Custom. Controls include 50/75/85/100% resolution, ambient occlusion, volumetric lighting, bloom, temporal anti-aliasing, film grain and FPS display. Changes apply immediately. Saved preferences survive reload; if browser storage is blocked, the menu remains usable for the session. Keys 1/2/3 select presets and keep the menu synchronized. Auto measures actual wall-clock frames while playing and lowers quality when required.

The single FPS/frame-time HUD is **on by default**. It can be toggled in Graphics, and the developer menu reuses the same display rather than creating duplicates.

## Switches and initial lighting

Switches now reuse the original apartment author's detailed bezel/rocker mesh rather than the simplified baked version. Source attribution and extraction notes are in CREDITS.md. The 26 KB JSON includes original bevel geometry and normals. Eight wall controls are mounted against real rendered wall triangles, with the rear plane embedded 0.5 mm. Rocker parents have identity scale so toggling cannot shear them. Only 158 bounded old switch triangles are removed; walls and unrelated sockets are retained. Rapid input keeps one fade per control.

| Control | Initial state | Behavior |
| --- | --- | --- |
| Bedroom ceiling | Off | Independent of bedside lamps and closet illumination |
| Bathroom ceiling | Off | Separate from mirror |
| Bathroom mirror | On, dim | Own adjacent wall control; light intensity 0.12, emitter glow scaled 0.35 |
| Extractor hood | On, dim | E at its underside/control area; intensity 0.22, range 2.8 m; separate from kitchen ceiling |
| Kitchen ceiling | Off | Independent ceiling group |

There are nine room/fixture groups in total. Living/office ceilings and bedside lamps retain their previous defaults. The shoe-closet fixture remains softly on, and wardrobe LEDs follow their doors. Developer light reset now also restores fixtures that have no room-switch owner.

## Flashlight

Both authored body and lens are moved together, preserving the model's original orientation. Shared placement data in FLASHLIGHT_SPOT specifies the actual shelf surface instead of an estimated body radius. The flashlight lies diagonally at yaw 60°, with a slight nose-up tilt so its head and tail both meet the shelf naturally. The complete geometry clears the shelf by 0.8 mm and clears the front/back panels by roughly 65/62 mm. The pickup target is its real bounds center. No new flashlight asset was made.

## Coffee

The machine and cups are the existing authored model. The new animation has heating, grinding, two pre-infusion pulses, a continuous pour, finishing drips, cooldown and lingering steam. Two streams enter the actual cups. Liquid rises inside the bowls, develops crema and impact ripples, and stays 9.8 mm below the rim. Surface radius leaves at least 1 mm inside the measured inner rim. Steam is aligned to each cup and responds to local lighting.

One timeline drives visuals and scheduled Web Audio, preventing wall-clock timers from desynchronizing them on a slow GPU or suspended tab. Overlapping starts are rejected. Replays reuse and reset effects. Probe recaptures happen at the start/end of machine illumination, rather than every frame. Lazy liquid materials are assigned to the room's reflection/bounce probes.

Timeline: grind starts 0.65 s, pre-infusion 3.25 s, pour 5.35–12.4 s, finishing to 14 s, cooldown to 15.5 s, steam fades by 31 s. For deterministic inspection after starting a brew: stop its playback, set `coffee.cycle.time=8`, set `coffee.cycle.clock=()=>8`, then call `devices.updateCoffee(0)`; use 13 for finishing drips.

## Validation and captures

Baseline game revision: `f6ae1f49d48478c08e0d88329480265a02e177fb` (0.8). All 30 CPU regressions passed, along with all eight reachability destinations, the controller route, the production build, the complete graphics UI browser test and the integrated WebGPU scene/lighting/native-coffee/replay check. No unexpected page, console or network errors occurred.

```sh
npm run build
node --test tools/check-interactions.mjs tools/check-graphics-settings.mjs tools/check-coffee.mjs tools/check-flashlight-placement.mjs tools/check-switches.mjs
node tools/check-reach.mjs
node tools/check-walk.mjs
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
python 3 tools/check-graphics-ui.py http://127.0.0.1:5173/
python 3 tools/check-browser.py http://127.0.0.1:5173/ webgpu
```

The graphics browser check covers real controls, renderer changes, persistence through a reload without a hash override, pointer-lock release, focus handling, and a 320×480 viewport. The main browser check covers initial lighting states, wall/shelf placement, native E coffee activation, rendered pour/completion/replay, and the existing movement/light-restoration checks.

[Comparison gallery](review-09/README.md). Object captures use matching 720×480 inspection cameras, Medium quality and fixed exposure 1. FPS is intentionally hidden only for these geometry comparisons; its fresh-session default is tested separately and the menu screenshot shows the control. Requested initial lighting changes are present in the revised scenes. Rendering is SwiftShader for correctness, not a desktop-GPU performance benchmark. No image colour retouching is applied.

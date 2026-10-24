# Build 0.12 — no freezes, VSync, light leaks, drinking arm, new jug and glass, the first event

Claude's continuation of the promoted 0.11 baseline, on `claude/pensive-volta-et0etl`. The owner asked (2026-10-24):

1. A general performance pass: the game sometimes froze for a second and then continued, even at a good frame rate.
   Minimise freezes and stutters.
2. Default graphics "Auto", aiming for a stable 60 FPS with VSync.
3. Lighting: no random light out of the bedroom closet, no light through the hallway walls, a general lighting bug pass,
   AAA lighting.
4. The computer and laptop are on at the start (until the player turns them off).
5. A better drinking hand animation (a downloaded arm is fine), no gulping sounds, only the refreshing exhale at the end.
6. A normal kitchen water jug and drinking glass in the fridge instead of the odd ones.
7. A first scripted event: exactly 3 s after the fridge is shut after drinking, glass shatters somewhere in the bedroom
   and the player thinks "What was that?". The developer menu gets an Events submenu listing every scripted event in
   story order, each one playable from there.

## 1. Freezes and stutters (where they came from, what fixed them)

Measured with `work/perf/hitch.mjs`-style instrumentation (shadow-map faces rendered and shaders built per frame, draw
calls per frame) on the same scripted tour of the flat, before and after. Software rendering cannot time a real GPU,
but these counts are what a freeze is made of.

| Cause | Before | After | Fix |
| --- | --- | --- | --- |
| Shadow atlas re-layout. The engine sizes its shared shadow-atlas grid by how many shadowed lights are on and in view this frame; every grid change re-renders every visible lamp's shadow in one frame. Turning round or walking into another room did it. | 8-10 shadow faces, up to 1,150 draw calls in single frames while just looking around; 57 faces / 7,450 draws for "All on" | 0 while looking around; 0 for "All on" | `fixShadowAtlas()` (lighting.js): one fixed grid cell per shadowed/cookie light, set once all lights exist. |
| Shader compiles on first sight (a room, the coffee steam, the drinking hand, lamps that start off: their shadow shaders). | 20 shaders in one frame on the first look into part of the bedroom | 0 in play | `warmUp()` (warmup.js) behind the loading screen: the player camera looks six ways from ten points, with later-only things shown and every shadowed lamp that starts off switched on at zero for the sweep. |
| The first lightning flash enabled a directional light, which changes every lit shader in the flat. | full recompile at the first flash | none | The sky light stays enabled at zero intensity (rain.js); only its shadow is refreshed at each flash. |
| Probe recapture (every switch, lamp, fridge, laptop, computer, coffee) rendered 8 cube probes, all lamp shadows and the filtering in one frame, plus a blocking read-back. | 4,428 draws + 14 shadow faces in one frame for one switch | ≤ 744 draws per frame, 0 shadow faces | probes.js: the capture is spread over ~20 frames (2 cube faces or one filter step a frame) into "next" textures, then cross-faded into the live ones (0.45 s, a GPU blend pass). The flashlight is excluded per camera (light-mask shader patch) instead of being switched off for the capture; static shadows are no longer re-rendered for it. |
| Moving doors (fridge, wardrobe, bathroom, laptop lid) re-rendered every shadow within a broad radius each frame. | ~9 shadow faces per frame during the fridge swing | 2 | `refreshShadows()` only takes lamps that reach the moving part and, for spots, have it in their cone; the fridge's interior light is a downward spot (1 shadow view instead of an omni's 6). |
| Auto quality steps changed the shadow filter, the shadow-atlas size and whether AO is part of lit shaders: each step recompiled the whole flat and re-rendered every shadow. | one freeze per Auto step | none | scene-quality.js / post.js: every preset keeps PCF3 shadows, a 4096 atlas and AO in the lighting; presets now differ only in what can change without a hitch (resolution, effects, AO samples, anisotropy, rain). |
| Probe cameras drew the coffee steam and rain particles (and built their own particle shader mid-game). | 1 shader | 0 | Particles are on an `Effects` layer only the player camera renders (`effectsLayer()`). |

## 2. Auto + VSync defaults

- Graphics preferences moved to `horror.graphics.v2`: a fresh browser and anyone coming from 0.11 start on **Auto**
  with **VSync** (only the FPS-counter choice is carried over, once).
- **VSync** (`fpsLimit -1`, frame-limiter.js): frames land on whole display refreshes: every refresh on 60-90 Hz,
  every second refresh on 120-179 Hz (60-89 FPS), every third or fourth on faster screens, so the rate is never below
  60 and every frame lasts the same time. The refresh period is measured from the RAF callbacks (median), and each frame
  re-anchors on the refresh it ran. (A plain 60 cap on a 144 Hz screen alternates 2- and 3-refresh frames: judder.)
  "Every refresh" (`0`) and the 30-120 caps remain.
- Auto still steps down after three seconds below 92% of 60 FPS, now without any recompile or shadow re-render.

## 3. Lighting bug pass

- Every light now casts shadows except the coffee machine's 0.8 m panel glow. Unshadowed lights shine straight through
  walls: the bedside lamps' spill (the right one sits 0.7 m from the corridor wall) lit the corridor; the wardrobe LEDs
  and the shoe-closet light lit the bathroom through the wall and the ceiling and floor round the wardrobe; the iMac and
  laptop glows lit the bathroom and the dining area through walls. Screen glows are now spots aimed out of the screen.
- The bedside reading lamps' cone is 55° (it was 72°, which reached across the room into the shoe closet).
- Light-leak renders (only the bedroom's lights on, everything else off) are in `docs/build-012/`: the bathroom was lit
  through its wall, the corridor ceiling glowed by the bedroom door; both are dark now.

## 4-7

See the sections below and `src/story-events.js`, `src/falling-glass.js`, `src/thought.js`, `docs/DRINK_ASSETS.md`.

# The Apartment: working notes for Claude

A first-person browser horror game in the spirit of Konami's P.T. (one quiet night-time apartment, photoreal, AAA
look), built on PlayCanvas 2.23.1 (WebGPU with a WebGL 2 fallback) and Vite. The owner works with AI agents (Claude
on its own branch, Codex on `codex-review`) and asks for one batch of changes at a time.

Current owner handoff (2026-10-26): development returned to Codex. `main` and this Claude branch were exactly the
same 0.15 commit (`c5a619f`); Codex incorporated that whole history and continues its 0.16 bug pass on `codex-review`.
Read `docs/REVIEW_16.md` and the current section of `docs/HANDOFF.md` before resuming. The Claude-specific branch
rules below remain in force for future Claude tasks; historical main-promotion approvals do not authorize new pushes.

## Read first, in this order

1. `AGENTS.md`: branch and merge rules shared with Codex.
2. `docs/HANDOFF.md`: the owner's requirements build by build, how everything fits together, published builds,
   **Gotchas learned the hard way** (read them all before touching lighting, probes, shaders or the shadow atlas).
3. `docs/BUILD_015.md`: the latest Claude build (no light for the intruder and his footsteps, the cut that waits for the
   torch and flickers first, replayable developer events, the floors' normals, the new phone and its screens, the bug
   pass). `docs/BUILD_014.md`: the build before it (the owner's simpler story: the evicted man never left; the knife,
   the porcelain mask, the crow, the taps, the death with blood and the fall, the hold-to-unlock escape, the developer
   menu's delayed events) and how it was verified; `docs/STORY.md` (v3): the design every beat follows (truth,
   triggers, fallbacks, scares, endings, evidence). `docs/BUILD_013.md` (the night's systems: power, fuse box, phone and
   camera, the stalker AI, endings, menus, props and recordings), `docs/BUILD_012.md` (freezes, VSync, light leaks, the
   drinking arm, the scripted-event system) and `docs/CLAUDE_HANDOFF.md` (Codex's 0.11 handoff) remain useful.
4. Topic docs when you touch that area: `docs/DRINK_ASSETS.md`, `docs/FRIDGE_ASSETS.md`, `docs/CREDITS.md`,
   `tools/perf/README.md`, `tools/arm/README.md`; the headers of `tools/intruder/build.mjs`, `tools/props/build.mjs`,
   `tools/audio/build.mjs` and `tools/bake-clips.mjs` (each says how to reproduce its assets).

`README.md` has the file map (`src/*.js`, one system per file, each opening with a comment on what it does).

## Working rules (the owner's)

- Work on `claude/pensive-volta-et0etl` (the owner: "do not create a new one", even if the session suggests another
  branch); start by fetching it and `main` and merging `main` in if it moved (Codex pushes docs there). Merge into or
  push to `main` **only when the owner asks in the current conversation**; a past approval does not carry over. No
  pull requests unless asked. Never touch `codex-review`.
- Every push to `claude/pensive-volta-et0etl` publishes a playable preview at **https://starfox22.github.io/horror/claude/**
  (`.github/workflows/pages-claude.yml`: main at the root, codex-review at /codex/, this branch at /claude/; it runs the
  Node regressions first). Check the run with the GitHub tools (`actions_list` for the branch); github.io itself is not
  reachable from the sandbox.
- **Download assets, don't build them**: models, textures and sounds come from ready-made assets with a clean licence
  (CC0 / CC BY / MIT / BSD), credited in `docs/CREDITS.md` and, for shipped assets, on the start screen's credit line
  (`index.html`). Only GitHub, npm and PyPI are reachable from the cloud sandbox (Sketchfab, Poly Haven, Freesound
  are blocked); GitHub repos often mirror them with their licence. Show the owner previews before swapping in a new
  look. Primitive geometry only for small functional pieces (water surfaces, fridge lining).
- Follow `docs/STORY.md` (v3, build 0.14): the owner wants the story **simple** (the evicted man never left; no names,
  no backstory: "let the player imagine the rest"), plenty of believable jump scares with tension built before he is
  seen, and escape as the goal. The owner **rejected** a helpful-caretaker-is-the-killer twist and a chained front door
  (too close to Netflix's "Unhinged"): don't bring them back. From 0.14 the owner handed over creative control ("make
  the game AAA"), but keep new beats in STORY.md first. Scripted events go in `src/story-events.js` (`STORY_EVENTS`, in
  story order; the developer menu's Events list queues them to play 3 s after the game resumes); the beats live in
  `src/story.js`.
- Place props on measured surfaces (`node tools/surfaces.mjs x0 x1 z0 z1 [y0 y1] [x|y|z]`), never on guessed heights.
- Every visual change: before/after captures (headless) in `docs/build-0NN/`, and a section in a `docs/BUILD_0NN.md`
  for the build plus a short entry in `docs/HANDOFF.md` (requirements list and "where they live"). Bump the build number
  on the start screen (`index.html`, "Build 0.NN").
- Never put a model name or ID in commits, docs or the game.

## Commands

```sh
npm ci                                  # once per fresh checkout
node --test tools/check-*.mjs           # all regressions (~15 s, no browser); must stay green
node tools/check-reach.mjs              # every room reachable after collision/door changes
npm run build                           # dist/ (relative paths)
npx vite preview --host 127.0.0.1 --port 4175 --strictPort   # serve dist/ for browser checks
```

Headless browser checks (Playwright + Chromium with SwiftShader are preinstalled: run with `NODE_PATH=$(npm root -g)`;
there is no Python Playwright, so Codex's `tools/check-*.py` cannot run here). Software rendering runs at ~1 frame per
second and takes minutes to load the flat: run long checks in the background and poll their output files.

- `tools/perf/final-check.mjs <url> [webgpu]`: after the load-time warm-up, a play-through (Act I's interactions and
  the night: the cut, fuse box, the figure, phone and LIVE, the hunt, the grab) must build **no shaders** and render no
  bursts of shadow faces. Run it on WebGL and WebGPU after anything that adds materials, lights or effects.
- `#play` runs the night without pointer lock (story time, the director, thoughts): headless play-throughs step the
  systems by hand (see BUILD_013.md, Verification).
- `tools/perf/hitch.mjs`, `leak.mjs`, `drink-shots.mjs`, `event-check.mjs`: see `tools/perf/README.md`.
- `tools/shoot.mjs dist <out> name=x,z,yaw[,pitch] ...`: screenshots at chosen spots (`#shot` skips the intro).
- `tools/perf/scene-shots.mjs dist <out> <scenes.mjs>`: staged story moments (the death mid-stab, his run, the phone
  booting) from one page load; each scene is a function run in the page with `window.__app` (see its header). Run one
  browser job at a time: with several, the warm-up alone takes 30-45 minutes.
- URL hash options for tests: `#webgl`, `#q=1|2|3`, `#shot=x,z,yaw,pitch`, `#warm` (warm-up even with `#shot`),
  `#dark`, `#allon`, `#flash`, `#stats`. `window.__app` exposes every system (`drink.apply(t)`, `events.run(id)`, ...).
- Never `pkill -f` a pattern that appears in your own shell command line (it kills that shell): use `[x]yz` patterns
  in a command of their own.

## Things that are easy to break (details in HANDOFF.md Gotchas)

- Freezes come from shader builds and shadow re-renders, not frame rate: keep `fixShadowAtlas()` after adding any
  shadowed or cookie light; never toggle a directional light, the shadow filter, the atlas size or SSAO's lighting mode
  in play; add anything that first appears later to the warm-up `reveal` list in `src/main.js`.
- Every light casts shadows (unshadowed lights shine through walls).
- Probes capture direct light only (`bounceLive`), spread over frames and cross-faded; the flashlight is kept out by
  its light mask, the arm and carried glass by `isVisibleFunc`, particles by the `Effects` layer.
- The drinking arm (`src/arm-rig.js`) is posed by IK; `tools/check-drink-sequence.mjs` asserts the sleeve's cut end
  never enters the view and the glass never slips in the hand.

## Publishing (the owner's claude.ai artifact)

Publish only when the owner asks (they usually say "publish" or "push"). Always update the same artifact:
**https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9** (pass it as `url`; a new conversation must read or list it
first, never create a new one).

1. `npm run build && node tools/make-artifact.mjs > work/artifact-files.json` (prints the files; GLBs become
   `*.glb.b64.txt`, the apartment becomes base64 parts `assets/apartment/apartment-N.txt`).
2. `Artifact` action `list` with `scope: "files"` on the url to see what is live.
3. Publish with `file_path: dist-artifact/index.html`, `root: dist-artifact`, the `url`, and a `files` map of every
   new or changed file, plus `null` for files to remove (the old `assets/index-*.js` / `.css` hashes). The apartment
   parts, `collision.json` and `lib/` only change when `public/assets/apartment` or `public/lib` changed
   (`git diff --stat <last published commit> -- public/assets/apartment public/lib`); skip them otherwise. Limits:
   64 MB per call (split the parts over two calls to the same url), 15 MB per file.
4. Record the build in `docs/HANDOFF.md` "Published builds". Pushing to `main` also deploys
   https://starfox22.github.io/horror/ through GitHub Pages (and removes Codex's `/codex/` preview until it reruns).

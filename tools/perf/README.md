# Browser checks for hitches, light leaks and the scripted interactions (build 0.12)

Headless Chromium with SwiftShader (Playwright from `NODE_PATH`, e.g. `NODE_PATH=$(npm root -g)`), against a running
`npm run preview -- --host 127.0.0.1 --port 4175 --strictPort`. Software rendering runs at about one frame per second:
these scripts count what makes frames slow (shadow-map faces, shader builds, draw calls) instead of timing them.

| Script | What it does |
| --- | --- |
| `hitch.mjs <url> '#webgl&q=3&shot=11.2,0.5,0&warm'` | Looks four ways from eight points, then "All on", switches, lightning, flashlight, fridge; per step: shadow faces, shaders built (names), draw calls. |
| `final-check.mjs <url> [webgpu] [--report file] [--captures dir]` | After normal warm-up, Act I through hunt/death/wake, plus paused-bed and no-torch death wiring. Initialization/page/request/console errors or shader builds fail with a nonzero exit. Shadow counts are reported; use an explicit `--max-shadow-faces N` budget when defined for the scenario. |
| `leak.mjs <url> <outdir> '^Bedroom' name=x,z,yaw[,pitch] ...` | Only one group's lights on (developer overrides), then screenshots of neighbouring rooms: light there came through a wall. |
| `drink-shots.mjs <url> <outdir> [x,z,yaw,pitch] [webgpu]` | Opens the fridge and renders the drinking action at fixed times (`TIMES=...`); log in `<outdir>/log.txt`. |
| `events-audit.mjs <dist> <out.json> [--shots dir] [--endings]` | Checks real first phone pickup and legacy-save migration, then every developer-menu event in story order, reverse order and endings. A controlled Director clock checks the exact selected event after 3 s of active play; dead, unexecuted, early, late, paused or erroneous results fail with a nonzero exit. |
| `scene-shots.mjs <dist> <out> <scenes.mjs>` with `scenes/phone.mjs`, `scenes/hall-torch.mjs`, `scenes/tour.mjs` | The phone in the hand and on the nightstand; the corridor in the dark with the torch; a tour of the flat lit, dark with the torch, the man in the beam, lightning. |
| `event-check.mjs <url> [webgpu]` | Drinks, shuts the fridge, checks the falling glass fires once after 3 s of play with its thought, and the developer menu's Events button. |

Never `pkill -f` with a pattern that appears in your own shell command line (it kills the shell).

Only run one full game browser at a time on the cloud CPU renderer. Set `CHROMIUM_PATH` for a particular installed browser; the newer checks fall back to `/usr/bin/chromium` if Playwright's downloaded browser is absent. Hosted final checks preserve the session proxy and TLS verification. Inspection captures can use `scene-shots.mjs --skip-warm`; performance checks must retain normal warm-up. Review 0.16 fixes prior audit scripts that printed failures yet returned exit code zero; inspect their JSON as well as process status.

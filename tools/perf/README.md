# Browser checks for hitches, light leaks and the scripted interactions (build 0.12)

Headless Chromium with SwiftShader (Playwright from `NODE_PATH`, e.g. `NODE_PATH=$(npm root -g)`), against a running
`npm run preview -- --host 127.0.0.1 --port 4175 --strictPort`. Software rendering runs at about one frame per second:
these scripts count what makes frames slow (shadow-map faces, shader builds, draw calls) instead of timing them.

| Script | What it does |
| --- | --- |
| `hitch.mjs <url> '#webgl&q=3&shot=11.2,0.5,0&warm'` | Looks four ways from eight points, then "All on", switches, lightning, flashlight, fridge; per step: shadow faces, shaders built (names), draw calls. |
| `final-check.mjs <url> [webgpu]` | After the warm-up: fridge, drink, fridge shut, falling glass, lightning, switch, flashlight, coffee; any shader built or shadow burst is a regression. |
| `leak.mjs <url> <outdir> '^Bedroom' name=x,z,yaw[,pitch] ...` | Only one group's lights on (developer overrides), then screenshots of neighbouring rooms: light there came through a wall. |
| `drink-shots.mjs <url> <outdir> [x,z,yaw,pitch] [webgpu]` | Opens the fridge and renders the drinking action at fixed times (`TIMES=...`); log in `<outdir>/log.txt`. |
| `event-check.mjs <url> [webgpu]` | Drinks, shuts the fridge, checks the falling glass fires once after 3 s of play with its thought, and the developer menu's Events button. |

Never `pkill -f` with a pattern that appears in your own shell command line (it kills the shell).

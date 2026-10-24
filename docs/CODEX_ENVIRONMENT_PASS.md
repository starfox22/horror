# Codex environment pass — build 0.8

Development branch: `codex-review`.
Baseline: `7b93acb3f34085e078ad32f0c2baae415341e486` (Claude build 0.7).

The scope is the walkable apartment, lighting, material presentation, and object interactions. No enemies, narrative events, puzzles, or scares have been added. Existing weather remains. No external assets or new licences were needed.

## Visual changes

- Ceiling LEDs use a more neutral warm white, a broader beam shoulder, and a slightly longer falloff. Their intensity is reduced from 1.0 to 0.92 so brighter coverage does not simply mean brighter pools. The practical lamps keep their warmer colour.
- Ceiling shadow bias is reduced to improve contact with surfaces. The 4096-pixel shadow atlas is retained; this pass does not silently double its memory cost.
- Ambient occlusion works at furniture-contact scale (0.35 m rather than 1.2 m), with less aggressive power. High quality uses full-resolution AO and 24 samples; medium uses half resolution and 12 samples.
- Room reflection filtering retains the 256-pixel capture resolution instead of first reducing it to 128. Diffuse-only probes remain small. The direct-only probe capture scheme is preserved so toggling lamps cannot feed earlier captures back into themselves.
- Up to 8× anisotropic filtering keeps angled floors, wood grain and fabrics clearer.
- Volumetric haze density and local scattering are reduced. Warm bulbs retain restrained bloom, with less broad blur.
- Less vignette, chromatic aberration and film grain reveal material detail. Colour saturation is closer to natural; exposure remains adaptive and grading contrast remains 1 to avoid clipping dark values.
- Shadow refresh discovers the current application's lights, avoiding a process-global stale light cache.

## Bugs fixed

- Optional absent apartment manifests no longer break development startup when a host serves an HTML fallback. Vite uses multi-page mode, and the loader handles ordinary glTF and packed artifact manifests explicitly.
- Loading UI respects the hidden attribute. Asset failures display the actual cause and a reload action; invalid manifest/chunk sizes are rejected. Temporary blob URLs are released.
- Concurrent light recaptures share a completion promise. Startup waits for completion and capture failures restore flashlight state.
- Wardrobe prompts move with their handles. Doors blocked while closing can be reopened with the next use.
- Pause clears velocity and held inputs. Menu key presses do not begin movement on resume, and holding B toggles head bob once.
- Use input rechecks reach and busy state between frames. Developer mode releases mouse capture.
- Developer light overrides include laptop keys/screens, computer screens and the coffee panel, and remain authoritative during device fades. Returning to switches restores the actual device state.
- Rapid lamp toggles replace stale fades. Closing a laptop while its screen wakes cancels that wake animation; sleeping/waking refreshes bounce light.

## Validation and reproduction

From the repository root:

```sh
npm ci
npm run build
node tools/check-reach.mjs
node tools/check-walk.mjs
node --test tools/check-interactions.mjs
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

The external onboarding Vite override is no longer required on this branch. The source config now contains the fix. `check-reach` checks eight destinations. `check-walk` exercises the real controller but only prints its route; the eight interaction regression tests have assertions.

Browser tools use Python Playwright and Chromium supplied by the cloud image. Outside that image, install Playwright and Chromium before running them. The screenshot tool also accepts `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` for a different installation.

```sh
python3 tools/check-startup.py http://127.0.0.1:5173/
python3 tools/check-browser.py http://127.0.0.1:5173/ webgl
python3 tools/check-browser.py http://127.0.0.1:5173/ webgpu
python3 tools/capture-review.py http://127.0.0.1:5173/ /tmp/horror-review
```

Startup checks inject HTTP errors, malformed JSON and invalid manifest part sizes, then verify recovery UI and an HTML-fallback success case. Browser checks exercise real rendering, entry/pause, developer mode, flashlight, movement and lighting recapture. Results should be assessed by exit status and final output, not merely an open port.

The comparison captures use identical 960×540 viewports, quality 3, camera poses, seeded randomness, and fixed exposure 1. They allow 20 rendered frames to settle TAA after each move. Lightning is held off for comparisons. These are raw engine captures, with no colour retouching. Weather and grain can still vary with frame timing. Ordinary play continues to use auto exposure.

Software rendering is useful for correctness and comparison, but is not a desktop GPU performance benchmark. Validate frame time, audio and mouse feel on a real browser before increasing shadow resolution or reflection capture sizes further. The first full quality capture can take several minutes under SwiftShader.

## Recorded validation results

- Production build passed; all eight named rooms/locations were reachable. The scripted controller route completed.
- Eight CPU interaction/input regression tests passed.
- Startup fault injection passed for collision HTTP 503, invalid manifest JSON and inconsistent manifest part sizes. HTML fallback loading and runtime error recovery (including mouse release) passed.
- WebGL 2 and WebGPU browser checks passed: 217 render components, seven switch groups, four independent lamps, movement, native mouse capture/release, developer mode, flashlight pickup, and no unexpected page/console/request errors.
- WebGL all-off probe maximum: `0.0000999881`; restoring switches changed probe values by at most `0.0000066773`.
- WebGPU all-off maximum: `0.0001006688`; with the faint exterior sky disabled for diagnosis, every probe was exactly zero. Restoring switches changed values by at most `0.0000296114`. The browser check asserts zero forced indoor emitters, near-zero sky-isolated probes, and allows the small backend filtering difference in the exterior contribution.
- Four matched full-quality room views completed without page errors. The revised `shoot.mjs` also completed a real Chromium screenshot using installed Playwright discovery.

## Publishing and continuity

The branch was pushed and the GitHub workflow built both games successfully, but publication stopped because Pages is disabled. The agent integration cannot enable Pages. See [PREVIEW_DEPLOYMENT.md](PREVIEW_DEPLOYMENT.md) for the workflow that preserves the original game at the site root and adds this branch at `/codex/`. Do not claim a live preview until the Actions run succeeds and `/codex/build-info.json` matches the intended commit.

Use the existing isolated checkout for cloud tasks. Do not create an additional worktree unless explicitly requested. Keep all Codex review passes on `codex-review`. Merge into or push to `main` only when the owner explicitly requests that operation. Read `HANDOFF.md` for model conventions, light-switch ownership, collision geometry and licence information.

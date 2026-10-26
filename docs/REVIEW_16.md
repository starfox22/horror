# Codex continuation 0.16 — synchronization and bug pass

The owner moved development back to Codex on 2026-10-26, requested the latest `main` and `claude/pensive-volta-et0etl` be compared, all Claude changes be incorporated into `codex-review`, then a bug pass and updated playable link.

## Verified starting point

Both remote branches were fetched directly. They were identical in commit history and every tracked file:

| Branch | Build | Commit | Tree |
| --- | --- | --- | --- |
| `main` | 0.15 | `c5a619f1e75881f46edbcf392f6c7f1e27e7a47e` | `67007d7daf7b38e31eaabb54dc3e857b1ab1b118` |
| `claude/pensive-volta-et0etl` | 0.15 | `c5a619f1e75881f46edbcf392f6c7f1e27e7a47e` | `67007d7daf7b38e31eaabb54dc3e857b1ab1b118` |

Remote `codex-review` was `0f3f13da6e3ff553ec6fd4326736a1ac0bc15d24` (verified 0.11). It was an ancestor of the shared 0.15 commit, 59 commits behind. The existing checkout was fast-forwarded, preserving every earlier Codex commit and every later Claude commit, asset, story system and document. There was no conflict resolution, reset, history rewrite or change to either source branch. All further development and pushes use `codex-review`.

The inherited game is the complete night described in [BUILD_015.md](BUILD_015.md), [BUILD_014.md](BUILD_014.md) and [STORY.md](STORY.md), including the phone/hand, power/fuse box, intruder, hunt, crow, death, checkpoints and endings. It supersedes the earlier quiet apartment prototype. No new story beat or asset is introduced by this bug pass.

## Confirmed bugs fixed

- **Rapid power changes:** an older restore animation could keep a circuit bright after the main switch was turned off again. New transitions replace superseded transitions on the affected circuits while retaining unrelated fades.
- **Fault retrips:** trying to restore a wet circuit/RCD captured the circuit snapshot after lowering the RCD, so owners missed the off event and could stay lit. The energized snapshot is now captured before retripping; every owner reaches zero. Restoring the main after enabling a wet breaker while supply was off also trips the RCD, closing a second path around the fuse-box fault.
- **Disappearing HUD instructions:** each prompt/toast/voice/sound-caption fade scheduled an untracked delayed hide. Replacing a message during that fade allowed the old callback to hide the new message. Each channel now tracks and cancels its active timer through both fade phases.
- **Phone call interference:** old questions and automatic hangups could speak into or terminate a new call after redialing. Call-bound callbacks now check their original call identity and cancel obsolete connection/callback timers. Information already given still dispatches police after hanging up; that remains a separate world event.
- **Invisible flashlight occluder:** the security-camera-only actor remained enabled but invisible to the player. The bounce trace ignored the actor's per-camera visibility and hit his invisible body. It now uses the player's internal engine Camera and honors the renderer's visibility callback; geometry-only tools retain their camera-free behavior.
- **Scaled floor-level geometry:** normal repair assumed uniform scale although the committed apartment includes nonuniformly scaled curtains and door geometry. It now uses inverse-transpose world normals and the corresponding transpose conversion back to local space. A survey found 265 corrected vertices with errors above 2°, worst 55.59°; the corrected normal deviation is effectively zero. Tangents remain perpendicular, and existing axis-aligned floors retain their correction.
- **Unlit no-torch capture:** the existing death fallback asked for lightning but `main.js` never supplied its `rain` dependency. The real rain system is now passed in, preserving the existing fallback for developer/replayed catches before torch pickup.
- **Paused bed ending:** the delayed return-to-sleep action now verifies active play before triggering an ending, even if an earlier interaction focus and held key survive until its callback.
- **Stale menu build label:** the title menu had a separate hardcoded version. Its footer now reads the existing start-screen build label, keeping both views consistent on later releases.

Tests first reproduced the power, HUD, phone, visibility and normal-transform defects against the old behavior. The source/API, fonts and layout of the HUD and phone remain as designed in 0.15; the fixes address incorrect timing, visibility and light state.

## Validation and captures

The frozen 0.15 baseline passed 213 real Node checks. The new 0.16 application passes **231** checks and the production build. The `check-collision.mjs` picture generator is deliberately excluded; it is not a regression and writes into `assets-src/`. Reachability covers all eight destinations through the existing check file. No apartment asset regeneration is necessary.

```sh
npm ci --cache /tmp/horror-npm-cache --no-audit --no-fund
node --input-type=module <<'NODE'
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('tools').filter(n => /^check-.*\.mjs$/.test(n) && n !== 'check-collision.mjs').sort();
const result = spawnSync(process.execPath, ['--test', ...files.map(n => `tools/${n}`)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
NODE
npm run build
```

The npm cache path stays inside writable temporary storage; this environment's inherited default cache under `/home/agent` was unavailable. Dependency versions remain the imported lockfile's versions.

The full WebGPU runtime audit passed all **26 scenarios**, with zero post-warm-up shader builds and no page, console or request errors. It covered fridge/drinking/coffee, switches, power, the figure, phone/LIVE, hunt, crow, caught/wake, plus real paused-bed and no-torch death fallback assertions. The observed peak was nine shadow faces in a frame; counts are reported rather than hidden behind a zero exit status. The WebGL developer-event audit passed all **28 cases**: 12 story events in order, then reverse order, then all four endings. Every selected event ran after 3 seconds of active play within the 0.25-second inspection window, none while paused, and each produced the expected sounds, dialogue or state changes. No runtime problems were reported.

[Matched captures](review-16/README.md) use actual game code, identical cameras and controlled inspection timelines. HUD captures advance the real fade callbacks with a controlled clock, and the power comparison freezes the same rapid off/restore/off sequence at 600 ms. Phone comparisons show real redial outcomes through the real story scheduler. Images are not color-retouched. CPU SwiftShader verifies rendered behavior rather than desktop GPU throughput. [Validation JSON](review-16/validation.json) includes both complete runtime reports.

The browser audit tools now fail nonzero on reported errors, dead/paused/early/late manual events or unexpected shader builds, rather than merely printing them. They accept installed system Chromium when Playwright's private browser is absent and clean up their browser processes. Run one game browser at a time on the cloud renderer. See [the performance-check guide](../tools/perf/README.md).

## Publication and continuation

The Codex Pages workflow now runs every real current Node regression, including story, phone, power and floor-normal tests. It builds the triggering Codex commit and separate read-only checkouts of `main` and Claude's branch, preserving `/horror/`, `/horror/codex/` and `/horror/claude/` together. Both preview build-info files record all three source SHAs. Publishing requires no source commit or push to `main` or Claude's branch.

Play the published 0.16 at https://starfox22.github.io/horror/codex/?v=0.16. Final game revision: `0690cf2d7b0aa5afafed66f925907305a9952f36`; [deployment 40319600101](https://github.com/starfox22/horror/actions/runs/40319600101) passed, including all 231 current Node checks and all three builds. The gameplay audits above preceded only the final menu-label correction; a real normal-menu browser smoke then verified both labels say 0.16 without page errors. No gameplay logic changed after those audits.

Both live build-info schemas match the final Codex revision and unchanged main/Claude `c5a619f1e75881f46edbcf392f6c7f1e27e7a47e`. All three HTML roots return 200 with labels 0.15 / 0.16 / 0.15. The first deployment's 106 selected asset requests passed, including every SFX manifest entry, scene/geometry/collision, normal texture, decoders, models and fonts. Final sampled assets and the new JS/CSS also return 200. The hosted final bundle `index-0wl6GmmU.js` matches the locally checked bundle byte for byte: SHA256 `8e4e2b9a686deb1bbad1f9b37d15eb479827117bfa92968fe0d17f804eece9ad`.

Documentation-only follow-ups use `[skip ci]`, so branch HEAD may be newer than the deployed game revision without an application change. Continue from this review plus the inherited 0.15/story guides; do not revert to the older 0.11 handoff as the gameplay baseline. Future pushes to `main` still need a new explicit owner instruction.

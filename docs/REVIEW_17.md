# Review 0.17 — charged phone, fitted hand and bug pass

The owner requested another bug pass, a review of the phone in the hand, and a charged phone on its first pickup. Development continues on `codex-review` from verified build 0.16 (`f6d06205549839ba5b8d8b8a13faf9fcbc7fd867`). Main and Claude's branch remain separate. No new asset downloads or license changes: this reuses the existing licensed phone and Microsoft Rocketbox hand.

## Changes

- **Ready from the first pickup:** a new night and every chapter preset start at 100%, already booted. Camera archives and emergency calling work immediately, even without apartment power. Charging remains optional. Older dead-phone checkpoints migrate to a charged, ready state without an alert scare or reboot. Loading also clears stale video, call, hand and button state.
- **Story continuity:** the Act III alert reminder uses restored power, breathing room and audibility, independent of charging. Carried phones receive it wherever the player is. Early LIVE shows the ordinary feed; the scripted visitor waits for restored power and the alert. An early credible emergency report still dispatches police immediately; its forced hunt waits for those story beats and never interrupts LIVE. Police can still arrive as a legitimate early rescue. Restored pre-hunt saves rearm that consequence from their flags.
- **Phone grip:** dedicated local rotations for all 15 finger joints fit the actual handset instead of reusing the drinking glass's grip. The thumb rests outside the active glass, fingers support the case, and the wrist remains attached through the existing IK. The drinking pose and arm asset are unchanged.
- **Phone motion:** slightly higher/farther reading position, full display visible, smooth video centring, gentle breathing, bounded mouse-look inertia and restrained walking response. All use play time; there is no wall-clock drift while paused. Head-bob preference also controls the walking response.
- **Phone controls:** wheel/click/keyboard share pause and action guards; focus/pointer-lock loss clears a held Q. Right click/Backspace hangs up and Hang up stays selectable during dialogue. The lock screen clock and battery refresh when their displayed values change. Before any glass breaks, an early call no longer claims one did.
- **Phone media and audio:** cancelled asynchronous clip loads cannot take over newer playback or resume after Q/Back. Hidden clips stop uploading frames. Incoming calls stop/hide media before replacing the screen. Answering, declining or hanging up cancels scheduled rings/dial/static, including delayed repeats. Alert replays preserve the active app, avoiding video over a forced lock screen. Read clips stay read when the later alert reminder arrives.
- **Journal:** the retired dead-phone objective is removed from the evidence total. Old/unknown entries and abandoned-run toasts cannot inflate a resumed journal.
- **Computer:** power-recovery timers cannot reverse manual control or survive another cut; a dead socket cannot boot or play a startup chime.
- **Coffee:** a dead circuit cannot start brewing; a cut stops its pump, recording and new steam while preserving poured coffee. Restoration requires a deliberate fresh brew. Visual lighting flicker alone does not interrupt a powered machine.
- **Reading and waking:** reading overlays block player look and new movement input and discard queued steps. Menu keys and Escape cannot skip a paused death wake.
- **Version:** the start screen and menu now identify build 0.17 through their shared version label.

## Verification and reproduction

The Node suite runs every actual root `tools/check-*.mjs`, excluding `check-collision.mjs` (a picture generator). Targeted regressions cover legacy saves, initial charge, phone controls, media races, story ordering, appliance power, reading input and wake pause. The geometry check uses real asset skinning and `Phone.poseHand`; it checks projected triangles, not only screen-contained vertices. Matched real-game captures and the measurable grip differences are in the [side-by-side gallery](review-17/README.md).

```sh
npm ci --cache /tmp/horror-npm-cache --no-audit --no-fund
npm run build
node --test $(rg --files tools -g 'check-*.mjs' -g '!check-collision.mjs')
node tools/phone/grip-check.mjs --report /tmp/phone-grip.json
node tools/perf/scene-shots.mjs dist /tmp/phone-shots tools/perf/scenes/review-017.mjs --skip-warm --size 960x600 --quality 3
node tools/perf/final-check.mjs http://127.0.0.1:4180/ webgpu --report /tmp/final-webgpu.json
node tools/perf/events-audit.mjs dist /tmp/events-webgl.json
```

Only one full game browser runs at a time in this cloud environment. `CHROMIUM_PATH=/usr/bin/chromium` is supported; Playwright is available through the configured global `NODE_PATH`. Use the normal warm-up for performance checks. The scene-capture `--skip-warm` flag is only for inspection.

The final Node suite passed **272 checks, zero failures** and the production build passed. The broad WebGPU run passed **27 scenarios**, including actual charged first pickup, plus the paused-bed/no-torch checks, with zero unexpected shader builds or runtime/request errors and at most nine shadow faces per frame. That graphics candidate preceded the final nonvisual call-audio, selection and journal cleanup; the final Node suite and WebGL audit use the completed bundle. The [validation record](review-17/validation.json), [WebGPU report](review-17/webgpu.json) and gallery retain that distinction.

The final-bundle [WebGL audit](review-17/events-webgl.json) passed **28 cases** (12 story events in both orders, then four endings) and **four real phone checks**: charged constructor state, immediate pickup, frozen paused pose and legacy-save migration. Every selected event ran at exactly 3 s of active play, none played while paused, and there were zero page, console or request problems. Final application bundle: `assets/index-D4muC8Xi.js`, SHA256 `70b8662e1e5d27629d1db178d5e8922724f4446266184352f439eb36a360e6ef`.

## Continuation

Phone state: `freshPhoneState()` in `src/phone.js` is shared by construction and chapter saves. Do not restore a dead starting battery or make `phoneAlertsReady()` depend on the charger. `notifyAlerts()` delivers reminders without rebooting or forcibly changing the app. `src/phone-grip.js` owns the phone-specific finger poses; `src/phone-motion.js` owns camera-space secondary motion; neither should modify the drinking sequence. `tools/phone/grip-check.mjs` is the contact/projection regression, and `tools/check-phone-grip.mjs` runs it in CI.

The broader night is still the inherited 0.15 story with both Codex bug passes. Read [STORY.md](STORY.md), [BUILD_015.md](BUILD_015.md), [REVIEW_16.md](REVIEW_16.md) and the current [HANDOFF.md](HANDOFF.md). Publish only through `pages-preview.yml` from `codex-review`; it preserves all three playable paths. Never dispatch the production or Claude workflow from Codex, and do not push to main or Claude's branch without a new explicit owner request.

# Build 0.15: the dark, the phone, the steps

Claude's continuation of 0.14 on `claude/pensive-volta-et0etl`. Playable preview of the branch:
**https://starfox22.github.io/horror/claude/** (`.github/workflows/pages-claude.yml`, on every push).

## What the owner asked (2026-10-25)

1. Better shadows, especially in the hallway: lit with the torch in the dark, "the shadows on the floor make no sense".
2. The phone does not look good in the hand and its screen is weird: an AAA phone model (downloaded) and AAA screens
   and messages on it. Screenshots of the phone and of the scenes where it is used.
3. A more dramatic power cut: first the flat's lights flicker, with a repeating short-circuit sound ("tzzz tzzz"), back
   and forth for about a second, then out.
4. Every developer-menu event must actually work 3 s after unpausing (some did, some did not).
5. The attacker has no flashlight; his steps are heard when he is near.

Mid-task: the power went off before the player could find the torch (pitch black): the power must not go off unless
the torch is already in hand; and the torch, once taken, is not switched on by itself: F switches it on, with a prompt
on screen.

## Changes (where they live)

| Area | Files | What |
| --- | --- | --- |
| No light for him | `intruder.js`, `stalker.js`, `hunt.js`, `death.js`, `seccam.js`, `story.js`, `main.js`, `devmenu.js` | His phone light is gone (the spot, its shadow, the warm-up's reveal of it). The stalker's "light" became where he looks (`looking`, `lookYaw`); in the dark he makes a person out to 7 m (was 9 with the light), less for a still or crouched shape. Caught: the player's own torch is gripped on and lights the mask (`flashlight.grip`), or, without a torch, a lightning flash (`rain.strike`). Thoughts at the hunt's start: *"There. ...By the fuse box."* / *"He's back. ...Listen."* |
| His steps | `hunt.js` STEPS, `seccam.js` footfall | A step every 0.72 m walking (1.05 m running): the bare-foot recording slowed to 0.72-0.88 (a big man's weight), gain 1.1 walking / 1.5 running, roll-off from 2 m, and within 9 m never quieter than 0.22 of full level (walls and corners still filter it); a board creaks under about one step in six. Before, his steps played at 0.5 with a roll-off from 1.2 m: about a quarter of the player's own step level at 4 m, under the rain. Heard from the bedroom during LIVE too. |
| The cut waits for the torch | `story.js` waitForTorch, brownout, tookTorch; `flashlight.js` onPickUp | The knock, the shards' and the glass's fallbacks: if the player has no torch the cut waits; the flat's lights stutter with the buzz every 12-20 s and the player thinks *"...The lights." "Where's my torch? ...The wardrobe."* (once); 2.2 s after the torch is taken the cut comes. |
| The cut | `story.js` powerCut, CUT_SURGE, shortCircuit, blackout; `power.js` surge; `sound.js` buzz | About 1.3 s of every live light stuttering together (14 steps between 2 % and 100 %), a synthesized short-circuit buzz in each dip (mains hum harmonics and crackle through a hard clip, the level sputtering), arc zaps at the bathroom wall; then the bang, the RCD and the dark as before. `power.surge(pattern)` changes no circuit, only every light's level (`k()`), so switches, lamps, screens and the fridge all flicker. |
| The torch | `flashlight.js` pickUp, `hud.js` hidePrompt, `main.js` | Taken from the shelf it stays off; *F · Flashlight on* stays on screen until it is first switched on. (`pickUp({ on: true })` for test captures and `#flash`.) |
| Developer events | `story.js` dev*, `story-events.js` | Several events did nothing when played out of order: once-only flags (the glass, the locked door, the cut, the tap, LIVE, the hunt), or a state they needed (the nest needed the man seen and the nest not packed; LIVE refused after the hunt). Each now puts in place what it needs (the torch, the power, the hunt stopped, the wardrobe door, the phone booted and up for LIVE) and clears its once-only flags, so it plays from any point of the night, again and again. |
| The phone | `tools/props/build.mjs` op `phone`, `props.json`, `phone.js`, `phone-screen.js`, `main.js` | A new model: "iPhone 17 Pro" by Ranguel (CC BY 4.0): the maker's logo filled in, graphite, full detail (51k triangles; the old one had been cut to 12 % with 512 px textures). Its screen gets planar UVs in the build, upright: the old model's screen showed the canvas upside down. The screen's look is drawn by `phone-screen.js` (previewed without the game: `tools/phone/preview.mjs`): a wallpaper of night through a wet window, status bar, the lock screen's date and clock, frosted alerts with the clips' thumbnails, Home Cam with its clips and LIVE, a player with a timeline, the emergency call (the dispatcher's words in a bubble, the answers as buttons, the call controls), the boot and the dead battery. The video sits over `VIDEO`'s rectangle on any model (`fitVideo`, `screenRect`). The first-person arm (the drinking arm again) holds it (`setHand`, `poseHand`, `HAND`). |
| The torch's beam | `flashlight.js` | The beam's pattern is dithered (its dim spill fell off over a few 8-bit levels: rings, stretched into arcs across the floor); the bounce light eases to each new spot instead of jumping there 10 times a second. |

## Verification

- `node --test tools/check-*.mjs`: 212 tests (new: the cut waits for the torch and flickers first; every developer
  event three times in different orders; his footsteps; the torch picked up off with its prompt; the phone's screen
  states).
- `tools/perf/events-audit.mjs` (new): every developer-menu event in the real game, chosen while paused (nothing runs in
  2 s of pause), then played within 3 s of resuming, each with what it did (sounds, thoughts, flags, power, the man,
  the phone, the camera, a death or an ending). 13 story events in order and again in reverse, then the four endings:
  none dead, none early, no page errors.

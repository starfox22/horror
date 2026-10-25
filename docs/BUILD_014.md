# Build 0.14: the evicted man never left

Claude's continuation of 0.13 on `claude/pensive-volta-et0etl` (the owner asked to keep this branch). Playable preview of
the branch: **https://starfox22.github.io/horror/claude/** (`.github/workflows/pages-claude.yml`, on every push), and the
claude.ai artifact https://claude.ai/artifact/4wUwgVm7PferEUwiqMeDd9.

## What the owner asked (2026-10-25)

1. The note on the fridge looked awkwardly placed: much smaller, on the outside of the fridge door, saying that "the
   resident who had been causing disturbances in the last month has finally been evicted".
2. The fridge door got stuck when the player stood in front of it, opening and closing.
3. The phone in the fridge made no sense: put it on the nightstand or the living-room table.
4. The first time the intruder is seen he must not vanish: he must quickly, believably run into the bedroom.
5. He needs at least a knife, and a creepier look.
6. Being caught: a jump scare, blood, and the player falling to the floor.
7. Jump-scare sounds loud enough to be scary; the opening glass shatter very loud wherever the player is.
8. A crow hitting a window when the player stands near it, facing it, with crow sounds.
9. Bathroom and kitchen taps turn on and off.
10. A Hollywood storyline agent to check the story; take inspiration from Netflix's "Unhinged".
11. A bug and polish pass. Scary but feasible. The final goal is to escape the flat.

Mid-task: the developer menu's events must wait until 3 s after the game is resumed (never run while paused); its
light controls must not be a permanent override (wall switches and the fuse box keep working). Then the story review:
the owner rejected a caretaker-is-the-killer twist and a chained front door as too close to "Unhinged" and asked for a
simpler story ("the evicted man, without much detail; let the player imagine the rest"), plenty of believable jump
scares, and tension before the attacker shows up; then handed over creative control: "make the game AAA".

## The story (docs/STORY.md v3)

Two story agents worked first: a Hollywood horror screenwriter (independently) and a game designer (stress-testing a
draft against the code: pacing, sequence breaks, unfair deaths, with route simulations on the real nav grid). Both
converged on a helpful-caretaker twist; the owner rejected it (see above). What shipped is the simple version:
a notice says the troublesome resident was evicted; he never left; he lives in the void above the ceilings and comes
down through the hatch in your wardrobe. Nothing explains him. The design's beats, triggers, fallbacks and scares are in
STORY.md; the designer's fixes that were kept are listed under Gameplay below.

## Changes (where they live)

| Area | Files | What |
| --- | --- | --- |
| Developer menu | `devmenu.js`, `story-events.js` (`Director.queue`) | Events (and the lightning strike) picked while paused play 3 s of play after resuming; picking it again cancels. Light controls press the flat's own switches, lamps and screens (no per-frame forcing): wall switches and the fuse box keep working; a dead circuit stays dark; Undo restores the controls as they were. |
| Phone | `phone.js`, `main.js`, `story.js` | Dead on the south nightstand (measured top 0.57 m), its charger pulled from the wall; putting it back plugs it in; it charges on the bedroom sockets' circuit and boots in Act III after the quiet, buzzing hard against the wood (a scare). Lying there, its screen is dark until something wakes it, like a real phone face up: the red empty-battery glyph when it is plugged in, its maker's ring for 3 s while it boots (silently: the light is the warning), then the lock screen with the camera alerts as the buzzing starts; it sleeps again after 20 s. Put down, it locks. Call-back answered keeps what the police were told; buzzes instead of ringing during the hunt; hold-Q hint on the lock screen. |
| The man in the corridor | `story.js` (`startSighting`, `updateSighting`, `intoTheWardrobe`) | At the edge of the torch beam by the front door he holds still 0.8 s, then sprints at the player (3.6 m/s, heavy footfalls) and swerves into the bedroom; he disappears only once out of the player's sight (nav sight test); the wardrobe bangs, a thump in the ceiling, creaks cross above the corridor towards the player. Never turned round: heard instead at power-back. |
| Story beats | `story.js`, `story-events.js`, `journal.js`, `nest.js`, `endings.js`, `menu.js` | Light under the bathroom door (a bright line at the gap fading over half a metre of floor; an additive emissive gradient, since an additive blend ignores opacity) goes out after the handle is tried; the latch clicks when you leave with the torch; a footprint in the spilt water; the knife slot; ordinary night sounds (the lift, a neighbour's toilet) and the pipes knocking when a tap shuts; the nest's falling hanger; a tagged key "5B" instead of names; endings Out / Evicted / Locked From the Inside / Sweet Dreams; Act IV is "Out". |
| Death | `death.js`, `public/assets/fx/blood.webp` | Contact to black under 3 s: the knife raised into his light (kept up if the hunt's windup already raised it), a stab, a red flash (a fade with reduced flashes), blood on the lens, a fall to the floor with a roll and a bounce, colour draining, him standing over you; black; you wake on the sofa. Page overlays and a CSS filter: no shaders. |
| Front door | `story.js`, `main.js` | Hold E for 3 s to turn the lock with the spare (progress kept); trying it before the hunt brings him down from the hatch (a race). A catch undoes a half-turned lock (it used to still play "Out" during the death). |

| Audio: loud, never clipped | `sound.js`, `ambience.js`, `music.js`, `tools/audio/` | A master chain with a fast limiter (ceiling about -1 dBFS) instead of the old -24 dB compressor; each bus has its own reverb send; the beds (loops) duck under scares; `bank.scare()` (full level through the limiter), `bank.duck()`, `bank.silence()`. The opening glass shatter peaks about -1 dBFS in the bedroom and stays within 2 dB of it anywhere in the flat (it was -6 to -10), still a shatter round corners; stings 3-5 dB louder and 0.14 s sooner (leading silence trimmed). Routing fix: `NavGrid.heardFrom` could return the listener's own position, so far sounds played inside the head. New recordings (pinned GitHub mirrors, credited): crow_caw, window_thud, wing_flap, knife_stab (CC BY 3.0), knife_slash, body_fall, faucet_open; `tools/audio/build.mjs` rebuilds chosen keys. |
| The hunt (Act IV) | `stalker.js`, `hunt.js`, `navgrid.js`, `seccam.js`, `doors.js`, `closets.js` | Fair and readable. The first encounter starts him at least 8 m of path away (fuse box, else the far end of the open-plan room, the office desk, mid-corridor, the bedroom door), sweeps for up to 25 s keeping 5 m off, and no chase can start before 7.5 s whatever ends it. Before the strike he raises the knife into his light for 0.45 s (breaking sight or getting 1.4 m away lowers it). From the hatch (the front door tried before the hunt) he lands in the wardrobe, steps out and runs for the door: holding E wins by about a second on every difficulty. His paths and hearing go through the bathroom door (he opens it; a locked door stays a wall; held shut 6 s and he gives up on it for 10 s); doorways no longer block his sight (sight.json kept only door heads there); he notices someone touching him; the alert is the player's moment (suspicion does not grow while he breathes in); no ambush in the corridor or within 4 m of the front door. Respawns patrol from the bedroom door with 8 s of grace (or his furthest point when a checkpoint puts the player close). Doors, the wardrobe and the rattled front door are 6 m noises; a running tap is 7 m and he turns it off. LIVE: he is drawn for the security camera only and leaves frame under the lens. |
| The knife | `world.js` (`buildKnives`), `props.js`, `story.js`, `journal.js` | The flat's own knife set (the chef's knife is his) on a magnetic rack on the patterned wall right of the kitchen window: paring, utility, a gap, slicing, bread. Looking at the gap from the worktop: *"...The big one's gone."* |

| Doors that push, never stick | `walkgrid.js` (`swingInto`), `fridge.js`, `doors.js`, `closets.js` | A swinging leaf (the fridge, the bathroom door, the four wardrobe doors) pushes the player out of its way through the walk grid, sliding them along it, or walks them out of a jamb to the nearest clear spot; at most 1 cm of the free edge per sub-step (never through the body, even in a long frame), the push capped at 1.8 m/s and 5 cm a frame. It stops (a bump; the next E reverses it) only when the player cannot move at all. The story-held right wardrobe door still gives a centimetre and stops until the cut. `tools/check-doors.mjs` stands the player at reachable spots in front of every leaf. |
| The notice | `world.js` (`NOTICE`, `NOTICE_SHEET`, `buildNotice`) | An A6 sheet on the measured outer face of the fridge's upper door, held by one red round magnet, 1.6 degrees off square, hung on the leaf so it swings with it; paper grain and a fold, typed in Special Elite. E reads it full screen ("NOTICE TO RESIDENTS. The resident who had been causing disturbances over the last month has finally been evicted. Thank you for your patience. — The Management"); the old A4 paper is gone. |
| Taps | `taps.js`, `world.js`, `main.js`, `story.js` | E turns the kitchen mixer and the bathroom tap on and off (from inside their rooms; water needs no power): a stream from the measured spout to the measured landing, a splash, ripples, drops; the running-water loop where it lands, a click, a last drop. The story's bathroom tap runs behind the locked door and hot after the cut (the basin brimming); shutting a tap knocks the pipes. A running tap is a 7 m noise every 2 s of play in the hunt (a lure; he turns it off). `tools/check-taps.mjs`. |

| His look and knife | `intruder.js`, `tools/intruder/` (`fit.mjs`, `fit-check.mjs`), `tools/props/` (knife, knives) | "Porcelain Mask" by sleepwalker77 (CC BY 4.0) with its blood tear, fitted under the hood (clear of face and hood in every clip: `fit-check.mjs`, 14 cases); clothes near-black in the dark flat (dyed darker, specular cut per texel: black cloth read grey under the torch because of its specular, not its colour), grime on the cuffs, dried blood on the right glove (ExileGL, CC0); the chef's knife of the flat's own set in an icepick grip, point down; `knifePose(raise, strike)` lifts it by his head and stabs down (the hunt's windup and the death use it); his phone light in the left hand; drawn into the player's torch shadow only (`seenBy`). `tools/check-intruder.mjs`: the knife points down in every clip, the mask clears the face. Captures: `intruder-before.jpg`, `intruder-after.jpg`, `intruder-knife-raised.jpg`, `intruder-knife-hand.jpg`, `intruder-corridor.jpg`, `knives.jpg`. |

(A further row is added when the crow lands.)

## The director's review (an independent read of the night as built)

A horror-director agent read STORY.md and the code and walked a first night minute by minute (with Node simulations
of the real classes). Its findings, all fixed in `story.js` unless noted (tests in `tools/check-story.mjs`):

| Finding | Fix |
| --- | --- |
| The sighting fired the instant the player stepped out of the bedroom with the torch (the latch and the "walking back east" branch on the same frame), his run passing through the player. | The latch clicks halfway down the corridor (x < 8, heard from there); the sighting is armed once the player is at x < 6 or has opened the fuse box; seen from x < 8.2; the walk-back branch only between x 8.5 and the doorway. He is always shown (a lit corridor shows him); he holds until the beam has been on him a second (1.2-2.5 s); a third cue 20 s after the cover opens (the front door's handle, slowly); his run ends inside the wardrobe, round its right door as he pulls it open, so he never vanishes in the open; bare wet feet (`step_wet`), matching his prints. |
| Act I could stall for good: the glass only followed the fridge being shut. | A fridge left open starts it too (12 s after the drink once 2 m away, 25 s at the latest); no drink by 4:00 a thought, by 6:00 the glass anyway (`armWater`, `drank`). |
| The nest was reachable in Act II, before the man existed; the wardrobe rattled while he was in the bathroom. | The right door is stuck until he has been seen, rattling only before the glass; the hanger scare and the nest only after him; the invisible "draught" dust removed. "The torch. Left side of the wardrobe." |
| The hunt could open with an unavoidable death (the wardrobe trap during the first encounter); the nest vanished in view; the start lines ignored what the player saw. | `stalker.js`: no wardrobe trap during the first encounter or a grace. The fallback waits while the player stands at the wardrobe (45 s at most) and LIVE plays; the nest is packed up out of view; "His light." only if he is in sight ("He's back."), "Torch off." only with the torch on ("Get down. Stay quiet."). |
| An early spare key ended the night ~6 minutes in (the race right after the sighting). | The hiding places can be searched after the nest or in the hunt (`spareSearchable`, `world.js`); before that the door says "He has my keys." |
| LIVE was usually missed (the bedroom shows "connecting…" for ever; lowering the phone reset it). | `seccam.js`/`phone.js`: "no signal" and *"No signal in here."* after 3 s in the bedroom; raising the phone returns to LIVE (or Home Cam). |
| Journal toasts landed on the scares. | `journal.js`: queued, one at a time, 5 s after a scare and with no thought on screen. |
| Act I had no guaranteed wrong sound before the glass. | Reading the notice: *"Finally."*; then creaks crossing the kitchen ceiling, *"...Upstairs."* (or 12 s after first entering the kitchen). |
| The phone's boot buzz often played far away. | It waits until the player is within 7 m (or two minutes); heard from elsewhere: *"My phone."* |
| No help for a player stuck at the fuse box. | A hint ladder on repeated trips (`fusebox.js` → `fuseTripped`) and after 90 s with the cover open. |
| Consistency: bare prints but boots; "— D." on the fuse label (a name); "YOU LET ME IN" (a message from him: pillar 1); the diary gendered the player; "Pick up the key" picked nothing up. | His steps are bare feet in the hunt too (`hunt.js`); the label is unsigned; the polaroid's back has only a date, *14 . 3* (*"March. ...Seven months."*); "wet footprints on the bathroom floor"; "Look at the key". |
| Explaining him away, late: "Pipes." over his weight in the ceiling; fallbacks pushed later by later events; Act II checkpoints lost their nudges. | The pipes only before the glass; fallback timers keep the sooner time (`soonest`); `armDark` re-arms the nudges on an Act II checkpoint. |
| Production: no captions for the story's sounds. | Settings · Sound captions (off by default): [Glass shatters, in the bedroom], [A bang. The power dies.], [Running footsteps], ... (`hud.js soundCaption`). |
| Polish: the lock screen's weekday; the title said Build 0.13; a player who switched the bathroom light off lost the light under the door; the locked door's prompt said "Open"; the phone's clock kept counting after a catch. | The date from the night's clock; Build 0.14; he switches the light on; "Knock"; the phone follows the bedside clock back to 03:07. |
| Lines (the reviewer's table). | "I never unplug it." · "The fuse box. Far end of the hall." · "He's in my bedroom." · "112. What's your emergency?" · "This one. 02:58. ...That's you, isn't it?" · fewer leading ellipses ("Bare feet.", "Okay.", "The bathroom.", "Not mine.", "Pipes."). |

## QA review (an independent correctness read, Node scripts against the real modules)

| Defect (severity) | Fix |
| --- | --- |
| An Act III checkpoint saved in the 1.2 s before he was heard running (power back without turning round) lost him for good: bathroom locked, wardrobe stuck, no nest, the door with the key saying "Locked. Good." (high) | `restore()` runs his unseen run again when it is missing; `world.restore` opens the bathroom on `bathroom-open` too; the wardrobe's right door is restored ajar. |
| A player in the bathroom when the open-fridge fallback broke the glass was locked in there (high) | The glass waits while the player is in the bathroom (any path); the fallback also waits outside the bedroom. |
| A 112 call made before the hunt was lost on any restore: the police never came (high) | The police's remaining time and what they were told are saved and re-armed. |
| With the nest seen in the dark of Act II, the spare key and the hatch race gave Out without the power ever coming back (medium) | The spare is searchable after the nest only once the power is back (or in the hunt). |
| Opening the fuse box in Act I played the dark's corridor beats, and after the cut armed the sighting behind the player (medium) | The fuse box's beats only after the cut and before power-back. |
| E was ignored for 0.6 s after pressing D (the "developer" code word's prefix) (medium, since 0.5) | Only after "dev" does an E belong to the code word. |
| The LIVE scene, the phone's boot and a death kept running behind the pause menu (medium) | `paused` hooks (main.js): they wait. |
| A player walking on east could meet his run (medium-low) | The walk-back branch starts at x 7 and he breaks at once; a held sighting breaks early when the player comes on. |
| Low: Hard's third catch reset the deaths and froze the clocks; a timed cut could shut the hot tap; releasing any key cancelled Q; a call-back on vibrate was a 12 m noise; opening the right door in the hunt recorded the packed-up nest; toasts expired under documents; a bedroom LIVE feed stayed live through the hunt; the LIVE scene snapped the wardrobe door without moving its handle and LED; the spare key was taken instantly and silently; dev events "Caught" and "The locked bathroom" could break the night. | All fixed: deaths kept and the clocks back to 03:07; the tap stays hot; Q only on Q; a buzz is a 4 m noise; no nest once packed; toasts wait while reading; the hunt cuts the feed; `closets.open`; searching takes 1.5 s with a 2.5 m noise (walking away stops it); "Caught" only respawns him in the hunt, the locked bathroom never re-locks after the cut. |

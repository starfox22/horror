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
| Phone | `phone.js`, `main.js`, `story.js` | Dead on the south nightstand (measured top 0.57 m), its charger pulled from the wall; putting it back plugs it in; it charges on the bedroom sockets' circuit and boots in Act III after the quiet, buzzing hard against the wood (a scare). Call-back answered keeps what the police were told; buzzes instead of ringing during the hunt; hold-Q hint on the lock screen. |
| The man in the corridor | `story.js` (`startSighting`, `updateSighting`, `intoTheWardrobe`) | At the edge of the torch beam by the front door he holds still 0.8 s, then sprints at the player (3.6 m/s, heavy footfalls) and swerves into the bedroom; he disappears only once out of the player's sight (nav sight test); the wardrobe bangs, a thump in the ceiling, creaks cross above the corridor towards the player. Never turned round: heard instead at power-back. |
| Story beats | `story.js`, `story-events.js`, `journal.js`, `nest.js`, `endings.js`, `menu.js` | Light under the bathroom door goes out after the handle is tried; the latch clicks when you leave with the torch; a footprint in the spilt water; the knife slot; ordinary night sounds (the lift, a neighbour's toilet) and the pipes knocking when a tap shuts; the nest's falling hanger; a tagged key "5B" instead of names; endings Out / Evicted / Locked From the Inside / Sweet Dreams; Act IV is "Out". |
| Death | `death.js`, `public/assets/fx/blood.webp` | Contact to black under 3 s: the knife raised into his light, a stab, a red flash (a fade with reduced flashes), blood on the lens, a fall to the floor with a roll and a bounce, colour draining, him standing over you; black; you wake on the sofa. Page overlays and a CSS filter: no shaders. |
| Front door | `story.js`, `main.js` | Hold E for 3 s to turn the lock with the spare (progress kept); trying it before the hunt brings him down from the hatch (a race). A catch undoes a half-turned lock (it used to still play "Out" during the death). |

(Further rows are added as the remaining work lands: the taps, the fridge door and note, the audio pass, the hunt AI,
his look and knife, the crow.)

# The Apartment — story and game design (build 0.14)

The canonical design for the night: its story, beats, scares, gameplay and endings. Code follows this document; change
this first. Everything is staged in the real apartment (metres; floor plan in `docs/build-013/map.png`).

Version 3 (build 0.14). The owner asked for a simpler story than 0.13's: **the man they evicted never left**, told with
almost no backstory ("we will let the player imagine the rest"); plenty of believable jump scares; tension that builds
before the attacker is ever seen; escape as the final goal; the knife slot left empty for whoever looks. A caretaker
twist and a chained front door were proposed and rejected by the owner as too close to Netflix's "Unhinged": do not
reintroduce them.

## Pillars

1. **Simple, and imagined.** A notice on the fridge says the resident who had been causing disturbances has finally been
   evicted. He never left. Nothing ever explains him: the player pieces it together from things (the notice, the
   empty key bowl, the empty knife slot, his nest, the polaroids). No names, no letters, no confession.
2. **Believable first.** Every scare has an ordinary cause (the storm, a bird, old wiring, the building, the pills)
   until the causes run out. None is ever taken away by force.
3. **Tension before the monster.** Quiet, then wrong sounds, then silence that answers you, then a sight, then contact.
   The man is not seen until the player has been in the dark for a while (about six minutes into a first night).
4. **Escape is the goal.** Once he has been seen, the night has one aim: get out of the flat. The keys are gone from the
   bowl; the spare is somewhere in the flat (the sleep diary says where); he hunts you while you look.
5. **Fair.** Every danger is telegraphed (his light reaches a room before he does, his breathing within a few metres, his
   steps through doorways). Being caught is a jump scare, never a mystery. Checkpoints at every act.
6. **Silence is a tool.** No music under exploration; drones only after something has happened; the first sighting has
   no sting until he is gone.

## The truth (never stated in full)

For a month someone in the building made the nights unbearable: banging in the ceilings, noises above the flats. The
management finally evicted him; the notice is on your fridge. He did not leave. He moved into the service void above
the ceilings and comes down into your flat through the inspection hatch in the roof of your bedroom wardrobe. He has
been coming down at night while you sleep on your prescription pills. Tonight he took your keys from the bowl and the big
knife from the block, and pulled your phone's charger out of the wall. When you wake at 03:07 he is in your wardrobe,
holding its right door shut.

What the player can find, in order: the stuck wardrobe door · the dead phone with its charger pulled · the notice ·
the empty key bowl · the empty knife slot · the broken glass and the blood in the spill · the locked bathroom whose
light goes out · the man at the end of the corridor · his prints · the wiped mirror · the nest (blanket, bottles, a key
tagged 5B, polaroids of you asleep) · the hatch · the camera clips · him on LIVE.

## Space (who is where)

- **Bedroom** x 9.3-14.2, z -1.4..2.4: bed (head at +x), two nightstands (the south one has the alarm clock and your
  phone; the north one the pills), the camera on the dresser corner looking at the bed and the wardrobe, the bedroom
  window on the north wall (x 10.4-12.75). The wardrobe on the west wall: tall section z -1.32..0.28 behind two doors
  (left half: shelf with the torch; right half: rail, his nest on the floor, the hatch in its roof). The en-suite
  **bathroom** door is beside it (x 9.15, z 0.39..1.25).
- **Corridor** x 1.55-13.95, z 2.72..4.42, 12 m, windowless. The bedroom opens onto it at x 10.0-10.9, the **front door**
  is at its east end (x 12.9), the **fuse box** at its west end (x 2.3), the office opening at x 3.75-5.6. It is the only
  link between the two halves of the flat: the tension lives there.
- **Open-plan room** x -6.5..6.3: kitchen on the north wall (fridge x 1.55 with the notice on its door, the sink and
  its tap under the kitchen window, the knife rack over the worktop, the coffee machine and coffee shelf), dining table,
  living room at the west end (sofa, laptop, arc lamp, a floor-to-ceiling window wall), office at the east end (desk,
  iMac, the sleep diary).

## Acts and beats

Times are for a first night. Each beat lists its trigger, its fallback (the night never stalls) and the scare type.
Every scripted moment is an entry in `src/story-events.js` (`STORY_EVENTS`, in this order: the developer menu plays any
of them 3 s after the game resumes).

### Act I — Water (0:00-3:00): unease

1. **Wake** (existing, skippable). The bedside clock: 03:07. *"I just had a nightmare, I will go get some water at the
   kitchen."* (the owner's line, verbatim).
2. **The phone** lies on the south nightstand, dead. E: *"Dead."* Its charger has been pulled out of the wall: E on the
   nightstand plugs it back in (*"I never unplug it."*); its screen shows the red empty-battery glyph for a moment. A dead phone needs minutes of charge before it boots,
   and the power will soon be gone: it boots in Act III (beat 12). The phone can be carried; it charges only on the
   nightstand.
3. **The wardrobe's right door**: E → it gives a centimetre and stops; hangers rattle inside. *"Stuck."* (He is holding
   it.) It stays stuck until he has been seen; after the glass it no longer rattles (he is in the bathroom then).
4. **The kitchen.** On the outside of the fridge door, held by a magnet, a small printed notice: *"NOTICE TO RESIDENTS.
   The resident who had been causing disturbances over the last month has finally been evicted. Thank you for your
   patience."* Reading it: *"Finally."* Some 9 s later, the first wrong sound: something heavy crossing the kitchen
   ceiling, three slow creaks moving east. *"...Upstairs."* (If the notice is never read, the creaks come 12 s after the
   player first walks into the kitchen.) The key bowl beside the fridge is empty (*"...My keys?"*). The knife rack on
   the wall over the worktop has one gap, where the biggest hangs; only a player who looks closely notices (*"The big
   one's gone."*).
   Both taps turn on and off.
5. **The crow** (believable false scare; once per night, any time before the man has been seen, never within 25 s of
   another scare). The player stands within 2.6 m of a window, looking at it, not running. A crow, flushed from the roof by the
   storm, comes out of the black and slams into the glass at eye height: a heavy thud, the pane rattling, a burst of
   feathers, a distressed caw as it drops away; lightning a moment later. A feather stays stuck to the wet glass with a
   smear of blood that the rain slowly washes down. *"Jesus. ...Just a bird."* The kitchen tap is under the kitchen
   window, so a player who plays with the taps usually meets it.
6. **The drink** (existing). Exactly 3.0 s of play after the fridge door shuts after drinking: **a glass shatters in the
   bedroom**, at near full level wherever the player is (routed through the doorways, never muffled into a thud).
   *"...What was that?"* 40 s later, if the player has not gone east: *"The bedroom."*
   - Fallbacks: a fridge left open after the drink starts the glass too (12 s after the drink once the player is 2 m
     from it, 25 s at the latest); no drink by 4:00, *"Water. Then bed."*; by 6:00 the glass breaks anyway, as soon as
     the player is out of the bedroom and the bathroom.
   - Shutting a tap before the glass knocks the pipes (*"Pipes."*); after the glass nothing explains a sound away.

### Act II — Dark (3:00-7:00): the presence

7. **The glass.** By the bed: a broken tumbler in a spill of pink water, and in the spill one bare footprint, toward the
   bathroom. *"I didn't bring a glass to bed."* then *"...Blood?"* The bathroom door is shut, its light shows under the
   door, and a tap runs behind it.
8. **Locked.** E on the bathroom handle: it gives, the latch doesn't. *"Locked."* Behind the door the tap stops. Then the
   line of light under the door goes out. E again: you knock. *"...Hello?"* Two seconds of nothing. Then a crackle and a
   **bang** from inside (the light under the door is his: if the player switched the bathroom's lights off, he switched
   them on), and the flat goes out in a cascade from the bathroom outwards (lights, the fridge's hum, the
   screens). Rain and thunder are all that is left. *"No. No, no, no."*
   - Fallbacks: 25 s after the shards are seen, or 120 s after the glass, the cut happens wherever the player is.
   - Sweet Dreams (secret ending) can be chosen between the glass and this cut: hold E on the bed.
9. **Light.** Lightning every 6-10 s for 45 s after the cut, then every 20-35 s. 4 s after the cut: *"The torch. Left
   side of the wardrobe."* Halfway down the corridor with the torch (x < 8), behind the player the bathroom's latch
   clicks: unlocked. Nothing else.
10. **The fuse box** at the corridor's west end. Without the torch: *"I can't see a thing."* A consumer unit with a
    hinged cover: **MAIN**, **RCD** (tripped, with a TEST button) and seven breakers: LIGHTS 1, LIGHTS 2, KITCHEN, SOCKETS
    LIVING, SOCKETS BED, BATHROOM, OVEN. Taped inside the cover, a handwritten label: *"RCD trips → all breakers off, RCD
    up, breakers on one at a time. The one that trips it again: OFF."* The RCD stays up only while no wet circuit is on:
    BATHROOM always, and on some runs one nuisance circuit with a cause the player could have seen (a puddle under the
    coffee machine: KITCHEN; rain on a floor socket by the living-room window: SOCKETS LIVING). The clever player
    switches BATHROOM off and lifts the RCD: two actions. Hints only for whoever is stuck: the second trip, *"Something's
    wet."*; the third, *"The bathroom. Off first."*; tripping with BATHROOM off, *"Still tripping. ...What else is
    wet?"*; the cover open 90 s without power, *"All off. Then one at a time."*
11. **The man.** Armed once the player is well down the corridor (x < 6) or has opened the fuse box. 4 s after the
    cover opens, from the far east end: one slow floorboard creak; again at 12 s; at 20 s the front door's handle goes
    down, slowly, and back. When the player's torch beam points down the corridor towards the front door (from x < 8.2),
    **a man is standing there at the edge of the light**, at least four metres away: black clothes, a blank white face,
    something long and bright in his hand. He holds still until the beam has been on him for a second (1.2-2.5 s).
    Then he runs, barefoot and wet (slapping steps): straight at the player, fast, and swerves into the bedroom doorway,
    round the wardrobe's right door as he pulls it open, and in. It bangs shut behind him and springs ajar. A thump in
    the ceiling. Creaks crossing above the corridor. No music until the thump. *"...Someone's in here."* *"He's in my
    bedroom."* He is never seen vanishing: he is hidden only out of the player's sight or inside the wardrobe.
    - Walking back east before turning round (between x 7 and the bedroom doorway): he breaks for the bedroom at once,
      ahead of the player; a held sighting also breaks early if the player comes on past x 8. East of the doorway
      nothing starts (his run would cross the player).
    - The fuse box's beats (the creaks, the handle, the hints) belong to the dark: opening it before the cut does
      nothing.
    - If the player never turns: when the power comes back, he is heard (and, in the lit corridor, can be seen) running
      from the front door into the bedroom, the wardrobe, the thump overhead. *"...Someone's in here."* *"In my
      bedroom."*
    - From now on the front door matters: *"Locked. ...My keys. He has my keys."*
12. **Power back.** Lights stutter and settle as they were; the fridge hums again; the iMac chimes. *"Okay."* Then at
    least **45 s of nothing**. His prints are in the corridor: from the front door into the bedroom, wet and pink.

### Act III — Steam (7:00-11:00): his nest

13. **The bathroom.** Its door stands ajar; its light is dead (its circuit is off): torch. Steam, the basin overflowing,
    your hair-dryer in it, water across the floor, the hot tap running. E: turn the tap off. In the new quiet, something
    heavy shifts **in the ceiling**, moving towards the wardrobe. The mirror is fogged, with one band wiped clear at a
    head height above yours. *"Someone wiped the mirror."* Nudge 45 s after power-back if not visited: *"The
    bathroom."*
14. **The phone** (if it is on its charger with power, once the player is within earshot of it, 7 m, or two minutes
    after power-back): its screen lights the nightstand with its maker's mark for 3 s, silently; then it **buzzes hard
    against the wooden nightstand** with everything it missed, the lock screen lit with the alerts (dark again after
    20 s). Heard from another room: *"My phone."* Home Cam: clips **00:47** (the wardrobe's left door opens a hand's width, a white face in the
    gap) and **02:58** (the empty bed, a figure at its foot turning to the lens), and **LIVE**. If the charger was never
    plugged in: 20 s after power-back, *"My phone. ...The charger."*
15. **The nest.** The right wardrobe door, ajar since he went in, now opens. As it swings, a hanger drops and clatters;
    dust. On the floor: a folded charcoal blanket, water bottles, a brass key with a paper tag "5B" (*"5B." "Not
    mine."*), and polaroids of your bed at night with you asleep in it, taken from where you are standing. *"That's my
    bed."* The oldest has a date pencilled on its back, *14 . 3*: *"March. ...Seven months."* In the
    roof of the wardrobe the hatch is open onto black; looking up with the torch, a single drop of water falls through
    the beam. *"...How long?"*
16. **LIVE** (only once the player is out of the bedroom; in it the feed says "no signal" after 3 s and the player
    thinks *"No signal in here."*; lowering the phone and raising it again comes back to LIVE): the bedroom as it is now,
    "LIVE · 8 s delay". His legs drop
    out of the hatch; he steps out of the wardrobe, crosses the room, looks up into the lens and walks out of frame. At
    that moment the power dies (he walked to the fuse box 8 s ago). The feed: "Connection lost".
    - If the player never opens LIVE: the hunt starts 75 s after the nest was found, or 150 s after power-back, whichever
      comes first; never while LIVE plays, nor while the player stands at the wardrobe (up to 45 s more). The nest is
      packed up only out of the player's view.
    - An emergency call made before the hunt starts it 12 s after the call ends (he heard you).

### Act IV — Out (11:00-18:00): the hunt

The power is out again and stays out: the main switch is snapped off. He hunts the player through the dark flat.

- **The goal.** Get out. The front door needs a key and yours are gone. The **sleep diary** on the office desk says
  where the spare is (one place per run, all in the west half: the red tin on the coffee shelf · taped under the sofa
  cushion · in the green vase on the coffee table); each place can also be searched without the diary, but only once
  the player needs the spare badly enough: after the nest with the power back, or in the hunt (earlier, a first night would end at the
  door minutes after he is first seen; before that the front door only says *"He has my keys."*). Take it (1.5 s, a 2.5 m
  noise), cross the flat to the front door, **hold E for 3 s** to turn the stiff lock (three loud clicks, each a 6 m
  noise; letting go keeps the progress), and leave.
- **First encounter (scripted, survivable, the tutorial).** He starts at least 8 m of path from the player (the fuse
  box; else the far end of the open-plan room, the office desk, mid-corridor, the bedroom door); his phone light comes
  on 1.2 s after the main switch goes. For up to 25 s he sweeps the open-plan room, keeping 5 m from the player. Until
  the player enters the corridor or comes within 4 m of him, he notices only a torch held on for more than 1.5 s (from
  6 s in), or running, and never more than to stop and look; whatever ends it, no chase starts before 7.5 s, and the
  wardrobe never drops him on anyone during it (or any respawn's grace). Thoughts: *"His light."* (if he is in sight;
  otherwise *"He's back."*) then *"Torch off. Get down."* (with the torch on; otherwise *"Get down. Stay quiet."*) and
  the prompt *C · crouch*; then *"Get out. ...The spare key."*
- **Him.** Black clothes, the white mask, your kitchen knife in his right hand and his phone's cold LED in his left.
  He walks between the rooms, stops and sweeps his light, goes to noises. His light reaches a room before he does; in a
  doorway he waits 2 s shining it down the corridor; he never stops in the corridor. Within 5 m you hear his breathing.
- **Seeing you** (stalker.js): suspicion fills while you are in his light (35° half-angle, 9 m), close in his side view
  (2 m standing, 1 m crouched) or anywhere in sight with your torch on (14 m); crouched fills slower, running or torch
  faster. At half he stops, turns his light to you and breathes in: you have a moment. Full: he comes, and before he
  strikes he raises the knife into his light (0.45 s): there is always a last chance to see it coming.
- **Hearing you** (path metres): crouched 0.5, walking 2.5, running 8, doors and the wardrobe 6, glass underfoot 5, the
  phone ringing 12, the front-door lock 6 per click.
- **Lures.** A running tap (kitchen or bathroom; water needs no power) is a 7 m noise: he walks over, turns it off,
  sweeps, searches nearby. Set it, then leave by another way.
- **The chase.** He runs (2.6 m/s on Normal; you run 2.4) to where he last saw you, plus where you were heading. Six
  seconds without seeing you: he searches, then goes back to walking. He never ambushes in the corridor or within 4 m of
  the front door. Walls, wardrobes and the fridge always hide you; low furniture hides you crouched.
- **The wardrobe** is his door, not your hiding place: stand in its right half (or pressed into its open doorway)
  during the hunt and dust falls at 1 s; at 4 s he drops through the hatch into the wardrobe with a heavy thump, gets
  up, steps out and breathes in (your moment), then comes at a run. A player who runs at the thump gets away.
- **The race.** Starting on the front door's lock before the hunt brings him down the same way: he lands in the
  wardrobe and runs for the front door; holding E for its 3 s wins by about a second.
- **Police.** The phone (if booted): an emergency call. *"Emergency. What's the address?"* Then what the player chooses
  to whisper depends on what they found: *"There's someone in my flat."* always; *"He's in the ceiling. Above my
  wardrobe."* (found the nest); *"It's the man they evicted. From 5B."* (read the notice and found the tagged key).
  *"Officers are on their way. Stay on the line if you can."* They arrive in 60 / 100 / 110 s (Story / Normal / Hard).
  A dispatcher's call-back during the hunt buzzes rather than rings.
- **Caught.** The view is wrenched round to him; his light comes up under the mask; the knife comes down. A full-level
  sting, the camera kicks, blood hits the lens, and the player falls: the view drops to the floor and rolls, and he
  stands over you, looking down. Black, and silence. Then you wake, gasping, at 03:07: **on the sofa** (as the diary
  says you have before). *"...A dream?"* (first), *"Again."* (second), *"Wake up. Wake up."* (third). The shards are
  still by the bed; you keep everything you carried and found, and a police call already made. He is patrolling from the
  bedroom door, with 8 s before he can catch anyone (or from his furthest patrol point, if the checkpoint puts you
  within 8 m of the door). On Hard, the third catch restarts Act IV.

## Endings

| # | Name | How | Final beat |
| --- | --- | --- | --- |
| 1 | **Out** (main) | Unlock the front door with the spare key and leave. | The stairwell, your breath, bare feet on the stairs. Above, very softly, your front door closing, and a key turning in it from inside. |
| 2 | **Evicted** (true) | The police come and you told them where and who. | They bring him down from the void. Card: *"Officers found a man living in the service void above your wardrobe. He had been evicted from the building. He never left."* |
| 3 | **Locked From the Inside** | The police come and you could not tell them where. | They search; nothing. *"Front door was locked. From the inside."* An officer plays 02:58 on your phone: *"...That's you, isn't it?"* *"Do you take anything to help you sleep?"* |
| 4 | **Sweet Dreams** (secret) | Hold E on the bed between the glass and the power cut. | Black. Rain. A wardrobe door, slowly. Floorboards. The mattress dips beside you. A breath at your ear. Then, no words: a still from the camera, infrared, 03:14, the bed, and a man standing at its foot. |
| — | Caught | He reaches you. | You wake (not an ending: the hunt resumes). |

The ending card shows the time on the clock, the run's time, deaths, evidence found and which reading the evidence
supports (someone was here / it was in my head).

## Evidence (the journal)

Each with the thought you had: the stuck wardrobe · the dead phone · the notice · the empty key bowl · the gap on the knife
rack · the broken glass · the blood in the spill · the locked bathroom · the man in the corridor · the prints · the wiped
mirror · the nest · the key tagged 5B · the polaroids (and the back of the oldest) · clips 00:47 and 02:58 · the
prescription (zolpidem: "may cause sleepwalking, complex sleep behaviours and hallucinations") · the sleep diary.

The main menu keeps endings found, evidence found, best times, and unlocks chapter select (Act I-IV) after a first
ending.

## Jump scares and breathing room

Big scares in a first night, each after quiet: the crow (if met) · the glass · the bang · the man · the phone's buzz ·
the hanger in the nest · his drop on LIVE · the catch. Minimum gap between two scripted scares: 25 s. Everything loud
plays through the scare path (sound.js): full level, beds ducked for a second, never clipped (master limiter).

## Replay, difficulty, accessibility

- Per run: the spare key's place (and the diary line), the nuisance circuit (none / kitchen / living), his patrol,
  lightning timing, and which ordinary night sounds play (a neighbour's toilet, the lift, a car alarm set off by
  thunder, pipes knocking).
- Difficulty: **Story** (slower, never catches a running player, deaf to walking, police in 60 s), **Normal**, **Hard**
  (faster, hears walking at 4 m; the third catch restarts Act IV).
- Settings: mouse sensitivity, invert Y, field of view, volumes (master, effects, ambience, music), subtitles,
  head bob, **reduced flashes** (lightning, bangs, the torch stutter and the blood flash become fades), **sound
  captions** (the night's important sounds described in brackets: [Glass shatters, in the bedroom], [A bang. The power
  dies.], [Running footsteps], [Something heavy, in the ceiling], [A phone buzzes, in the bedroom], ...), brightness,
  graphics.
- Journal toasts wait for a quiet moment (5 s after a scare, no thought on screen), one at a time.

## Dialogue rules

Thoughts are short, react rather than explain, and are subtitles in the waking line's style. The player character is
never named or gendered. He never speaks.

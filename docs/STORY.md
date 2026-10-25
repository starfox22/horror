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
  its tap under the kitchen window, the knife block on the worktop, the coffee machine and coffee shelf), dining table,
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
   nightstand plugs it back in (*"I plugged it in. ...Didn't I?"*). A dead phone needs minutes of charge before it boots,
   and the power will soon be gone: it boots in Act III (beat 12). The phone can be carried; it charges only on the
   nightstand.
3. **The wardrobe's right door**: E → it gives a centimetre and stops; hangers rattle inside. *"Stuck."* (He is holding
   it.)
4. **The kitchen.** On the outside of the fridge door, held by a magnet, a small printed notice: *"NOTICE TO RESIDENTS.
   The resident who had been causing disturbances over the last month has finally been evicted. Thank you for your
   patience."* Reading it: *"Finally."* The key bowl beside the fridge is empty (*"...My keys?"*). The knife block on
   the worktop has one empty slot, the biggest; only a player who looks closely notices (*"The big one's gone."*).
   Both taps turn on and off.
5. **The crow** (believable false scare; once per night, any time before the hunt, never within 25 s of another
   scare). The player stands within 2.6 m of a window, looking at it, not running. A crow, flushed from the roof by the
   storm, comes out of the black and slams into the glass at eye height: a heavy thud, the pane rattling, a burst of
   feathers, a distressed caw as it drops away; lightning a moment later. A feather stays stuck to the wet glass with a
   smear of blood that the rain slowly washes down. *"Jesus. ...Just a bird."* The kitchen tap is under the kitchen
   window, so a player who plays with the taps usually meets it.
6. **The drink** (existing). Exactly 3.0 s of play after the fridge door shuts after drinking: **a glass shatters in the
   bedroom**, at near full level wherever the player is (routed through the doorways, never muffled into a thud).
   *"...What was that?"* 40 s later, if the player has not gone east: *"The bedroom."*

### Act II — Dark (3:00-7:00): the presence

7. **The glass.** By the bed: a broken tumbler in a spill of pink water, and in the spill one bare footprint, toward the
   bathroom. *"I didn't bring a glass to bed."* then *"...Blood?"* The bathroom door is shut, its light shows under the
   door, and a tap runs behind it.
8. **Locked.** E on the bathroom handle: it gives, the latch doesn't. *"Locked."* Behind the door the tap stops. Then the
   line of light under the door goes out. E again: you knock. *"...Hello?"* Two seconds of nothing. Then a crackle and a
   **bang** from inside, and the flat goes out in a cascade from the bathroom outwards (lights, the fridge's hum, the
   screens). Rain and thunder are all that is left. *"No. No, no, no."*
   - Fallbacks: 25 s after the shards are seen, or 120 s after the glass, the cut happens wherever the player is.
   - Sweet Dreams (secret ending) can be chosen between the glass and this cut: hold E on the bed.
9. **Light.** Lightning every 6-10 s for 45 s after the cut, then every 20-35 s. 4 s after the cut: *"The torch.
   Wardrobe."* Opening the left wardrobe door in the dark: a cold draught and dust drifting down in the next flash.
   When the player leaves the bedroom with the torch, behind them the bathroom's latch clicks: unlocked. Nothing else.
10. **The fuse box** at the corridor's west end. Without the torch: *"I can't see a thing."* A consumer unit with a
    hinged cover: **MAIN**, **RCD** (tripped, with a TEST button) and seven breakers: LIGHTS 1, LIGHTS 2, KITCHEN, SOCKETS
    LIVING, SOCKETS BED, BATHROOM, OVEN. Taped inside the cover, a handwritten label: *"RCD trips → all breakers off, RCD
    up, breakers on one at a time. The one that trips it again: OFF."* The RCD stays up only while no wet circuit is on:
    BATHROOM always, and on some runs one nuisance circuit with a cause the player could have seen (a puddle under the
    coffee machine: KITCHEN; rain on a floor socket by the living-room window: SOCKETS LIVING). The clever player
    switches BATHROOM off and lifts the RCD: two actions.
11. **The man.** 4 s after the cover opens, from the far east end: one slow floorboard creak; again at 12 s. When the
    player's torch beam points down the corridor towards the front door, **a man is standing there at the edge of the
    light**, eleven metres away: black clothes, a blank white face, something long and bright in his hand. He holds
    still for most of a second. Then he runs: straight at the player, heavy and fast, and swerves into the bedroom
    doorway. The wardrobe bangs. A thump in the ceiling. Creaks crossing above the corridor. No music until the thump.
    *"...Someone's in here."* *"He went into the bedroom."*
    - If the player never turns: when the power comes back, he is heard instead: running steps from the front door into
      the bedroom, the wardrobe, the thump overhead.
    - Following him: the wardrobe's right door swings slowly, dust falls through the torch beam, the creaks move away.
      *"He went up."*
    - From now on the front door matters: *"Locked. ...My keys. He has my keys."*
12. **Power back.** Lights stutter and settle as they were; the fridge hums again; the iMac chimes. *"...Okay."* Then at
    least **45 s of nothing**. His prints are in the corridor: from the front door into the bedroom, wet and pink.

### Act III — Steam (7:00-11:00): his nest

13. **The bathroom.** Its door stands ajar; its light is dead (its circuit is off): torch. Steam, the basin overflowing,
    your hair-dryer in it, water across the floor, the hot tap running. E: turn the tap off. In the new quiet, something
    heavy shifts **in the ceiling**, moving towards the wardrobe. The mirror is fogged, with one band wiped clear at a
    head height above yours. *"Someone wiped the mirror."* Nudge 45 s after power-back if not visited: *"...The
    bathroom."*
14. **The phone** (if it is on its charger with power): it boots and **buzzes hard against the wooden nightstand** with
    everything it missed. Home Cam: clips **00:47** (the wardrobe's left door opens a hand's width, a white face in the
    gap) and **02:58** (the empty bed, a figure at its foot turning to the lens), and **LIVE**. If the charger was never
    plugged in: 20 s after power-back, *"My phone. ...The charger."*
15. **The nest.** The right wardrobe door now opens. As it swings, a hanger drops and clatters; dust. On the floor: a
    folded charcoal blanket, water bottles, a brass key with a paper tag "5B", and polaroids of your bed at night with
    you asleep in it, taken from where you are standing. *"That's my bed."* The oldest has writing on its back. In the
    roof of the wardrobe the hatch is open onto black; looking up with the torch, a single drop of water falls through
    the beam. *"...How long?"*
16. **LIVE** (only once the player is out of the bedroom): the bedroom as it is now, "LIVE · 8 s delay". His legs drop
    out of the hatch; he steps out of the wardrobe, crosses the room, looks up into the lens and walks out of frame. At
    that moment the power dies (he walked to the fuse box 8 s ago). The feed: "Connection lost".
    - If the player never opens LIVE: the hunt starts 75 s after the nest was found, or 150 s after power-back.
    - An emergency call made before the hunt starts it 12 s after the call ends (he heard you).

### Act IV — Out (11:00-18:00): the hunt

The power is out again and stays out: the main switch is snapped off. He hunts the player through the dark flat.

- **The goal.** Get out. The front door needs a key and yours are gone. The **sleep diary** on the office desk says
  where the spare is (one place per run, all in the west half: the red tin on the coffee shelf · taped under the sofa
  cushion · in the plant pot by the sofa); each place can also be searched without the diary. Take it (1.5 s, a 2.5 m
  noise), cross the flat to the front door, **hold E for 3 s** to turn the stiff lock (three loud clicks, each a 6 m
  noise; letting go keeps the progress), and leave.
- **First encounter (scripted, survivable, the tutorial).** His phone light comes on near the fuse box. He walks the
  open-plan room once, sweeping it. Until the player enters the corridor or comes within 4 m of him, he notices only a
  torch held on for more than 1.5 s, or running. Thoughts: *"His light."* then *"Torch off. Get down."* and the prompt
  *C · crouch*; then *"Get out. ...The spare key."*
- **Him.** Black clothes, the white mask, your kitchen knife in his right hand and his phone's cold LED in his left.
  He walks between the rooms, stops and sweeps his light, goes to noises. His light reaches a room before he does; in a
  doorway he waits 2 s shining it down the corridor; he never stops in the corridor. Within 5 m you hear his breathing.
- **Seeing you** (stalker.js): suspicion fills while you are in his light (35° half-angle, 9 m), close in his side view
  (2 m standing, 1 m crouched) or anywhere in sight with your torch on (14 m); crouched fills slower, running or torch
  faster. At half he stops, turns his light to you and breathes in: you have a moment. Full: he comes, and before he
  strikes he raises the knife into his light (0.45 s): there is always a last chance to see it coming.
- **Hearing you** (path metres): crouched 0.5, walking 2.5, running 8, doors and the wardrobe 6, glass underfoot 5, the
  phone ringing 12, the front-door lock 6 per click.
- **Lures.** A running tap (kitchen or bathroom; water needs no power) is a 10 m noise: he walks over, turns it off,
  sweeps, searches nearby. Set it, then leave by another way.
- **The chase.** He runs (2.6 m/s on Normal; you run 2.4) to where he last saw you, plus where you were heading. Six
  seconds without seeing you: he searches, then goes back to walking. He never ambushes in the corridor or within 4 m of
  the front door. Walls, wardrobes and the fridge always hide you; low furniture hides you crouched.
- **The wardrobe** is his door, not your hiding place: stand in its right half during the hunt and dust falls at 1 s;
  at 4 s he drops out of the hatch onto you.
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
  bedroom door, with 8 s before he can catch anyone. On Hard, the third catch restarts Act IV.

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

Each with the thought you had: the stuck wardrobe · the dead phone · the notice · the empty key bowl · the empty knife
slot · the broken glass · the blood in the spill · the locked bathroom · the man in the corridor · the prints · the wiped
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
  head bob, **reduced flashes** (lightning, bangs, the torch stutter and the blood flash become fades), brightness,
  graphics.

## Dialogue rules

Thoughts are short, react rather than explain, and are subtitles in the waking line's style. The player character is
never named or gendered. He never speaks.

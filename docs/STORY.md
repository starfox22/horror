# The Apartment — story and game design (build 0.13)

The canonical design for the story, its beats, gameplay and endings. Code follows this document; change this first.
Everything is staged in the real apartment (metres; floor plan in `docs/build-013/map.png`). Version 2: revised after
two independent reviews (narrative/horror and game design/pacing); their main findings are folded in below.

## Pillars

1. **Plausible first, unbearable later.** Every early event has an ordinary explanation (the storm, the flat upstairs,
   an old building, sleeping pills). The explanations wear out one at a time; none is ever taken away by force.
2. **Two readings to the very end: real, or in my head.** A man lives in your ceiling — or you sleepwalk and
   hallucinate on zolpidem (whose label warns of both) and every death is a nightmare you wake from at 03:07. Each piece
   of evidence fits both until the player has worked out enough to tell the police who and where.
3. **Built-up, timed scares.** Long quiet stretches of real-sounding night so each scare lands. Ordinary sounds first,
   then wrong sounds, then silence that answers you, then sights, then contact. Minimum breathing room is written down.
4. **The player is clever.** No markers. In-world instructions (the label in the fuse box, the sleep diary), deduction
   rewarded (switch off the circuit you heard the water on), knowledge carried between runs. An expert finishes in
   10-15 minutes; a first run takes 25-40.
5. **Silence is a tool.** No music under exploration; drones only after something happens; the biggest sight (the far
   silhouette) has no sting at all.

## The truth (stated only in the true ending)

Daniel Kessler, 41, rented this flat until March. When he was evicted he did not leave the building: he lives in the
service void above the ceilings, and he comes down through a hatch in the roof of your bedroom wardrobe (the void runs
above the whole floor). The landlord changed the lock; his old key, which no longer fits, lies in his nest. The first
night he came back, you were sleepwalking on your prescription pills, and you opened the front door to him. Since then
he comes down most nights. He drinks your water at your bedside. He takes photographs. Things you blamed on
sleepwalking (the fridge left open, the toilet seat up, waking on the sofa) were partly him and partly you.
Your doctor told you to film your nights; **the camera arrived today and tonight is its first night**.

| Time | Truth | What the player can find |
| --- | --- | --- |
| 00:47 | The camera's motion alert buzzes your phone on the nightstand. He takes the phone and shuts it in the fridge to silence it. | Clip 00:47: the wardrobe's right door opens a hand's width, a pale hand, it closes. The phone in the fridge, dead with cold. |
| 02:58 | You are sleepwalking (you are in the kitchen). He stands at the foot of your empty bed, then notices the camera and turns to it. | Clip 02:58: duvet thrown back, a figure at the foot of the empty bed, face whited out by the infrared, it turns to the lens. "...Is that me?" |
| 03:07 | You wake in bed (you went back to sleep at 03:01). He is behind the right wardrobe door, holding it shut. | The start. The right wardrobe door is "Stuck." |
| ~03:09 | You are in the kitchen. He comes out to fetch his glass of water (yours) from the nightstand, knocks it over in the dark, cuts his bare foot. He goes into the bathroom to wash the cut and locks it. | The shattered glass and blood-pink water. "I didn't bring a glass to bed." Tap running behind the locked door. |
| ~03:10 | You try the bathroom handle. He turns the tap off and holds still. When you knock, he drops your plugged-in hair-dryer into the basin: the RCD trips the whole flat. He knows it will: he wrote the label inside the fuse box when he lived here. | Silence that answers you, then the bang and darkness. |
| ~03:11 | While you fetch the torch and walk to the fuse box (west end of the corridor), he leaves the bathroom and stands at the east end by the front door, watching you work. Then he goes back up into the void. | The silhouette at the edge of the torch beam. His wet prints (your size) in the corridor, ending side by side facing the box. |
| ~03:13 | Power back. | The steamed bathroom (the building has central hot water), the hair-dryer in the basin, a band wiped clear in the fogged mirror at a head height above yours. |
| ~03:14 | You find the nest. | Blanket, bottles, a key that does not fit your door, a returned letter for "D. Kessler", polaroids of you asleep taken from inside the wardrobe; the oldest is dated in March and says on the back in block capitals: YOU LET ME IN. The hatch above is open; a drop of water falls through your torch beam. |
| ~03:15 | Your phone, booting on the charger, buzzes with the alerts you never got. The live view lags 8 s behind (a cheap cloud camera). | LIVE: he drops out of the hatch, walks out of the wardrobe and out of frame. At that moment the power dies: he was already at the fuse box, behind you. |
| ~03:16 | He snaps the main switch off and hunts you. | The hunt. |

## Space (who is where)

- **Bedroom** x 9.3-14.2, z -1.4..2.4: bed (head at +x), two nightstands (the charger on the near one; the camera on
  the dresser corner looking at the bed and the wardrobe), the wardrobe on the west wall: tall section z -1.32..0.28
  behind two doors (left half: shelf with the torch; right half: rail, his nest on the floor, the hatch in its roof),
  upper section z 1.34..2.36 above the open shoe closet. The en-suite **bathroom** door is between them (x 9.15,
  z 0.39..1.25).
- **Corridor** x 1.55-13.95, z 2.72..4.42, 12 m, windowless. The bedroom opens onto it at x 10.0-10.9; the **front door**
  at its east end (x 12.9, south wall; the key bowl and post tray beside it); the **fuse box** at its west end on the
  south wall (x 2.3, z 4.42) by the mouth into the open-plan room; the office opens onto it at x 3.75-5.6.
- **Open-plan room** x -6.5..6.3: kitchen along the north wall (fridge x 1.55, sink x -2.9, oven clock, coffee machine
  and its coffee shelf), dining table, living room at the west end (sofa, laptop, arc lamp, windows), office at the
  east end (desk, iMac, the sleep diary).

The corridor is the only link between the two halves of the flat, which is why the tension lives there.

## Acts and beats

Times are for a player who knows what to do. Each beat lists its trigger, its fallback (so the game never stalls) and
its minimum breathing room.

### Act I — Water (0:00-1:40)

1. **Wake** (existing, 12 s; skippable). The bedside clock: 03:07. *"I just had a nightmare, I will go get some water at
   the kitchen."* (the owner's line, verbatim). The charger cable on the nightstand has no phone on it.
   The right wardrobe door: E → it gives a centimetre and stops. *"Stuck."* (He is holding it.)
2. **The kitchen.** The oven clock blinks 03:07 (oven clocks are always wrong; after a death it will still say 03:07).
   Open the fridge: jug, glass, and **your phone** on the top shelf.
   E: *"...My phone?"* then *"Ice cold. Dead."* It goes in your pocket (it warms; on a charger it boots, see Act III).
   Drink (existing).
3. **The glass.** Exactly 3.0 s of play after the fridge door shuts (after drinking): a glass shatters in the bedroom,
   heard wherever you are (placed, muffled and reverberant through walls, never quieter than a clear sound).
   *"...Upstairs?"* — the ordinary explanation first. 40 s later if the player has not gone east: *"No. The bedroom."*

### Act II — Dark (1:40-4:00)

4. **The shards.** By the left nightstand: a broken tumbler in a spill of pink-tinged water. *"I didn't bring a glass to
   bed."* The bathroom door is shut; behind it a tap runs.
5. **Locked.** E on the bathroom handle: it gives, the latch doesn't. *"Locked."* The tap behind the door **stops**.
   E again: you knock. *"...Hello?"* Two seconds of nothing. Then a crackle and a **bang** from inside, and the flat goes
   out in a cascade from the bathroom outwards: lights, the fridge's hum, the router's click, the screens. Rain and the
   wind are all that is left.
   - Fallbacks: 25 s after the shards are seen, or 120 s after the glass broke, the cut happens wherever the player is.
   - Sweet Dreams can be chosen between the glass breaking and this cut (hold E on the bed: "Go back to sleep").
6. **Light.** Lightning every 6-10 s for 45 s after the cut, then every 20-35 s. 4 s after the cut, wherever the player
   is: *"The torch. Wardrobe."* Opening the left wardrobe door in the dark: a cold draught and dust drifting down in the
   next flash (plants the hatch; no sting). With the torch the right door now opens freely.
7. **The fuse box.** At the corridor's west end; without the torch: *"I can't see a thing."* A wall-mounted consumer unit
   with a hinged cover. Inside, left to right: **MAIN** (isolator, on), **RCD** (tripped, down, with a TEST button),
   and seven breakers: LIGHTS 1, LIGHTS 2, KITCHEN, SOCKETS LIVING, SOCKETS BED, BATHROOM, OVEN. Taped inside the cover,
   handwritten: *"RCD trips → all breakers off, RCD up, breakers on one at a time. The one that trips it again: OFF.
   (Bathroom does it when wet.) — D."*
   - The RCD stays up only while no faulty breaker is on. A faulty one tripping it: a loud snap and darkness again.
   - Faulty: BATHROOM always; plus, on some runs, one nuisance circuit with a cause the player could have seen in Act I:
     a puddle under the coffee machine (KITCHEN) or rain getting in at the living-room window onto a floor socket
     (SOCKETS LIVING), with a drip sound there.
   - The clever player switches BATHROOM off and lifts the RCD: 2 actions. The label is the fair fallback.
   - Looking into the open box, the focus snaps to the nearest switch and shows its name and state.
8. **The silhouette.** 4 s after the cover opens, from the far east end: one slow floorboard creak; again at 12 s.
   A player who turns and sweeps the torch down the corridor sees, at the very edge of the beam, 11 m away by the front
   door, **a man standing still**. The torch's cheap contact stutters; when the beam steadies, the corridor is empty.
   No sound, no music. *"...Hello?"* a second later. Afterwards, if they walk there: *"Nobody. ...Nobody."*
   - If the player never turns: at power-back the hall lights stutter on and off once and in that half-second he is at
     the far end; then he is gone.
9. **Power back.** Lights stutter and settle as they were; the fridge hums again; the router's lights; the iMac's chime.
   The phone, if it is on a charger, starts to charge. *"...Okay."* Then at least **45 s of nothing**: a lit flat, rain,
   the fridge.
   On the way back east: his wet prints in the corridor, from the bedroom opening to x 12.4, two prints side by side
   facing the fuse box, then back. *"...Mine?"*, then *"I wasn't over there."*

### Act III — Steam (4:00-7:00)

10. **The bathroom.** Its door now stands ajar; its light is dead (its circuit is off), so: torch. Steam in the beam,
    the basin overflowing, your hair-dryer in it, water across the floor, the hot tap running. E: turn the tap off. In
    the new quiet, something heavy shifts **in the ceiling**, moving towards the wardrobe. The mirror is fogged, with one
    band wiped clear at a head height above yours. *"Someone wiped the mirror."*
    - Nudge 45 s after power-back if not visited: *"...The bathroom."*
11. **The nest.** The right wardrobe door. On its floor: a folded grey blanket, empty bottles, a cheap torch, a key that
    doesn't fit your door, a returned letter for D. Kessler, and polaroids of your bed at night with you asleep in it,
    taken from where you are standing. *"That's my bed."* The oldest one has writing on the back. In the roof of the
    wardrobe a hatch is open onto black; when you look up a single drop of water falls through the torch beam.
    *"...How long?"*
12. **The alerts.** At least 20 s after the nest (or 60 s after power-back if the nest isn't found): the phone, on its
    charger, finishes booting and buzzes with everything it missed. (No charger? It boots from the warmth of your pocket
    4 minutes after you picked it up, at 4 %.) Q raises the phone. The camera app: **00:47**, **02:58**, **LIVE**.
    - LIVE (only once the player is out of the bedroom): the bedroom as it is now (rendered live), with "LIVE · 8 s
      delay". The wardrobe stands open as you left it. His legs drop out of the hatch; he steps out of the wardrobe,
      crosses the room, looks up into the lens, and walks out of frame. At that moment the power dies (he left the
      frame 8 s ago and has walked to the fuse box). The feed: "Connection lost".
    - If the player never opens LIVE: the hunt starts 75 s after the nest was found, or 150 s after power-back.

### Act IV — The lodger (7:00-12:00)

The power is out again and stays out: the main switch is snapped off. Kessler hunts the player.

- **First encounter (scripted, survivable, the tutorial).** His phone light comes on near the fuse box. He walks the
  open-plan room once, sweeping. For these 25 s he notices only a torch held on for more than 1.5 s or running.
  Thoughts: *"His light."* then *"Torch off. Get down."* and the prompt *C · crouch* once.
- **Him.** A man in a dark hoodie with a phone torch (a cold white LED, the only light besides yours and the lightning).
  He walks between the rooms, stops and sweeps his light, goes to noises. His light reaches a room before he does. In a
  doorway he always waits 2 s shining it down the corridor before stepping in; he never stops in the corridor. Within
  4 m you hear his breathing and his steps; sounds reach you along the flat's open paths (through doorways, never
  through walls), and his hearing uses the same path distance.
- **Seeing you.** Suspicion fills (0.35 s + 0.12 s per metre) while you are in his phone light (35° half-angle, 9 m),
  or within 2 m of him standing (1 m crouched) in his side view, or anywhere he has a line of sight to you with your torch
  on (14 m). Crouched fills twice as slowly; running or torch twice as fast. At half he stops, turns his light towards
  you and breathes in: you have a moment. Full: he comes. Lightning near him only turns his head.
- **Hearing you** (path metres): crouched 0.5, walking 2.5, running 8, doors and the wardrobe 6, glass shards underfoot 5,
  the phone ringing 12.
- **The chase.** He runs (3.0 m/s; you run 2.4) to where he last saw you, plus where you were heading. Six seconds without
  seeing you: he searches there, then nearby rooms, then goes back to walking. Sometimes, losing you, he switches his
  light off and waits; only his breathing within 4 m gives him away. Low furniture hides you when crouched; walls,
  wardrobes and the fridge always.
- **Backstage.** The wardrobe is his door, not your hiding place: stand inside its right half for 3 s during the hunt and
  dust falls, then he drops out of the hatch onto you. If he has been within 6 m of you for 25 of the last 60 s without a
  chase, he goes up into the void for 25-40 s (creaks move across the ceiling) and comes back down. If he has been far
  away for 45 s, he heads to the room next to yours. During the hunt he pulls the nest up into the void.
- **Caught.** The view turns to him in a quarter second, his LED fills it, black. Then the bedroom, you gasping awake,
  in under 8 s (any key skips). The bedside clock glows 03:07 for a second in a flat with no power, then is dark; your
  phone says the real time. *"...A dream?"* (first), *"Again."* (second), *"Wake up. Wake up."* (third). The shards are
  still there. You keep everything you carried, everything you found, and a police call already made (with at least 30 s
  left). He starts up in the void (heard above you) and you have 20 s.
- **Ways out.**
  - **Call the police.** Q, the phone (if it has booted), emergency call. The dispatcher: *"Emergency. What's the
    address?"* Then the player chooses what to whisper; what they can say depends on what they found: *"There's someone
    in my flat."* always; *"In the ceiling. Above the wardrobe."* (found the nest); *"Daniel Kessler. He used to live
    here."* (found the letter and the old key). *"Officers are on their way. Two minutes. Stay on the line if you can.
    Is there somewhere you can hide?"* Survive ~100 s (60 on Story). If you hang up they call back, and a ringing phone
    is a 12 m noise unless you silenced it. Then: *"Police! Open the door!"* Your keys are gone from the bowl; they force
    it.
  - **Get out.** The sleep diary on the office desk: *"Spare key: [the blue tin on the coffee shelf / the freezer, in the
    peas / taped under the sofa cushion]. DON'T move it again."* (one per run). Take it, reach the front door, unlock it
    (3 s, a 6 m noise), leave. Before the hunt, the door makes you think twice: *"Out? Barefoot? Over a glass?"*

## Endings

| # | Name | How | Final beat |
| --- | --- | --- | --- |
| 1 | **Sweet Dreams** (secret) | Hold E on the bed ("Go back to sleep") between the glass breaking and the power cut. | Black. Rain. A wardrobe door, slowly. Floorboards. The mattress dips beside you. A breath at your ear. Then, no words: a still from the camera, infrared, 03:14, the bed, and a man standing at its foot. |
| 2 | **Locked From the Inside** | The police come, and you could tell them neither where nor who. | They search; nothing (he pulled the nest up). An officer plays 02:58 on your phone: *"...That's you, isn't it?"* Another shines a torch up the hatch: *"Nobody could fit up there."* Dust falls in the beam. |
| 3 | **Out** | Escape with the spare key. | The stairwell, your breath, bare feet on the stairs. Above, very softly, your front door closing and a key turning in it, from inside. |
| 4 | **The Lodger** (true) | The police come and you told them both where and who. | They bring him down from the void. Card: *"Daniel Kessler, 41, lived here until March. Officers found bedding, food and 212 photographs in the service void above your wardrobe. He said he never broke in. He said you let him in. He said that whenever you woke, he put you back to bed."* |
| — | Caught | He reaches you. | You wake up (not an ending: the hunt resumes). |

The ending card also shows the time on the stopped clock, your time for the run, deaths, evidence found (x/14) and
which reading your evidence supports.

## Evidence (the journal; replay value)

14 pieces, each with the thought you had when you found it: the stuck wardrobe door · the phone in the fridge ·
the broken glass · the locked bathroom · the building notice on the fridge (central hot water; "noises reported in the
ceiling voids of floors 4-6; maintenance will inspect") · the prescription on the nightstand (zolpidem: "may cause
sleepwalking, complex sleep behaviours and hallucinations") · the sleep diary (woke on the sofa; fridge open in the
morning; the toilet seat up — "I live alone"; "Dr. Haas says film the nights. Camera came today."; the spare key) ·
the wiped mirror · the prints in the corridor · the nest · the old key · the returned letter · the polaroids (and what is
written on the oldest) · clips 00:47 and 02:58 · the empty key bowl by the front door.

The main menu keeps endings found, evidence found, best times, and unlocks chapter select (Act I-IV) after the first
ending.

## Replay, difficulty, accessibility

- Per run: the spare key's place (and the diary line), the nuisance circuit (none / kitchen / living), his patrol and
  where the hunt's first sweep goes, lightning timing, and which ordinary night sounds play (a neighbour's toilet, the
  lift, a car alarm set off by thunder, pipes knocking).
- Difficulty: **Story** (he walks slower, can't catch a running player, doesn't hear walking, police in 60 s), **Normal**,
  **Hard** (faster, hears walking at 4 m; after the third death you restart at the start of Act IV).
- Settings: mouse sensitivity, invert Y, field of view, volumes (master, effects, ambience), subtitle size and backing,
  head bob, **reduced flashes** (lightning, bangs and the torch stutter become fades), brightness calibration on first
  launch, graphics (existing).

## Dialogue rules

Thoughts are short, react rather than explain, and are subtitles in the waking line's style. The player character is
never named or gendered (the officers say "Are you okay?", never "ma'am"/"sir"). Second person appears only in his words.

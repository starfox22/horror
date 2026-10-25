// The story (docs/STORY.md, build 0.14: the evicted man never left): what has happened (flags), the beats in order,
// the fallbacks that keep it moving, the checkpoints (one per act, saved in the browser) and the run's variations. The
// scripted moments themselves are listed in story-events.js (in story order; the developer menu plays them); each calls
// a method here. Systems are reached through `sys` (main.js), several of them optional so the story degrades rather
// than breaks.
import { GLASS_SPOT } from './falling-glass.js';
import { areaAt, zoneAt, inWardrobe } from './zones.js';
import { rng } from './stalker.js';

export const ACTS = ['Water', 'Dark', 'Steam', 'Out'];
// Where the spare key is on this run (world.js SPARE_SPOTS; the diary's line says it).
// All three in the west half of the flat, so every escape crosses the corridor with the key in hand.
export const SPARE_KEY = [
  { id: 'tin', line: 'the red tin on the coffee shelf' },
  { id: 'sofa', line: 'taped under the sofa cushion' },
  { id: 'plant', line: 'in the green vase on the coffee table' },
];
const SAVE_KEY = 'horror.save.v1';
const BED = [12.7, 0.5];
const FUSEBOX = [2.3, 4.25];
const CORRIDOR_EAST = [12.35, 3.55];
const FRONT_DOOR = [12.88, 1.05, 4.36];
const BATH_DOOR = [9.15, 1.0, 0.8];
// The first sighting: where he stands (by the front door), the way he runs (at the player, then into the bedroom and
// into the wardrobe's right half, round its door as it swings open), and where he is out of sight. Measured on the walk
// grid: the corridor's middle, the bedroom doorway (x 10.0-10.9); the right door's leaf, open, reaches (10.51, 0.36):
// his path clears it by 0.28 m, and the walk grid is free all the way to the wardrobe's front.
const SPRINT = [[12.35, 3.55], [11.2, 3.45], [10.5, 3.05], [10.45, 2.45], [10.3, 1.7], [10.85, 0.6], [10.7, -0.1], [9.5, -0.1]];
const SPRINT_SPEED = 3.6;
const SPRINT_OPEN = 3;              // reaching this point he pulls the wardrobe's right door open (it swings in 0.7 s)
const FRIDGE_AT = [1.9, -0.6];      // the refrigerator's door, roughly (the drink's fallback measures from it)
const WARDROBE = [9.6, -0.1];       // the wardrobe's right half (the nest, the hatch)
// Above the corridor, west towards the fuse box: the creaks after the thump (he crosses the ceiling towards you).
const CEILING_WEST = [[9.6, 2.72, 1.2], [8.6, 2.72, 3.2], [6.8, 2.72, 3.5], [5.0, 2.72, 3.5]];
// Minimum seconds of play between two big scripted scares (docs/STORY.md: breathing room).
const SCARE_GAP = 25;

export class Story {
  constructor(sys) {
    this.sys = sys;
    this.flags = new Set();
    this.act = 0;
    this.time = 0;              // seconds of play since the run began
    this.deaths = 0;
    this.difficulty = 'normal';
    this.timers = [];
    this.listeners = new Set();
    this.lastScare = -Infinity;    // play time of the last big scripted scare (SCARE_GAP)
    this.newRun(Date.now() >>> 0);
  }

  // --- run bookkeeping ---------------------------------------------------------------------------------------------
  newRun(seed) {
    this.seed = seed;
    const r = rng(seed);
    this.spareKey = SPARE_KEY[Math.floor(r() * SPARE_KEY.length)];
    this.nuisance = ['none', 'kitchen', 'living'][Math.floor(r() * 3)];
    this.random = r;
  }

  has(flag) { return this.flags.has(flag); }
  set(flag) {
    if (this.flags.has(flag)) return false;
    this.flags.add(flag);
    for (const fn of this.listeners) fn(flag);
    return true;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // Play-time timers: fn runs after `seconds` of play (paused time does not count). id: replaces a pending one.
  after(seconds, fn, id = null) {
    if (id) this.cancel(id);
    this.timers.push({ at: this.time + seconds, fn, id });
  }
  cancel(id) { this.timers = this.timers.filter(t => t.id !== id); }
  // Like after(), but a pending timer with the same id that is due sooner is kept (fallbacks only ever come sooner).
  soonest(seconds, fn, id) {
    const t = this.timers.find(x => x.id === id);
    if (t && t.at <= this.time + seconds) return;
    this.after(seconds, fn, id);
  }
  // A sound described in words, for players who turn on sound captions (hud.js; off by default).
  caption(text) { this.sys.hud?.soundCaption?.(text); }

  say(text, opts) { this.sys.thought?.say(text, opts); }
  signal(name) { this.sys.events?.signal(name); }
  get player() { return this.sys.player; }
  get pos() { return this.sys.player.pos; }
  sfx(key, opts) { return this.sys.bank?.play(key, opts); }
  // A big scare through the bank's scare path (full level, the beds ducked under it) when there is one.
  scare(key, opts) { return this.sys.bank?.scare ? this.sys.bank.scare(key, opts) : this.sfx(key, opts); }
  // Is there room for another big scare now (SCARE_GAP seconds since the last)? mark(): this one counts.
  canScare() { return this.time - this.lastScare >= SCARE_GAP; }
  scared() { this.lastScare = this.time; }

  // --- the clock ---------------------------------------------------------------------------------------------------
  update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (this.dying) return;                 // the night stands still while he has you (death.js)
    this.time += dt;
    for (const t of [...this.timers]) {
      if (this.time < t.at) continue;
      const i = this.timers.indexOf(t);
      if (i < 0) continue;                    // cancelled by an earlier timer this frame
      this.timers.splice(i, 1);
      try { t.fn(); } catch (e) { console.error('story timer', e); }
    }
    this.watch(dt);
  }

  // Things noticed by looking or walking (checked every frame, cheap).
  watch(dt) {
    const p = this.pos, cam = this.sys.camera, fwd = cam.forward, eye = cam.getPosition();
    const looking = (x, y, z, cone = 0.93, range = 3) => {
      const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, d = Math.hypot(dx, dy, dz);
      return d < range && (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d > cone;
    };
    // The shards by the bed.
    if (this.has('glass') && !this.has('shards-seen') && looking(GLASS_SPOT[0], 0.2, GLASS_SPOT[2], 0.9, 2.8)) this.shardsSeen();
    // Act I's first wrong sound, for a player who walks into the kitchen without reading the notice (noticeRead).
    if (this.act === 1 && !this.has('upstairs-armed') && this.time > 20 && areaAt(p.x, p.z) === 'kitchen') this.upstairs(12);
    // The knife rack's gap, for whoever looks closely (world.js knows where it is: the wall behind the worktop, about
    // 1.3 m from the eye of someone standing at the worktop).
    const kb = this.sys.world?.knifeBlockAt;
    if (kb && !this.has('knife-seen') && looking(kb[0], kb[1], kb[2], 0.985, 1.7)) {
      this.set('knife-seen'); this.say('...The big one’s gone.', { delay: 0.4 }); this.sys.journal?.find('knife');
    }
    // After the cut, halfway down the corridor with the torch: behind you the bathroom's latch clicks. He is out of there
    // (the bathroom stands unlocked and empty from now on), slipping out behind you towards the front door.
    if (this.has('power-cut') && !this.has('silhouette') && !this.has('restored')) {
      if (!this.has('latch') && this.has('torch') && zoneAt(p.x, p.z) === 'hall' && p.x < 8) {
        this.set('latch');
        this.sfx('latch_1', { at: BATH_DOOR, gain: 0.6, send: 0.5, min: 0.25 });
        this.caption('[A latch clicks, behind you]');
        this.after(0.5, () => { if (!this.has('bathroom-open')) this.sys.world?.bathroomOccupied(false); });
      }
      if (!this.has('went-west') && p.x < 6) this.set('went-west');
      // The corridor beat, once the player is well down the corridor (or at the fuse box): the man at the far end of
      // the torch beam.
      if (this.has('fusebox-opened') || this.has('went-west')) this.silhouetteWatch(dt);
    }
    if (this.sighting) this.updateSighting(dt);
    // His prints in the corridor.
    if (this.has('prints') && !this.has('prints-seen') && zoneAt(p.x, p.z) === 'hall' && p.x > 9.2 && looking(11.4, 0.2, 3.3, 0.75, 3.5)) {
      this.set('prints-seen');
      this.say('Bare feet.', { hold: 1.6 });
      this.sys.journal?.find('prints');
    }
    if (this.unlock) this.updateUnlock(dt);
    // The wiped mirror (Act III, the bathroom).
    if (this.has('bathroom-open') && !this.has('mirror-seen') && looking(6.5, 1.75, 1.25, 0.85, 2.4)) {
      this.set('mirror-seen'); this.say('Someone wiped the mirror.'); this.sys.journal?.find('mirror');
    }
    // The hatch above the nest: a drop of water falls through the torch beam.
    if (this.sys.nest?.hatchOpen && !this.has('hatch-seen') && !this.has('hunt') && inWardrobe(p.x, p.z) === false && looking(9.55, 2.27, -0.12, 0.8, 2.4) && this.sys.flashlight?.on) {
      this.set('hatch-seen');
      this.sys.nest?.drop();
      this.say('...How long?', { delay: 1.2 });
    }
    if (this.act === 4) this.sys.hunt?.update(dt);
  }

  // --- Act I: water --------------------------------------------------------------------------------------------------
  begin({ seed = Date.now() >>> 0, difficulty = this.difficulty } = {}) {
    this.flags.clear(); this.timers.length = 0; this.time = 0; this.deaths = 0;
    this.difficulty = difficulty;
    this.newRun(seed);
    this.act = 1;
    this.unlock = null; this.sighting = null; this.dying = false; this.lastScare = -Infinity;
    const power = this.sys.power;
    if (power) { power.load({ main: true, rcd: true, breakers: Object.fromEntries(Object.keys(power.breakers).map(c => [c, true])), faults: [] }); power.mainBroken = false; }
    this.sys.world?.reset(this);
    this.scheduleNightSounds();
    this.armWater();
    this.save();
  }

  // Act I never stalls (docs/STORY.md): no drink by 4:00, a thought; by 6:00 the glass breaks anyway, as soon as the
  // player is out of the bedroom and the bathroom (it has to be heard, not seen falling).
  armWater() {
    this.after(240, () => { if (!this.has('drank') && !this.has('glass')) this.say('Water. Then bed.'); }, 'nudge-water');
    const late = () => {
      if (this.has('glass')) return;
      const z = zoneAt(this.pos.x, this.pos.z);
      if (z === 'bed' || z === 'bath') { this.after(2, late, 'glass-late'); return; }
      this.glassBreaks();
    };
    this.after(360, late, 'glass-late');
  }

  // The drink is over (drink-sequence.js). Shutting the fridge starts the glass (story-events.js); a fridge left open
  // starts it too: 12 s after the drink once the player has walked 2 m from it, 25 s after it at the latest.
  drank() {
    if (!this.set('drank')) return;
    const t0 = this.time;
    const check = () => {
      if (this.has('glass')) return;
      const f = this.sys.fridge;
      if (f && !f.openRequested && f.angle < 1) return;           // shut: the fridge's own signal has it
      const at = f?.handle ?? { x: FRIDGE_AT[0], z: FRIDGE_AT[1] };
      const far = Math.hypot(this.pos.x - at.x, this.pos.z - at.z) > 2;
      // Heard, not seen: never while the player is in the bedroom or the bathroom (it would lock them in there).
      const zone = zoneAt(this.pos.x, this.pos.z), away = zone !== 'bed' && zone !== 'bath';
      if (away && ((far && this.time - t0 >= 12) || this.time - t0 >= 25)) this.signal('fridge-shut-after-drink');
      else this.after(1, check, 'drink-fallback');
    };
    this.after(12, check, 'drink-fallback');
  }

  // The notice on the fridge, read for the first time: relief. Then, before the glass, the first wrong sound: something
  // heavy crossing the kitchen ceiling (the player tells themself it is upstairs). If the notice is never read, the
  // creaks come a little after the player first walks into the kitchen.
  noticeRead() { if (this.set('notice-read')) { this.say('Finally.', { delay: 0.6 }); this.upstairs(9); } }
  upstairs(delay) {
    if (this.has('upstairs-armed') || this.has('glass')) return;
    this.set('upstairs-armed');
    this.after(delay, () => {
      if (this.has('glass') || this.has('ended') || !this.set('upstairs')) return;
      const path = [[-2.6, 2.72, -0.7], [-1.2, 2.72, -0.45], [0.3, 2.72, -0.2]];
      path.forEach((at, i) => this.after(i * 1.3, () => this.sfx(['creak_3', 'creak_2', 'creak_long'][i], { at, gain: 0.45, send: 0.5, occlude: false })));
      this.after(0.2, () => this.caption('[Creaking, above the ceiling]'));
      this.say('...Upstairs.', { delay: 4.4, hold: 1.6 });
    }, 'upstairs');
  }

  // Ordinary night sounds (docs/STORY.md pillar 2: ordinary first): someone takes the lift in the stairwell; a
  // neighbour's toilet through the bathroom wall. Once each per night, at seeded times; never in the hunt, never on top
  // of a scare (they wait).
  scheduleNightSounds() {
    const r = this.random;
    const plan = [
      ['lift', 30 + r() * 30, () => { this.sfx('elevator', { at: [12.9, 1.4, 5.9], gain: 0.55, ref: 2.5, rolloff: 0.8, send: 0.7 }); this.caption('[The lift, in the stairwell]'); }],
      ['toilet', 140 + r() * 90, () => { this.sfx('toilet', { at: [7.8, 1.0, -2.4], gain: 0.5, ref: 1.5, rolloff: 0.9, send: 0.6 }); this.caption('[A toilet flushes, next door]'); }],
    ];
    for (const [id, at, play] of plan) {
      const go = () => {
        if (this.has('hunt') || this.has('ended') || this.has(`night-${id}`)) return;
        if (this.time - this.lastScare < 15 || this.dying) { this.after(20, go, `night-${id}`); return; }
        this.set(`night-${id}`); play();
      };
      this.after(at, go, `night-${id}`);
    }
  }

  // A tap turned off (taps.js). In an old building the pipes knock when a tap shuts: the first time, three dull knocks
  // in the wall, and the player tells themself what it is.
  tapClosed(id) {
    if (id === 'bathroom' && this.has('power-cut') && !this.has('tap-off')) this.tapOff();
    // Only before the glass: later, nothing explains a sound away.
    if (this.has('pipes') || this.has('glass')) return;
    this.set('pipes');
    const at = id === 'bathroom' ? [7.2, 1.6, 2.2] : [-2.9, 1.5, -1.75];
    // A footfall recording slowed right down, heard through the wall: a dull knock in a pipe.
    for (let i = 0; i < 3; i++) this.after(0.9 + i * 0.42 + this.random() * 0.08, () => this.sfx('step_floor', { at, gain: 0.55, rate: 0.5 + this.random() * 0.06, send: 0.6 }));
    this.after(0.9, () => this.caption('[Knocking in the pipes]'));
    this.say('Pipes.', { delay: 2.8, hold: 1.4 });
  }

  // The phone, taken from the nightstand (phone.js): dead, and its charger pulled out of the wall.
  phoneTaken(phone) {
    if (!this.set('phone')) return;
    if (phone?.booted) return;
    this.say('Dead.', { delay: 0.2 });
    if (!phone?.pluggedIn) this.say('...The charger’s out of the wall.', { gap: 0.6 });
    this.sys.journal?.find('phone-dead');
  }

  // Put back on the nightstand with its charger plugged in again.
  phoneCharging() { if (this.set('charging')) this.say('I never unplug it.', { delay: 0.4 }); }

  // A flat phone needs minutes on the charger before it can start; it starts once the power is back, after the quiet
  // that follows (its buzz is a scare of its own).
  // It waits for the player to be within earshot of it (7 m), or two minutes after the power came back.
  phoneMayBoot(chargeTime) {
    if (!this.has('restored') || chargeTime < 30) return false;
    const since = this.time - (this.restoredAt ?? this.time), near = Math.hypot(this.pos.x - 13.6, this.pos.z - 1.8) < 7;
    return since >= 35 && (near || since > 120) && (this.canScare() || since > 90);
  }

  // Story event 'falling-glass': 3 s after the fridge shuts after drinking.
  glassBreaks() {
    if (this.has('glass')) return;
    // Never with the player in the bathroom: its door is about to be locked from inside (wait until they are out).
    if (zoneAt(this.pos.x, this.pos.z) === 'bath') { this.after(1, () => this.glassBreaks(), 'glass-wait'); return; }
    this.set('glass');
    const ear = this.sys.camera.getPosition();
    const near = zoneAt(ear.x, ear.z) === 'bed';
    // Heard everywhere: through the doorways, softened, but never below a clear level (min).
    this.sfx('glass_break', { at: GLASS_SPOT, gain: near ? 1.8 : 1.6, ref: 3.5, rolloff: 1, min: 0.6, send: 0.35 });
    this.caption('[Glass shatters, in the bedroom]');
    this.cancel('drink-fallback'); this.cancel('glass-late'); this.cancel('nudge-water'); this.cancel('upstairs');
    this.sys.world?.shards(true);
    this.sys.world?.bathroomOccupied(true);            // he went in there: shut, locked, the tap running
    this.say('...What was that?', { delay: 1.4, hold: 2.2 });
    this.scared();
    this.signal('glass-broke');
    this.after(40, () => { if (!this.has('shards-seen') && zoneAt(this.pos.x, this.pos.z) !== 'bed') this.say('The bedroom.'); }, 'nudge-bedroom');
    this.after(120, () => this.powerCut('timeout'), 'cut-fallback');
  }

  shardsSeen() {
    this.set('shards-seen');
    this.say('I didn’t bring a glass to bed.');
    this.say('...Blood?', { gap: 0.9, hold: 1.6 });
    this.sys.journal?.find('glass');
    this.sys.journal?.find('blood');
    this.soonest(25, () => this.powerCut('timeout'), 'cut-fallback');
  }

  // E on the locked bathroom door: the handle, then a knock; the tap stops; silence; the bang.
  bathroomTried() {
    if (this.has('power-cut')) { this.sfx('door_locked', { at: BATH_DOOR, gain: 0.7 }); return; }
    if (!this.has('bath-tried')) {
      this.set('bath-tried');
      this.sfx('door_locked', { at: BATH_DOOR, gain: 0.8, send: 0.25 });
      this.say('Locked.', { delay: 0.3 });
      this.sys.journal?.find('bathroom-locked');
      // Behind the door the tap stops; then the line of light under the door goes out (a switch, faintly, inside).
      this.after(0.9, () => { if (!this.has('power-cut')) this.sys.world?.tap(false); });
      this.after(2.6, () => this.bathroomLightOut());
      return;
    }
    if (this.has('bath-knocked')) return;
    this.set('bath-knocked');
    this.sfx('knock_soft', { at: [9.15, 1.4, 0.85], gain: 0.55, send: 0.3 });
    this.after(0.9, () => this.caption('[Silence]'));
    this.say('...Hello?', { delay: 1.2, hold: 1.6 });
    this.cancel('cut-fallback');
    this.after(4.6, () => this.powerCut('bathroom'), 'cut');
  }

  // He switches the bathroom's lights off from inside: a faint click, and the light under the door is gone.
  bathroomLightOut() {
    if (!this.set('bath-dark')) return;
    const sw = this.sys.switches;
    this.sfx('latch_2', { at: [8.6, 1.4, 1.2], gain: 0.22, rate: 2.1, send: 0.4 });
    for (const room of sw?.rooms || []) if ((room.id === 'mirror' || room.id === 'bathroom') && room.on) {
      room.on = false;
      if (!sw.fades.includes(room)) sw.fades.push(room);
    }
  }

  // The bang and the dark (the RCD trips the flat). cause: 'bathroom' (knocked), 'timeout'.
  powerCut(cause) {
    if (this.has('power-cut')) return;
    this.set('power-cut');
    this.cancel('cut-fallback'); this.cancel('cut');
    const at = [7.0, 1.2, 1.2];
    this.sfx('arc_crackle', { at, gain: 1, send: 0.4, min: 0.3 });
    this.sfx('arc_discharge', { at, gain: 1, delay: 0.12, send: 0.5, min: 0.35 });
    this.sfx('boom', { gain: 0.6, delay: 0.1, bus: 'scare' });
    this.sfx('rcd_trip', { at: [FUSEBOX[0], 1.7, 4.4], gain: 0.6, delay: 0.35, min: 0.08 });
    this.sfx('power_down', { gain: 0.35, delay: 0.25, bus: 'amb' });
    this.sys.power.faults.add('bathroom');
    if (this.nuisance !== 'none') this.sys.power.faults.add(this.nuisance);
    this.sys.power.trip([7.4, 0.9], cause);
    this.sys.world?.tap(true, { hot: true });
    this.sys.world?.dryerInBasin(true);               // your hair-dryer, plugged in, dropped into the basin
    this.sys.rain?.burst?.(45);                         // lightning every 6-10 s for 45 s
    this.act = 2;
    this.scared();
    this.save();
    this.caption('[A bang. The power dies.]');
    this.say('No. No, no, no.', { delay: 1.6, hold: 1.8 });
    this.armDark();
    this.sys.music?.sting('low');
  }

  // Act II's nudges (the cut, or a checkpoint in the dark): the torch, then the fuse box.
  armDark() {
    this.after(4, () => { if (!this.sys.flashlight?.held) this.say('The torch. Left side of the wardrobe.'); }, 'nudge-torch');
    this.after(50, () => { if (!this.has('fusebox-opened') && !this.has('restored')) this.say('The fuse box. Far end of the hall.'); }, 'nudge-fusebox');
    this.after(110, () => { if (!this.has('fusebox-opened') && !this.has('restored')) this.say('The fuse box.'); }, 'nudge-fusebox-2');
  }

  // The RCD snapped down again (fusebox.js): a ladder of hints, in the player's own words, for whoever is stuck.
  fuseTripped(tries) {
    if (this.has('restored')) return;
    if (this.sys.power && !this.sys.power.breakers.bathroom) { if (this.set('hint-still')) this.say('Still tripping. ...What else is wet?', { delay: 0.8 }); return; }
    if (tries === 2 && this.set('hint-wet')) this.say('Something’s wet.', { delay: 0.8 });
    else if (tries >= 3 && this.set('hint-bath')) this.say('The bathroom. Off first.', { delay: 0.8 });
  }

  // The right wardrobe door won't open until he has been seen (closets.js asks): held from inside before the glass
  // (the hangers rattle: he is in there), jammed and silent after it (he is in the bathroom then).
  wardrobeStuck(door) {
    if (door.id !== 'right' || this.has('silhouette')) return false;
    if (!this.has('glass')) {
      this.sfx('hangers', { at: [9.6, 1.6, -0.1], gain: 0.5, send: 0.3 });
      this.sfx('door_rattle', { at: [9.75, 1.2, -0.1], gain: 0.35 });
    }
    if (!this.has('stuck')) { this.set('stuck'); this.say('Stuck.', { delay: 0.3 }); this.sys.journal?.find('stuck'); }
    return true;
  }

  // The right door, once he has gone up through it: a hanger drops off the rail and clatters as it swings (the nest's
  // small scare), then the nest.
  wardrobeOpened(door) {
    if (door.id === 'right' && this.has('silhouette') && !this.has('nest-seen') && this.sys.nest?.packed !== true) {
      if (this.set('hanger')) {
        this.after(0.35, () => { this.sys.nest?.dropHanger?.(); this.scare('hangers', { at: [9.5, 1.6, -0.1], gain: 1.0, send: 0.35, min: 0.3 }); this.sys.nest?.dust(3); });
        this.scared();
      }
      this.after(1.6, () => this.nestSeen());
    }
  }

  // --- Act II: the fuse box and the silhouette ------------------------------------------------------------------------
  fuseboxOpened() {
    if (this.has('fusebox-opened') || !this.has('power-cut') || this.has('restored')) return;   // its beats are the dark's
    this.set('fusebox-opened');
    this.signal('fusebox-opened');
    this.after(4, () => this.creakEast(), 'creak1');
    this.after(12, () => this.creakEast(), 'creak2');
    // Still not turned round: the front door's handle goes down, slowly, and back.
    this.after(20, () => {
      if (this.has('silhouette') || this.has('restored')) return;
      this.sfx('door_rattle', { at: [FRONT_DOOR[0], FRONT_DOOR[1], FRONT_DOOR[2]], gain: 0.45, rate: 0.7, send: 0.35 });
      this.caption('[The front door handle, slowly]');
    }, 'handle');
    this.after(90, () => { if (!this.has('restored')) this.say('All off. Then one at a time.'); }, 'hint-label');
  }

  creakEast() {
    if (this.has('silhouette') || this.has('restored')) return;
    this.sfx(this.random() < 0.5 ? 'creak_long' : 'creak_1', { at: [CORRIDOR_EAST[0], 0.2, CORRIDOR_EAST[1]], gain: 0.75, ref: 1.2, send: 0.4 });
    this.caption('[A floorboard creaks, down the hall]');
  }

  // While the player works the box: once the torch beam points down the corridor towards the front door, he is standing
  // there at the edge of the light. He holds still for most of a second, then runs at the player and swerves into the
  // bedroom (docs/STORY.md beat 11; the owner: "he shouldn't disappear, he should just quickly sneak into the bedroom").
  silhouetteWatch() {
    const fl = this.sys.flashlight, p = this.pos, man = this.sys.intruder;
    if (this.sighting || !man) return;
    const inCorridor = zoneAt(p.x, p.z) === 'hall' || (p.x < 1.8 && p.z > 2.6);
    if (!inCorridor) return;
    const dir = fl?.beam?.up;                                    // a spot shines along its -up
    const aim = dir ? { x: -dir.x, z: -dir.z } : { x: 0, z: 0 }, l = Math.hypot(aim.x, aim.z) || 1;
    const lit = fl?.held && fl.on, east = aim.x / l;
    // Walking back east towards him (west of the bedroom doorway): he breaks for the bedroom now, seen if the torch is
    // on him. East of the doorway nothing starts (his run would cross the player); he is heard at power-back instead.
    if (p.x > 7) { if (p.x < 9.4) this.startSighting({ seen: !!lit && east > 0.7, now: true }); return; }
    if (lit && east > 0.93) this.startSighting({ seen: true });  // at least ~5 m from where he stands
  }

  // seen: the torch is on him (the beat as designed); false: the player never turned round, he is heard running into
  // the bedroom instead. He is there either way (a lit corridor shows him); `seen` chooses the thoughts and the journal.
  // now: he breaks at once (the player is coming his way).
  startSighting({ seen = true, now = false } = {}) {
    if (this.sighting || this.has('silhouette')) return;
    const man = this.sys.intruder;
    this.set('silhouette');
    this.sighting = { t: 0, seen, now, leg: 0, stride: 0, hidden: false, gone: false, lit: 0 };
    if (man) {
      man.show(true); man.place(SPRINT[0][0], SPRINT[0][1], -90); man.play('idle_breathe_01', { blend: 0 });
      man.setTorch(false);
      man.headPitch = 6;                                         // looking down the corridor, at you
    }
    if (seen) { this.sys.journal?.find('silhouette'); this.scared(); }
  }

  updateSighting(dt) {
    const g = this.sighting, man = this.sys.intruder;
    g.t += Math.min(dt, 0.1);
    // He holds still until the torch has been on him for a second (at least 1.2 s, at most 2.5 s); unseen, a second.
    if (!g.running) {
      const fl = this.sys.flashlight, dir = fl?.beam?.up;
      if (fl?.held && fl.on && dir && -dir.x / (Math.hypot(dir.x, dir.z) || 1) > 0.9) g.lit += Math.min(dt, 0.1);
      const coming = this.pos.x > 8;                               // the player walks on towards him: he goes now
      if (!g.now && !coming && (g.seen ? g.t < 1.2 || (g.lit < 1 && g.t < 2.5) : g.t < 1)) return;
      g.running = true; g.at = [...SPRINT[0]]; g.leg = 1;
      if (man) { man.headPitch = 0; man.play('run_neutral_01', { blend: 0.12, speed: SPRINT_SPEED / 3.1 }); }
      // Bare, wet feet (the bathroom's water: his prints): the first slap through the scare path, a heavy breath.
      this.scare('step_wet', { at: [g.at[0], 0.2, g.at[1]], gain: 1.2, rate: 0.85, send: 0.3, min: 0.35 });
      this.sfx('his_breath_2', { at: [g.at[0], 1.6, g.at[1]], gain: 0.7, send: 0.3, min: 0.15 });
      this.caption('[Running footsteps]');
    }
    // Along the path at a sprint; a heavy footfall every stride.
    if (!g.gone) {
      let step = SPRINT_SPEED * Math.min(dt, 0.1);
      while (step > 0 && g.leg < SPRINT.length) {
        const [tx, tz] = SPRINT[g.leg], dx = tx - g.at[0], dz = tz - g.at[1], d = Math.hypot(dx, dz);
        if (d <= step) {
          g.at = [tx, tz]; step -= d; g.leg++;
          if (g.leg === SPRINT_OPEN + 1) { const right = this.sys.closets?.doors?.find(x => x.id === 'right'); if (right) this.sys.closets.open?.(right); }
          continue;
        }
        g.at = [g.at[0] + dx / d * step, g.at[1] + dz / d * step]; step = 0;
        g.yaw = Math.atan2(dx, dz) * 180 / Math.PI;
      }
      g.stride += SPRINT_SPEED * Math.min(dt, 0.1);
      if (g.stride > 1.1) { g.stride = 0; this.sfx(g.leg % 2 ? 'step_wet' : 'step_floor', { at: [g.at[0], 0.2, g.at[1]], gain: 1.0, rate: [0.82, 0.95], send: 0.3, min: 0.25 }); }
      if (man && !g.hidden) man.place(g.at[0], g.at[1], g.yaw ?? -90);
      // Out of the player's sight once he is through the bedroom doorway: gone (he is in the wardrobe, then up).
      const through = g.at[1] < 2.5;
      if (through && !g.hidden && !this.sys.nav?.sees?.({ x: this.pos.x, y: 1.6, z: this.pos.z }, { x: g.at[0], y: 1.2, z: g.at[1] })) { g.hidden = true; man?.show(false); }
      if (g.leg >= SPRINT.length) { g.gone = true; g.goneAt = g.t; if (!g.hidden) { g.hidden = true; man?.show(false); } this.intoTheWardrobe(); }
    }
    if (g.gone && g.t - g.goneAt > 6) this.sighting = null;
  }

  // The end of the run: the wardrobe bangs, a thump in the ceiling, creaks crossing above the corridor towards the
  // player; then the thoughts. The bathroom stands open, his prints are in the corridor, the hatch is open.
  intoTheWardrobe() {
    const seen = this.sighting?.seen;
    this.sfx('door_slam', { at: [9.75, 1.2, 0.1], gain: 0.9, send: 0.45, min: 0.25 });
    this.sys.closets?.swing?.('right', 18);
    this.after(1.1, () => { this.scare('door_kick', { at: [9.5, 2.65, -0.1], gain: 0.75, rate: 0.7, send: 0.6, occlude: false, min: 0.3 }); this.sys.nest?.dust(4); this.sys.music?.sting('low'); });
    CEILING_WEST.forEach((at, i) => this.after(2.4 + i * 1.15, () => this.sfx(i % 2 ? 'creak_2' : 'creak_3', { at, gain: 0.75, send: 0.5, occlude: false })));
    this.after(1.1, () => this.caption('[Something heavy, in the ceiling]'));
    this.after(1.8, () => this.say('...Someone’s in here.', { hold: 2 }));
    this.after(seen ? 4.6 : 4.2, () => this.say(seen ? 'He’s in my bedroom.' : 'In my bedroom.', { hold: 2.2 }));
    this.after(9, () => this.sys.music?.swell(0.5, 8));
    this.afterSilhouette();
  }

  // He has gone back up: the bathroom stands open, his prints are in the corridor, the hatch is open.
  afterSilhouette() {
    this.sys.world?.prints(true);
    this.set('prints');
    if (!this.has('bathroom-open')) this.sys.world?.bathroomOccupied(false);
    this.sys.nest?.hatch(true);                       // the hatch above the nest stands open now
  }

  // power.js reports the flat live again (the RCD up with the faulty circuit off).
  powerRestored() {
    if (!this.has('power-cut') || this.has('restored')) return;
    // The player never turned round: he is heard instead, running from the front door into the bedroom.
    if (!this.has('silhouette')) this.after(1.2, () => this.startSighting({ seen: false }));
    this.set('restored');
    this.restoredAt = this.time;
    this.act = 3;
    this.sys.rain?.burst?.(0);
    this.say('Okay.', { delay: 1.2 });
    this.save();
    this.signal('power-restored');
    // 45 s of nothing; then the nudges and the fallbacks.
    this.after(20, () => { if (!this.sys.phone?.charging && !this.sys.phone?.booted) this.say('My phone. ...The charger.'); }, 'nudge-phone');
    this.after(45, () => { if (!this.has('bathroom-visited')) this.say('The bathroom.'); }, 'nudge-bathroom');
    this.huntFallback(150);
  }

  // --- Act III: the bathroom, the nest, the phone ------------------------------------------------------------------
  bathroomVisited() { if (this.set('bathroom-visited')) this.cancel('nudge-bathroom'); }

  tapOff() {
    if (!this.set('tap-off')) return;
    this.sys.world?.tap(false);
    // In the new quiet, something heavy shifts in the ceiling and moves towards the wardrobe.
    const path = [[8.2, 2.7, 0.6], [8.9, 2.7, 0.3], [9.5, 2.7, 0.0]];
    path.forEach((at, i) => this.after(1.6 + i * 0.9, () => this.sfx(i === 2 ? 'creak_long' : 'creak_3', { at, gain: 0.7, send: 0.5, occlude: false })));
  }

  nestSeen() {
    if (!this.set('nest-seen')) return;
    this.sys.journal?.find('nest');
    this.sfx('gasp', { gain: 0.45, delay: 0.3 });
    this.signal('nest-found');
    if (this.has('restored')) this.huntFallback(75);
  }

  polaroids() { if (this.set('polaroids')) { this.say('That’s my bed.'); this.sys.journal?.find('polaroids'); } }
  polaroidBack() { if (this.set('let-me-in')) { this.say('March. ...Seven months.', { delay: 0.6 }); this.sys.journal?.find('let-me-in'); } }
  oldKey() { if (this.set('old-key')) { this.say('5B.', { delay: 0.3 }); this.say('Not mine.', { gap: 0.6 }); this.sys.journal?.find('old-key'); } }

  // The phone boots now and buzzes with what it missed (the developer menu; in a night it boots on its charger once
  // the power is back: phone.js asks phoneMayBoot).
  phoneAlerts() {
    if (this.has('alerts')) return;
    this.sys.phone?.boot();
  }

  // Its buzz on the nightstand is a scare of its own (phone.js boot, when it lies there).
  phoneBooted() {
    if (!this.sys.phone?.onCharger) return;
    this.scared();
    this.after(3.2, () => this.caption('[A phone buzzes, in the bedroom]'));
    if (zoneAt(this.pos.x, this.pos.z) !== 'bed') this.say('My phone.', { delay: 3.4 });
  }

  // The LIVE view was opened (phone.js / seccam.js run it; at its end the power dies).
  liveWatched() { this.set('live'); }

  // The hunt starts by itself after `seconds` (fallback), but never in the middle of the LIVE scene (seccam.js).
  huntFallback(seconds) {
    let waited = 0;
    const go = () => {
      const atWardrobe = Math.hypot(this.pos.x - WARDROBE[0], this.pos.z - WARDROBE[1]) < 3 && waited < 45;
      if (this.sys.seccam?.liveRunning || atWardrobe) { waited += 5; this.after(5, go, 'hunt-fallback'); return; }
      this.huntStart('timeout');
    };
    this.soonest(seconds, go, 'hunt-fallback');
  }

  // --- Act IV: the hunt ---------------------------------------------------------------------------------------------
  huntStart(cause) {
    if (this.has('hunt')) return;
    this.set('hunt');
    this.cancel('hunt-fallback'); this.cancel('hunt-call'); this.cancel('hunt-door');
    this.act = 4;
    this.sys.music?.sting('hit');
    this.sfx('breaker_big', { segment: 0, at: [FUSEBOX[0], 1.7, 4.4], gain: 0.9, min: 0.12 });
    this.sys.power.setMain(false, FUSEBOX);
    this.sys.power.mainBroken = true;
    // The lock heard from above (cause 'door'): he drops out of the hatch and comes at once. Otherwise his light comes on
    // at the fuse box for the survivable first sweep.
    const door = cause === 'door';
    this.sys.hunt?.start({ tutorial: !door, from: door ? 'hatch' : 'fusebox' });
    this.packNest();                          // he takes the nest up into the void during the hunt (out of view)
    this.save();
    if (door) { this.after(1.2, () => this.say('...He heard it.', { hold: 1.4 })); return; }
    this.after(2.5, () => this.say(this.seesHim() ? 'His light.' : 'He’s back.'));
    this.after(5.5, () => { this.say(this.sys.flashlight?.on ? 'Torch off. Get down.' : 'Get down. Stay quiet.'); this.sys.hud?.prompt('C', 'Crouch', 6); });
    this.after(28, () => this.say(this.sys.items?.has('spare-key') ? 'The door. Now.' : 'Get out. ...The spare key.'));
  }

  // Is he (his light) in the player's line of sight now?
  seesHim() {
    const s = this.sys.hunt?.stalker, eye = this.sys.camera.getPosition();
    return !!s && !!this.sys.nav?.sees?.({ x: eye.x, y: eye.y, z: eye.z }, { x: s.x, y: 1.4, z: s.z });
  }

  // The nest goes up with him, but never while the player is looking into the wardrobe.
  packNest() {
    const eye = this.sys.camera.getPosition(), fwd = this.sys.camera.forward;
    const dx = WARDROBE[0] - eye.x, dz = WARDROBE[1] - eye.z, d = Math.hypot(dx, dz);
    if (d < 4.5 && (dx * fwd.x + dz * fwd.z) / (d || 1) > 0.3) { this.after(1, () => this.packNest(), 'pack-nest'); return; }
    this.sys.nest?.packUp();
  }

  // He caught the player: the knife, the fall, black (death.js), then waking on the sofa at 03:07. Whatever was half
  // done is undone: a lock half turned, a call-back waiting.
  caught() {
    if (this.dying) return;
    this.dying = true;
    this.deaths++;
    this.unlock = null; this.cancel('unlock');
    this.sys.death?.play(() => this.wake());
  }

  wake() {
    this.flags.delete('woke'); this.set('woke');          // the bedside clock goes back to 03:07 (main.js)
    const lines = ['...A dream?', 'Again.', 'Wake up. Wake up.'];
    this.sys.death?.wakeUp(() => {
      this.dying = false;
      if (this.has('ended')) return;
      // Police already on their way: at least 30 s more to hold out (docs/STORY.md).
      const police = this.timers.find(t => t.id === 'police');
      if (police) police.at = Math.max(police.at, this.time + 30);
      this.say(lines[Math.min(this.deaths, 3) - 1], { delay: 0.6 });
      const save = this.difficulty === 'hard' && this.deaths >= 3 ? this.load() : null;
      if (save) {
        // Back to the hunt's checkpoint; the deaths stand, and you wake at 03:07 (the clocks).
        const deaths = this.deaths;
        this.restore(save); this.deaths = deaths;
        this.flags.delete('woke'); this.set('woke');
        return;
      }
      if (this.has('hunt')) this.sys.hunt?.respawn();
    });
  }

  // --- endings -------------------------------------------------------------------------------------------------
  // The police were told: what they were told decides how it ends (Evicted = where and who). A call made before the
  // hunt is heard above the ceiling: the hunt starts 12 s later.
  policeCalled({ where, who }) {
    const first = !this.has('police');
    this.set('police'); this.told = { where: !!(where || this.told?.where), who: !!(who || this.told?.who) };
    if (!first) return;
    const seconds = { story: 60, normal: 100, hard: 110 }[this.difficulty] ?? 100;
    this.after(seconds, () => this.policeArrive(), 'police');
    if (!this.has('hunt')) this.after(12, () => this.huntStart('call'), 'hunt-call');
  }

  policeArrive() {
    if (this.has('ended')) return;
    this.sys.hunt?.flee();
    this.sys.endings?.police(this.told?.where && this.told?.who ? 'evicted' : 'locked');
  }

  escaped() { if (!this.has('ended')) this.sys.endings?.play('out'); }

  // The front door (main.js). Locked at night, and the keys are not in the bowl. Before the man has been seen, going out
  // barefoot over a glass is not something you would do; after, with the spare, E held turns the stiff lock
  // (updateUnlock). Starting on it before the hunt brings him down from the hatch: it is a race.
  frontDoor() {
    if (this.has('ended') || this.dying) return;
    if (!this.sys.items?.has('spare-key')) {
      this.sys.sounds?.lockedDoor?.();
      this.sys.hunt?.noise(FRONT_DOOR[0], FRONT_DOOR[2], 'door');   // rattling it in the hunt carries 6 m
      if (!this.has('glass')) this.say(this.has('key-bowl') ? 'Locked. ...Where are my keys?' : 'Locked. Good.');
      else if (!this.has('silhouette')) {
        if (!this.has('door-thought')) { this.set('door-thought'); this.say('Locked.'); this.say(this.has('key-bowl') ? 'My keys are gone.' : '...Where are my keys?', { gap: 0.6 }); }
        else this.say(this.has('key-bowl') ? 'My keys are gone.' : '...Where are my keys?');
      } else if (!this.has('door-keys')) { this.set('door-keys'); this.say('Locked.'); this.say('...My keys. He has my keys.', { gap: 0.6 }); }
      else if (!this.spareSearchable()) this.say('He has my keys.');
      else this.say(this.has('diary-read-key') ? 'The spare. ' + (this.spareKey?.line ? `${this.spareKey.line[0].toUpperCase()}${this.spareKey.line.slice(1)}.` : '') : 'The spare. Where’s the spare?');
      return;
    }
    if (!this.has('silhouette')) { this.say('Locked. Good.'); return; }
    if (!this.unlock) {
      this.unlock = { t: 0, clicks: 0 };
      this.sfx('keys_unlock', { at: FRONT_DOOR, gain: 0.6, rate: 1.25 });
      if (!this.has('hunt')) this.after(0.6, () => this.huntStart('door'), 'hunt-door');
    }
  }

  // Turning the stiff lock: E held near the door (3 s in all; letting go keeps what is turned). A loud click each
  // second, each a 6 m noise for him.
  updateUnlock(dt) {
    const u = this.unlock, at = FRONT_DOOR, p = this.pos;
    if (this.has('ended') || this.dying) return;
    u.holding = Math.hypot(p.x - at[0], p.z - at[2]) < 1.5 && !!this.sys.eHeld?.();
    if (!u.holding) return;
    u.t += Math.min(Math.max(dt, 0), 0.1);
    const clicks = Math.min(3, Math.floor(u.t + 1e-4));
    if (clicks > u.clicks) {
      u.clicks = clicks;
      this.sfx(clicks < 3 ? 'keys_unlock' : 'deadbolt', { at, gain: 0.95, rate: clicks < 3 ? 1 + clicks * 0.08 : 1, min: 0.2 });
      this.sys.hunt?.noise(at[0], at[2], 'unlock');
    }
    if (u.t >= 3) { this.unlock = null; this.escaped(); }
  }

  // The spare key's hiding places can be searched once the player needs it badly enough: after his nest, or in the
  // hunt (before that, a first night would end at the door minutes after he is first seen).
  spareSearchable() { return this.has('hunt') || (this.has('nest-seen') && this.has('restored')); }

  // What the front door's prompt says.
  doorLabel() {
    if (!this.sys.items?.has('spare-key') || !this.has('silhouette')) return 'Front door';
    const u = this.unlock;
    return u ? `Hold E · unlock the door${u.clicks ? ` · ${u.clicks}/3` : ''}` : 'Unlock the door (hold E)';
  }

  // The empty key bowl by the front door.
  keyBowl() {
    if (this.set('key-bowl')) { this.say('Empty.'); this.say('My keys are always in here.', { gap: 0.5 }); this.sys.journal?.find('key-bowl'); }
    else this.say('Empty.');
  }
  sleptAgain() { if (!this.has('ended')) this.sys.endings?.play('sweet-dreams'); }
  canSleep() { return this.has('glass') && !this.has('power-cut'); }

  // --- checkpoints -------------------------------------------------------------------------------------------------
  save() {
    const police = this.timers.find(t => t.id === 'police');
    const data = { v: 1, act: this.act, flags: [...this.flags], time: this.time, deaths: this.deaths, seed: this.seed, difficulty: this.difficulty,
      power: this.sys.power?.save(), journal: this.sys.journal?.save(), phone: this.sys.phone?.save(), items: this.sys.items?.save(),
      police: police ? Math.max(1, police.at - this.time) : null, told: this.told ?? null };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
    return data;
  }

  load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } }
  hasSave() { const s = this.load(); return !!s && s.act >= 1 && !s.flags?.includes('ended'); }

  // Back to the start of the saved act: the world is rebuilt from the flags (world.js).
  restore(data) {
    if (!data) return this.begin();
    this.flags = new Set(data.flags); this.time = data.time || 0; this.deaths = data.deaths || 0;
    this.difficulty = data.difficulty || 'normal'; this.newRun(data.seed); this.act = data.act;
    this.timers.length = 0;
    this.sys.power?.load(data.power);
    this.sys.journal?.load(data.journal);
    this.sys.phone?.load(data.phone);
    this.sys.items?.load(data.items);
    this.told = data.told ?? null;
    if (data.police) this.after(data.police, () => this.policeArrive(), 'police');
    this.sys.world?.restore(this);
    // Saved in the second before he was heard running at power-back (Act III): he runs now.
    if (this.has('restored') && !this.has('silhouette')) this.after(1.2, () => this.startSighting({ seen: false }));
    if (this.act < 4) this.scheduleNightSounds();
    if (this.act === 1) this.armWater();
    if (this.act === 2) this.armDark();
    if (this.act === 3) {
      this.restoredAt = this.time;
      this.after(45, () => { if (!this.has('bathroom-visited')) this.say('The bathroom.'); }, 'nudge-bathroom');
      this.huntFallback(this.has('nest-seen') ? 75 : 150);
    }
    if (this.act === 4) this.sys.hunt?.respawn();
  }

  clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

  where() { const p = this.pos; return areaAt(p.x, p.z); }
}

export { BED, FUSEBOX, CORRIDOR_EAST };

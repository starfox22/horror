// The story (docs/STORY.md): what has happened (flags), the beats in order, the fallbacks that keep it moving, the
// checkpoints (one per act, saved in the browser) and the run's variations. The scripted moments themselves are
// listed in story-events.js (in story order; the developer menu plays them); each calls a method here.
// Systems are reached through `sys` (main.js), several of them optional so the story degrades rather than breaks.
import { GLASS_SPOT } from './falling-glass.js';
import { areaAt, zoneAt, inWardrobe } from './zones.js';
import { rng } from './stalker.js';

export const ACTS = ['Water', 'Dark', 'Steam', 'The lodger'];
export const SPARE_KEY = [
  { id: 'tin', line: 'the blue tin on the coffee shelf', at: [-5.15, 1.2, -1.25] },
  { id: 'freezer', line: 'the freezer, in the peas', at: [1.55, 0.6, -0.55] },
  { id: 'sofa', line: 'taped under the sofa cushion', at: [-4.4, 0.45, 1.35] },
];
const SAVE_KEY = 'horror.save.v1';
const BED = [12.7, 0.5];
const FUSEBOX = [2.3, 4.25];
const CORRIDOR_EAST = [12.35, 3.55];

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

  say(text, opts) { this.sys.thought?.say(text, opts); }
  signal(name) { this.sys.events?.signal(name); }
  get player() { return this.sys.player; }
  get pos() { return this.sys.player.pos; }
  sfx(key, opts) { return this.sys.bank?.play(key, opts); }

  // --- the clock ---------------------------------------------------------------------------------------------------
  update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.time += dt;
    for (const t of [...this.timers]) if (this.time >= t.at) { this.timers.splice(this.timers.indexOf(t), 1); try { t.fn(); } catch (e) { console.error('story timer', e); } }
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
    // The corridor beat: the silhouette at the far end of the torch beam, while the fuse box is open.
    if (this.has('fusebox-opened') && !this.has('silhouette') && !this.has('restored')) this.silhouetteWatch(dt);
    // His prints in the corridor.
    if (this.has('prints') && !this.has('prints-seen') && zoneAt(p.x, p.z) === 'hall' && p.x > 9.6 && looking(11.6, 0.2, 3.5, 0.75, 3.5)) {
      this.set('prints-seen');
      this.say('...Mine?'); this.say('I wasn’t over there.', { gap: 0.6 });
      this.sys.journal?.find('prints');
    }
    // The wiped mirror (Act III, the bathroom).
    if (this.has('bathroom-open') && !this.has('mirror-seen') && looking(6.5, 1.75, 1.25, 0.85, 2.4)) {
      this.set('mirror-seen'); this.say('Someone wiped the mirror.'); this.sys.journal?.find('mirror');
    }
    // The hatch above the nest: a drop of water falls through the torch beam.
    if (this.has('hatch-open') && !this.has('hatch-seen') && inWardrobe(p.x, p.z) === false && looking(9.55, 2.27, -0.12, 0.8, 2.4) && this.sys.flashlight?.on) {
      this.set('hatch-seen');
      this.sys.nest?.drop();
      this.say('...How long?', { delay: 1.2 });
    }
    // The front door before the hunt: going out over a glass is not something you would do (yet).
    if (this.act === 4) this.sys.hunt?.update(dt);
  }

  // --- Act I: water --------------------------------------------------------------------------------------------------
  begin({ seed = Date.now() >>> 0, difficulty = this.difficulty } = {}) {
    this.flags.clear(); this.timers.length = 0; this.time = 0; this.deaths = 0;
    this.difficulty = difficulty;
    this.newRun(seed);
    this.act = 1;
    this.sys.world?.reset(this);
    this.save();
  }

  // The phone found on the fridge's top shelf (fridge.js asks).
  phoneFound() {
    if (!this.set('phone')) return;
    this.say('...My phone?'); this.say('Ice cold. Dead.', { gap: 0.5 });
    this.sys.phone?.take();
    this.sys.journal?.find('phone-fridge');
  }

  // Story event 'falling-glass': 3 s after the fridge shuts after drinking.
  glassBreaks() {
    if (this.has('glass')) return;
    this.set('glass');
    const ear = this.sys.camera.getPosition();
    const near = zoneAt(ear.x, ear.z) === 'bed';
    // Heard everywhere: through the doorways, softened, but never below a clear level (min).
    this.sfx('glass_break', { at: GLASS_SPOT, gain: near ? 1 : 1.25, ref: 1.6, rolloff: 0.8, min: 0.32, send: near ? 0.35 : 0.65 });
    this.sys.world?.shards(true);
    this.sys.world?.bathroomOccupied(true);            // he went in there: shut, locked, the tap running
    this.say('...Upstairs?', { delay: 1.4, hold: 2.2 });
    this.signal('glass-broke');
    this.after(40, () => { if (!this.has('shards-seen') && zoneAt(this.pos.x, this.pos.z) !== 'bed') this.say('No. The bedroom.'); }, 'nudge-bedroom');
    this.after(120, () => this.powerCut('timeout'), 'cut-fallback');
  }

  shardsSeen() {
    this.set('shards-seen');
    this.say('I didn’t bring a glass to bed.');
    this.sys.journal?.find('glass');
    this.after(25, () => this.powerCut('timeout'), 'cut-fallback');
  }

  // E on the locked bathroom door: the handle, then a knock; the tap stops; silence; the bang.
  bathroomTried() {
    if (this.has('power-cut')) { this.sfx('door_locked', { at: [9.15, 1.0, 0.8], gain: 0.7 }); return; }
    if (!this.has('bath-tried')) {
      this.set('bath-tried');
      this.sfx('door_locked', { at: [9.15, 1.0, 0.8], gain: 0.8, send: 0.25 });
      this.say('Locked.', { delay: 0.3 });
      this.sys.journal?.find('bathroom-locked');
      this.after(0.9, () => this.sys.world?.tap(false));
      return;
    }
    if (this.has('bath-knocked')) return;
    this.set('bath-knocked');
    this.sfx('knock_soft', { at: [9.15, 1.4, 0.85], gain: 0.55, send: 0.3 });
    this.say('...Hello?', { delay: 1.2, hold: 1.6 });
    this.cancel('cut-fallback');
    this.after(4.6, () => this.powerCut('bathroom'), 'cut');
  }

  // The bang and the dark (the RCD trips the flat). cause: 'bathroom' (knocked), 'timeout'.
  powerCut(cause) {
    if (this.has('power-cut')) return;
    this.set('power-cut');
    this.cancel('cut-fallback'); this.cancel('cut');
    const at = [7.0, 1.2, 1.2];
    this.sfx('arc_crackle', { at, gain: 1, send: 0.4, min: 0.25 });
    this.sfx('arc_discharge', { at, gain: 1, delay: 0.12, send: 0.5, min: 0.3 });
    this.sfx('boom', { gain: 0.45, delay: 0.1, bus: 'music' });
    this.sfx('rcd_trip', { at: [FUSEBOX[0], 1.7, 4.4], gain: 0.6, delay: 0.35, min: 0.08 });
    this.sfx('power_down', { gain: 0.35, delay: 0.25, bus: 'amb' });
    this.sys.power.faults.add('bathroom');
    if (this.nuisance !== 'none') this.sys.power.faults.add(this.nuisance);
    this.sys.power.trip([7.4, 0.9], cause);
    this.sys.world?.tap(true, { hot: true });
    this.sys.rain?.burst?.(45);                         // lightning every 6-10 s for 45 s
    this.act = 2;
    this.save();
    this.say('No. No, no, no.', { delay: 1.6, hold: 1.8 });
    this.after(4, () => { if (!this.sys.flashlight.held) this.say('The torch. Wardrobe.'); });
    this.sys.music?.sting('low');
  }

  // The right wardrobe door is held from inside until the cut (closets.js asks).
  wardrobeStuck(door) {
    if (door.id !== 'right' || this.has('power-cut')) return false;
    this.sfx('hangers', { at: [9.6, 1.6, -0.1], gain: 0.5, send: 0.3 });
    this.sfx('door_rattle', { at: [9.75, 1.2, -0.1], gain: 0.35 });
    if (!this.has('stuck')) { this.set('stuck'); this.say('Stuck.', { delay: 0.3 }); this.sys.journal?.find('stuck'); }
    return true;
  }

  // Opening the wardrobe in the dark: a cold draught and dust (it plants the hatch).
  wardrobeOpened(door) {
    if (this.has('power-cut') && !this.has('restored') && !this.has('draught')) {
      this.set('draught');
      this.sys.nest?.dust(4);
      this.sfx('room_tone', { gain: 0.0001 });
    }
    if (door.id === 'right' && this.has('power-cut') && !this.has('nest-seen')) this.after(1.2, () => this.nestSeen());
  }

  // --- Act II: the fuse box and the silhouette ------------------------------------------------------------------------
  fuseboxOpened() {
    if (this.has('fusebox-opened')) return;
    this.set('fusebox-opened');
    this.signal('fusebox-opened');
    this.after(4, () => this.creakEast(), 'creak1');
    this.after(12, () => this.creakEast(), 'creak2');
  }

  creakEast() {
    if (this.has('silhouette') || this.has('restored')) return;
    this.sfx(this.random() < 0.5 ? 'creak_long' : 'creak_1', { at: [CORRIDOR_EAST[0], 0.2, CORRIDOR_EAST[1]], gain: 0.75, ref: 1.2, send: 0.4 });
  }

  // While the player works the box: once the torch beam reaches down the corridor towards the far end, he is standing
  // there at the edge of the light; the torch stutters, and he is gone.
  silhouetteWatch(dt) {
    const fl = this.sys.flashlight, p = this.pos, man = this.sys.intruder;
    if (!fl?.held || !fl.on || !man) return;
    const inCorridor = zoneAt(p.x, p.z) === 'hall' || (p.x < 1.8 && p.z > 2.6);
    if (!inCorridor || p.x > 8) return;
    const dir = fl.beam.up; // spot shines along -up
    const aim = { x: -dir.x, z: -dir.z }, l = Math.hypot(aim.x, aim.z) || 1;
    const toEast = (aim.x / l);
    if (!this.silhouette && toEast > 0.93) {
      this.silhouette = { t: 0 };
      man.show(true); man.place(CORRIDOR_EAST[0], CORRIDOR_EAST[1], -90); man.play('idle_breathe_01', { blend: 0 });
      man.setTorch(false);
    }
    if (this.silhouette) {
      this.silhouette.t += dt;
      if (this.silhouette.t > 0.55 && !this.silhouette.flicker) {
        this.silhouette.flicker = true;
        fl.stutter?.(0.35);
        this.after(0.12, () => { man.show(false); });
        this.set('silhouette');
        this.sys.journal?.find('silhouette');
        this.after(1.4, () => this.say('...Hello?', { hold: 1.4 }));
        this.after(3.5, () => this.sys.music?.swell(0.5, 8));
        this.afterSilhouette();
      }
    }
  }

  // He has gone back to the bedroom (and up): the bathroom stands open, his prints are in the corridor.
  afterSilhouette() {
    this.sys.world?.prints(true);
    this.set('prints');
    this.sys.world?.bathroomOccupied(false);
    this.sys.world?.hatch(true);
  }

  // power.js reports the flat live again (the RCD up with the faulty circuit off).
  powerRestored() {
    if (!this.has('power-cut') || this.has('restored')) return;
    if (!this.has('silhouette')) {
      // The player never turned round: he is there for the half-second the hall lights stutter on, then gone.
      const man = this.sys.intruder;
      man?.show(true); man?.place(CORRIDOR_EAST[0], CORRIDOR_EAST[1], -90); man?.play('idle_breathe_01', { blend: 0 });
      this.after(0.45, () => man?.show(false));
      this.set('silhouette');
      this.afterSilhouette();
    }
    this.set('restored');
    this.act = 3;
    this.sys.rain?.burst?.(0);
    this.say('...Okay.', { delay: 1.2 });
    this.save();
    this.signal('power-restored');
    // 45 s of nothing; then the nudges and the fallbacks.
    this.after(45, () => { if (!this.has('bathroom-visited')) this.say('...The bathroom.'); }, 'nudge-bathroom');
    this.after(60, () => { if (!this.has('nest-seen')) this.phoneAlerts(); }, 'alerts-fallback');
    this.after(150, () => this.huntStart('timeout'), 'hunt-fallback');
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
    this.say('...', { hold: 0.8 });
    this.signal('nest-found');
    this.cancel('alerts-fallback');
    if (this.has('restored')) {
      this.after(20, () => this.phoneAlerts(), 'alerts');
      this.after(75, () => this.huntStart('timeout'), 'hunt-fallback');
    }
  }

  polaroids() { if (this.set('polaroids')) { this.say('That’s my bed.'); this.sys.journal?.find('polaroids'); } }
  polaroidBack() { if (this.set('let-me-in')) this.sys.journal?.find('let-me-in'); }
  oldKey() { if (this.set('old-key')) { this.say('That’s not my key.'); this.sys.journal?.find('old-key'); } }
  letter() { if (this.set('letter')) { this.say('D. Kessler.'); this.sys.journal?.find('letter'); } }

  // The phone boots (on a charger with power, or warmed in a pocket) and buzzes with what it missed.
  phoneAlerts() {
    if (this.has('alerts')) return;
    this.sys.phone?.boot();
  }

  // The LIVE view was opened (phone.js / seccam.js run it; at its end the power dies).
  liveWatched() { this.set('live'); }

  // --- Act IV: the hunt ---------------------------------------------------------------------------------------------
  huntStart(cause) {
    if (this.has('hunt')) return;
    this.set('hunt');
    this.cancel('hunt-fallback'); this.cancel('alerts');
    this.act = 4;
    this.sys.music?.sting('hit');
    this.sfx('breaker_big', { segment: 0, at: [FUSEBOX[0], 1.7, 4.4], gain: 0.9, min: 0.12 });
    this.sys.power.setMain(false, FUSEBOX);
    this.sys.power.mainBroken = true;
    this.sys.hunt?.start({ tutorial: true });
    this.sys.nest?.packUp();                  // he takes the nest up into the void during the hunt
    this.save();
    this.after(2.5, () => this.say('His light.'));
    this.after(5.5, () => { this.say('Torch off. Get down.'); this.sys.hud?.prompt('C', 'Crouch', 6); });
    this.after(30, () => this.say('I have to get out. ...Or call someone.'));
  }

  // He caught the player: the grab, black, then waking in bed.
  caught() {
    if (this.dying) return;
    this.dying = true;
    this.deaths++;
    this.sys.death?.play(() => this.wake());
  }

  wake() {
    this.dying = false;
    const lines = ['...A dream?', 'Again.', 'Wake up. Wake up.'];
    this.sys.death?.wakeUp(() => {
      this.say(lines[Math.min(this.deaths, 3) - 1], { delay: 0.6 });
      if (this.difficulty === 'hard' && this.deaths >= 3) { this.restore(this.load()); return; }
      this.sys.hunt?.respawn();
    });
  }

  // --- endings -------------------------------------------------------------------------------------------------
  // The police were told: what they were told decides how it ends (Lodger = where and who).
  policeCalled({ where, who }) {
    this.set('police'); this.told = { where: !!where, who: !!who };
    const seconds = { story: 60, normal: 100, hard: 110 }[this.difficulty] ?? 100;
    this.after(seconds, () => this.policeArrive(), 'police');
  }

  policeArrive() {
    if (this.has('ended')) return;
    this.sys.hunt?.flee();
    this.sys.endings?.police(this.told?.where && this.told?.who ? 'lodger' : 'locked');
  }

  escaped() { if (!this.has('ended')) this.sys.endings?.play('out'); }
  sleptAgain() { if (!this.has('ended')) this.sys.endings?.play('sweet-dreams'); }
  canSleep() { return this.has('glass') && !this.has('power-cut'); }

  // --- checkpoints -------------------------------------------------------------------------------------------------
  save() {
    const data = { v: 1, act: this.act, flags: [...this.flags], time: this.time, deaths: this.deaths, seed: this.seed, difficulty: this.difficulty,
      power: this.sys.power?.save(), journal: this.sys.journal?.save(), phone: this.sys.phone?.save(), items: this.sys.items?.save() };
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
    this.sys.world?.restore(this);
    if (this.act === 3) {
      this.after(45, () => { if (!this.has('bathroom-visited')) this.say('...The bathroom.'); }, 'nudge-bathroom');
      this.after(this.has('nest-seen') ? 20 : 60, () => this.phoneAlerts(), 'alerts');
      this.after(this.has('nest-seen') ? 75 : 150, () => this.huntStart('timeout'), 'hunt-fallback');
    }
    if (this.act === 4) this.sys.hunt?.respawn();
  }

  clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

  where() { const p = this.pos; return areaAt(p.x, p.z); }
}

export { BED, FUSEBOX, CORRIDOR_EAST };

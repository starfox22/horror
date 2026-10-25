// Act IV (docs/STORY.md): the intruder's mind (stalker.js) driving his body (intruder.js). Each frame: what the player
// is doing goes in (where, crouched, running, torch and for how long, moving, standing in the wardrobe), his decisions
// come out as a place on the floor, a heading, a walk or run matched to his speed (so his feet do not slide), his phone
// light, the knife raised into it before a strike, his footsteps (heard the way round, through doorways: sound.js), his
// breathing when he is close, creaks crossing the ceiling while he is up in the void, his drop through the wardrobe's
// hatch, the bathroom door he opens on his way and a tap left running that he turns off.
import { Stalker, rng, TUTORIAL, DROP } from './stalker.js';
import { FUSEBOX } from './story.js';
import { inWardrobe } from './zones.js';

const STRIDE = { walk_slow_01: 0.92, walk_neutral_01: 1.32, run_neutral_01: 3.1 };
// Noises with a fixed reach (path metres). A tap left running (taps.js) carries 7 m: running water is a lure. Doors and
// the wardrobe 6 m (doors.js, closets.js), glass underfoot 5, each click of the front door's lock 6, the phone ringing 12.
// The player's own steps ('crouch', 'walk', 'run') and 'loud' depend on the difficulty (stalker.js DIFFICULTY.hear).
const NOISE = { glass: 5, unlock: 6, door: 6, wardrobe: 6, tap: 7, phone: 12 };
// Where he comes down (the wardrobe's hatch: dust, the rail's hangers, the landing).
const HATCH = [9.55, 2.2, -0.12];

export class Hunt {
  // doors, closets, nest, taps: the systems he touches (main.js may pass them; otherwise the story's, story.sys).
  constructor({ app, intruder, nav, walk, player, camera, flashlight, bank, story, music, doors = null, closets = null, nest = null, taps = null,
    difficulty = () => 'normal' }) {
    Object.assign(this, { app, intruder, nav, walk, player, camera, flashlight, bank, story, music, difficulty });
    this.systems = { doors, closets, nest, taps };
    this.active = false;
    this.time = 0; this.torchHeld = 0;
    this.stepDist = 0; this.breathTimer = 0;
    this.stalker = new Stalker({ nav, difficulty: difficulty(), random: rng((story.seed ^ 0x5eed) >>> 0), hooks: {
      state: (now, prev) => this.onState(now, prev),
      breath: (kind) => this.breath(kind === 'alert' ? 'his_breath_2' : 'his_breath_1', 0.9),
      caught: () => this.catch(),
      backstage: (on) => this.backstage(on),
      creak: (x, z) => this.bank?.play(this.rand() < 0.5 ? 'creak_2' : 'creak_3', { at: [x, 2.72, z], gain: 0.55, send: 0.5, occlude: false }),
      drop: (phase, why) => this.dropped(phase, why),
      dust: () => this.sys('nest')?.dust?.(3),
      openDoor: (door) => this.openDoor(door),
      openWardrobe: () => this.openWardrobe(),
      tapOff: (x, z) => this.tapOff(x, z),
    } });
    this.rand = rng(story.seed >>> 0);
  }

  sys(name) { return this.systems[name] ?? this.story?.sys?.[name] ?? null; }

  // The hunt begins (story.js huntStart). from 'fusebox': his light comes on by the fuse box, or at the far end of the
  // open-plan room when the player is near it; `tutorial`: the first encounter (stalker.js TUTORIAL). from 'hatch': the
  // player began turning the front door's lock: he comes down through the wardrobe's hatch and makes for the door, no
  // tutorial (a race the player wins by holding E: story.js updateUnlock).
  start({ tutorial = true, from = 'fusebox' } = {}) {
    const p = this.player.pos;
    this.prepare();
    this.stalker.begin({ from, tutorial: tutorial && from !== 'hatch', player: { x: p.x, z: p.z }, at: [FUSEBOX[0], FUSEBOX[1] - 0.3] });
    this.active = true;
    this.music?.hunt(true);
  }

  // After the player wakes from being caught (story.js wake: on the sofa): he patrols from the bedroom door, in sight, and
  // cannot catch anyone for 8 s (stalker.js RESPAWN). If the player is then put elsewhere before the first update (a
  // checkpoint), that update places him again.
  respawn() {
    const p = this.player.pos;
    this.prepare();
    this.stalker.respawn({ x: p.x, z: p.z });
    this.respawnedFor = { x: p.x, z: p.z };
    this.active = true;
    this.music?.hunt(true);
  }

  // What every start and respawn shares: the difficulty, the doors he can open, a clean slate.
  prepare() {
    this.stalker.setDifficulty(this.difficulty());
    this.nav.setDoors?.(this.sys('doors')?.doors ?? []);
    this.time = 0; this.torchHeld = 0; this.prev = null; this.stepDist = 0; this.breathTimer = 0; this.respawnedFor = null;
    this.knife(0);
  }

  // The police are at the door: he goes up into the void for good.
  flee() {
    this.active = false;
    this.stalker.set('off');
    this.knife(0);
    this.intruder.setTorch(false);
    this.intruder.show(false);
    this.bank?.play('creak_long', { at: [9.6, 2.72, -0.1], gain: 0.5, occlude: false });
    this.music?.hunt(false);
  }

  // A noise for his ears at (x, z): kind is one of NOISE's, a step ('crouch', 'walk', 'run') or 'loud'.
  noise(x, z, kind) {
    if (!this.active) return;
    const hear = this.stalker.tune.hear;
    const radius = NOISE[kind] ?? (kind === 'loud' ? hear.loud : hear[kind] ?? 0);
    this.stalker.noise(x, z, radius, kind);
  }

  update(dt) {
    if (!this.active) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.time += dt;
    const p = this.player, s = this.stalker, fl = this.flashlight;
    // Respawned before a checkpoint moved the player: placed again for where they are now.
    if (this.respawnedFor) {
      if (Math.hypot(p.pos.x - this.respawnedFor.x, p.pos.z - this.respawnedFor.z) > 0.5) s.respawn({ x: p.pos.x, z: p.pos.z });
      this.respawnedFor = null;
    }
    // How long the torch has been on, counted only from the first encounter's hint (story.js: "Torch off. Get down.").
    const torch = !!(fl?.held && fl.on);
    this.torchHeld = torch && this.time >= TUTORIAL.hint ? this.torchHeld + dt : 0;
    const prev = this.prev || { x: p.pos.x, z: p.pos.z };
    let vx = (p.pos.x - prev.x) / Math.max(dt, 1e-3), vz = (p.pos.z - prev.z) / Math.max(dt, 1e-3);
    if (Math.hypot(vx, vz) > 5) vx = vz = 0;                  // a jump (waking, a checkpoint), not a run
    this.prev = { x: p.pos.x, z: p.pos.z };
    const moving = Math.hypot(vx, vz) > 0.15;
    s.update(dt, { x: p.pos.x, z: p.pos.z, crouched: p.isCrouched, running: !!p.running && moving, torch, torchHeld: this.torchHeld, moving, vx, vz,
      inWardrobe: this.inWardrobe(p.pos) });
    if (!this.active) return;                                 // caught this frame (catch)
    this.body(dt);
    this.sounds(dt);
  }

  // Standing in the wardrobe's right half (zones.js), or pressed into its open doorway (the walk grid keeps a body out of
  // the cabinet itself).
  inWardrobe(pos) {
    if (inWardrobe(pos.x, pos.z)) return true;
    const right = this.sys('closets')?.doors?.find(d => d.id === 'right');
    return !!right && right.angle > 0.5 && pos.x < 10.3 && pos.z > -0.5 && pos.z < 0.25;
  }

  body(dt) {
    const s = this.stalker, man = this.intruder;
    if (s.state === 'backstage' || s.state === 'off') { if (man.visible) man.show(false); this.knife(0); return; }
    if (!man.visible) man.show(true);
    const floor = this.walk.floorAt(s.x, s.z) ?? 0.16;
    man.place(s.x, s.z, s.yaw, floor + (s.lift || 0));
    man.torchYaw = s.torchYaw;
    // The knife comes up into his light (the light lifts to it), else down the way he goes; level when he stops to look.
    man.torchPitch = s.knife > 0 ? -4 : s.state === 'search' || s.state === 'alert' ? -8 : -14;
    if (s.torch !== man.torchOn) man.setTorch(s.torch);
    this.knife(s.knife);
    const v = s.speed, d = s.drop;
    // Down through the hatch: crouched as he drops, then the crouch's rise (its 1.0-2.2 s) over by the time he is up.
    if (s.state === 'drop' && (!d?.landed || d.t < DROP.fall + s.riseTime(d.then))) {
      if (!d?.landed) this.clip('crouch_idle', { blend: 0 });
      else this.clip('crouch_out', { blend: 0.15, speed: 2.2 / s.riseTime(d.then) });
      return;
    }
    if (s.door) { this.clip('try_door_inwards', { blend: 0.3 }); return; }        // at the bathroom door, pushing it open
    if (v < 0.08) this.clip(s.state === 'search' || s.state === 'patrol' ? 'idle_look_around_01' : 'idle_breathe_01', { speed: 1 });
    else this.gait(v);
  }

  // A walk or run matched to his speed (feet planted).
  gait(v) {
    if (v < 1.25) this.clip('walk_slow_01', { speed: v / STRIDE.walk_slow_01 });
    else if (v < 2.1) this.clip('walk_neutral_01', { speed: v / STRIDE.walk_neutral_01 });
    else this.clip('run_neutral_01', { speed: v / STRIDE.run_neutral_01 });
  }

  // Play a clip his body has (a reworked body may lack one), else his idle.
  clip(name, opts) {
    const man = this.intruder, has = (n) => !man.clips || !!man.clips[n];
    const use = has(name) ? name : has('idle_breathe_01') ? 'idle_breathe_01' : null;
    if (use) man.play(use, use === name ? opts : { speed: 1 });
  }

  // How far the knife is raised into his light (0..1): each frame of the windup before a strike, 0 otherwise.
  knife(k) {
    const man = this.intruder;
    if (man.raiseKnife) man.raiseKnife(k);
    else man.knifePose?.(k, 0);
  }

  sounds(dt) {
    const s = this.stalker;
    if (s.state === 'backstage' || s.state === 'off' || !this.bank) return;
    // A footstep every stride's length of ground covered: bare feet on wood (his prints are bare), heavier running.
    this.stepDist += s.speed * dt;
    const stride = s.speed > 2.1 ? 1.05 : 0.72;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      const running = s.speed > 2.1;
      this.bank.play('step_floor', { at: [s.x, 0.2, s.z], gain: running ? 0.85 : 0.5,
        rate: running ? [0.85, 0.95] : [0.88, 1.0], ref: 1.2, rolloff: 1.1, send: 0.3 });
    }
    // Breathing when he is close (within 5 m), louder in a chase or an ambush.
    this.breathTimer -= dt;
    const p = this.player.pos, near = Math.hypot(s.x - p.x, s.z - p.z) < 5;
    if (this.breathTimer <= 0 && near) {
      this.breathTimer = s.state === 'chase' ? 1.6 : 3 + this.rand() * 2;
      this.breath(this.rand() < 0.5 ? 'his_breath_1' : 'his_breath_2', s.state === 'chase' ? 0.8 : s.state === 'ambush' ? 0.55 : 0.4);
    }
    this.music?.danger(Math.max(0, 1 - Math.hypot(s.x - p.x, s.z - p.z) / 9), s.state);
  }

  breath(key, gain) {
    const s = this.stalker;
    this.bank?.play(key, { at: [s.x, 1.6, s.z], gain, ref: 0.6, rolloff: 1.6, send: 0.2 });
  }

  onState(now, prev) {
    if (now === 'chase') this.music?.sting('chase');
    if (now === 'ambush') this.intruder.setTorch(false);
  }

  // Up into the void through the wardrobe (coming down is the drop, below).
  backstage(on) {
    if (on) { this.bank?.play('wardrobe_creak', { segment: 'random', at: [9.75, 1.3, -0.1], gain: 0.5 }); this.sys('nest')?.dust?.(3); }
  }

  // Down through the hatch: the wardrobe creaks, the hangers on the rail rattle and dust falls as his legs come through;
  // then a heavy landing (a scare when it is onto the player in the wardrobe; heard across the flat when he comes for the
  // front door).
  dropped(phase, why) {
    const bank = this.bank, loud = why === 'trap', far = why === 'rush';
    if (phase === 'start') {
      bank?.play('wardrobe_creak', { segment: 'random', at: [9.75, 1.6, -0.1], gain: loud ? 0.9 : 0.7, min: far ? 0.15 : 0 });
      bank?.play('hangers', { at: HATCH, gain: loud ? 0.8 : 0.5, delay: 0.1, min: far ? 0.1 : 0 });
      this.sys('nest')?.dust?.(3);
    } else if (phase === 'land') {
      const thump = { at: [HATCH[0], 0.3, HATCH[2]], gain: 1, rate: 0.62, send: 0.4, min: far ? 0.3 : 0.2 };
      if (loud && bank?.scare) bank.scare('door_kick', thump); else bank?.play('door_kick', thump);
      bank?.play('step_floor', { at: [HATCH[0], 0.2, HATCH[2]], gain: 0.8, delay: 0.08 });
      if (loud) this.music?.sting('scare');
    }
  }

  // The bathroom door in his way: he swings it open, its latch and creak (doors.js open() if it has one; else asked as
  // the player's E asks it, the push and the sound).
  openDoor(door) {
    if (!door || door.locked) return;
    const doors = this.sys('doors');
    if (doors?.open) { doors.open(door); return; }
    if (!doors || (door.openRequested && door.target === door.open)) return;
    // Shut, or left ajar by the story (asked open to 14 degrees only): asked fully open now.
    door.openRequested = true; door.target = door.open; door.vel = (door.vel || 0) + door.open * 0.25; door.moving = true;
    door.blocked = false; door.touching = false; door.pushMemo = {};
    doors.sounds?.door?.(true, door.handle);
  }

  // The wardrobe's right door (the hatch's half) swung open from inside as he comes down, or as he goes up.
  openWardrobe() {
    const closets = this.sys('closets'), right = closets?.doors?.find(d => d.id === 'right');
    if (!right || right.angle > 0.6) return;
    if (closets.open) { closets.open(right); return; }
    right.openRequested = true; right.target = 1; right.touching = false; right.pushMemo = {};
    if (closets.moving && !closets.moving.includes(right)) closets.moving.push(right);
    closets.sounds?.wardrobe?.(true, [9.725, 1.3, right.handlePoint?.z ?? -0.47]);
  }

  // A tap left running, reached: he turns it off (taps.js).
  tapOff(x, z) {
    const taps = this.sys('taps');
    if (!taps?.taps) return;
    let best = null, bestD = 1.5;
    for (const [id, t] of taps.taps) { const d = Math.hypot(t.def.spout[0] - x, t.def.spout[2] - z); if (t.on && d < bestD) { best = id; bestD = d; } }
    if (best) taps.set(best, false, { by: 'him' });
  }

  catch() {
    this.active = false;
    this.knife(1);
    this.music?.hunt(false);
    this.story.caught();
  }
}

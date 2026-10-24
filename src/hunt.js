// Act IV (docs/STORY.md): the intruder's mind (stalker.js) driving his body (intruder.js). Each frame: what the player
// is doing goes in (where, crouched, running, torch, moving), his decisions come out as a place on the floor, a heading,
// a walk or run matched to his speed (so his feet do not slide), his phone light, his footsteps (heard the way round,
// through doorways: sound.js), his breathing when he is close, creaks crossing the ceiling while he is up in the void.
import { Stalker, rng } from './stalker.js';
import { FUSEBOX } from './story.js';

const STRIDE = { walk_slow_01: 0.92, walk_neutral_01: 1.32, run_neutral_01: 3.1 };

export class Hunt {
  constructor({ app, intruder, nav, walk, player, camera, flashlight, bank, story, music, difficulty = () => 'normal' }) {
    Object.assign(this, { app, intruder, nav, walk, player, camera, flashlight, bank, story, music, difficulty });
    this.active = false;
    this.torchHeld = 0;
    this.stepDist = 0; this.breathTimer = 0;
    this.stalker = new Stalker({ nav, difficulty: difficulty(), random: rng((story.seed ^ 0x5eed) >>> 0), hooks: {
      state: (now, prev) => this.onState(now, prev),
      breath: (kind) => this.breath(kind === 'alert' ? 'his_breath_2' : 'his_breath_1', 0.9),
      caught: () => this.catch(),
      backstage: (on) => this.backstage(on),
      creak: (x, z) => this.bank?.play(this.rand() < 0.5 ? 'creak_2' : 'creak_3', { at: [x, 2.72, z], gain: 0.55, send: 0.5, occlude: false }),
      lostLight: () => {},
    } });
    this.rand = rng(story.seed >>> 0);
  }

  // The hunt begins at the fuse box (his light comes on there); `tutorial`: 25 s in which he only notices a torch held
  // on for a while, or running.
  start({ tutorial = true } = {}) {
    const s = this.stalker;
    s.setDifficulty(this.difficulty());
    s.spawn(FUSEBOX[0], FUSEBOX[1] - 0.3, -90, 'patrol');
    s.tutorial = tutorial ? 25 : 0;
    s.grace = 3;
    this.active = true;
    this.intruder.show(true);
    this.intruder.setTorch(true);
    this.music?.hunt(true);
  }

  // After the player wakes from being caught: he is up in the void (heard above), 20 s before he can catch anyone.
  respawn() {
    const s = this.stalker;
    s.setDifficulty(this.difficulty());
    s.spawn(9.95, -0.1, 90, 'backstage');
    s.grace = 20; s.tutorial = 0; s.suspicion = 0;
    this.active = true;
    this.intruder.show(false);
    this.music?.hunt(true);
  }

  // The police are at the door: he goes up into the void for good.
  flee() {
    this.active = false;
    this.stalker.set('off');
    this.intruder.setTorch(false);
    this.intruder.show(false);
    this.bank?.play('creak_long', { at: [9.6, 2.72, -0.1], gain: 0.5, occlude: false });
    this.music?.hunt(false);
  }

  noise(x, z, kind) {
    if (!this.active) return;
    const hear = this.stalker.tune.hear;
    const radius = kind === 'glass' ? 5 : kind === 'loud' ? hear.loud : kind === 'phone' ? 12 : hear[kind] ?? 0;
    this.stalker.noise(x, z, radius);
  }

  update(dt) {
    if (!this.active) return;
    const p = this.player, s = this.stalker, fl = this.flashlight;
    this.torchHeld = fl?.held && fl.on ? this.torchHeld + dt : 0;
    const prev = this.prev || { x: p.pos.x, z: p.pos.z };
    const vx = (p.pos.x - prev.x) / Math.max(dt, 1e-3), vz = (p.pos.z - prev.z) / Math.max(dt, 1e-3);
    this.prev = { x: p.pos.x, z: p.pos.z };
    const moving = Math.hypot(vx, vz) > 0.15;
    s.update(dt, { x: p.pos.x, z: p.pos.z, crouched: p.isCrouched, running: !!p.running && moving, torch: !!(fl?.held && fl.on),
      torchHeld: this.torchHeld, moving, vx, vz });
    this.body(dt);
    this.sounds(dt);
  }

  body(dt) {
    const s = this.stalker, man = this.intruder;
    if (s.state === 'backstage' || s.state === 'off') { if (man.visible) man.show(false); return; }
    if (!man.visible) man.show(true);
    const floor = this.walk.floorAt(s.x, s.z) ?? 0.16;
    man.place(s.x, s.z, s.yaw, floor);
    man.torchYaw = s.torchYaw;
    man.torchPitch = s.state === 'search' || s.state === 'alert' ? -8 : -14;
    if (s.torch !== man.torchOn) man.setTorch(s.torch);
    const v = s.speed;
    if (v < 0.08) man.play(s.state === 'search' || s.state === 'patrol' ? 'idle_look_around_01' : 'idle_breathe_01', { speed: 1 });
    else if (v < 1.25) man.play('walk_slow_01', { speed: v / STRIDE.walk_slow_01 });
    else if (v < 2.1) man.play('walk_neutral_01', { speed: v / STRIDE.walk_neutral_01 });
    else man.play('run_neutral_01', { speed: v / STRIDE.run_neutral_01 });
  }

  sounds(dt) {
    const s = this.stalker;
    if (s.state === 'backstage' || s.state === 'off' || !this.bank) return;
    // A footstep every stride's length of ground covered: shoes on wood, heavier running.
    this.stepDist += s.speed * dt;
    const stride = s.speed > 2.1 ? 1.05 : 0.72;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      const running = s.speed > 2.1;
      this.bank.play(running ? 'steps_boots' : 'steps_shoes', { segment: 'random', at: [s.x, 0.2, s.z], gain: running ? 0.85 : 0.55,
        rate: [0.92, 1.04], ref: 1.2, rolloff: 1.1, send: 0.3 });
    }
    // Breathing when he is close (within 4 m of open space), louder in a chase or an ambush.
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

  backstage(on) {
    if (on) this.bank?.play('wardrobe_creak', { segment: 'random', at: [9.75, 1.3, -0.1], gain: 0.5 });
    else { this.bank?.play('wardrobe_creak', { segment: 'random', at: [9.75, 1.3, -0.1], gain: 0.7 }); this.bank?.play('step_floor', { at: [9.9, 0.2, -0.1], gain: 0.8, delay: 0.4 }); }
  }

  catch() {
    this.active = false;
    this.music?.hunt(false);
    this.story.caught();
  }
}

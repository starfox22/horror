// Caught (docs/STORY.md Act IV): the view is wrenched round to him in a quarter of a second, his phone light full in the
// face, his breath, the sting; black. Then the bedroom: you jerk awake in bed, gasping, the bedside clock glowing 03:07
// for a second in a flat with no power; under eight seconds in all, any key skips the wake. The hunt then resumes
// (story.js wake) with the player's progress intact.
import { Vec3 } from 'playcanvas';

const WAKE_FROM = { pos: [13.23, 1.105, 1.02], rot: [67, 90, -3.5] };     // lying in bed, looking at the ceiling
const WAKE_TO = { pos: [12.85, 1.8, 1.8], rot: [-2, 112, 0] };           // standing at the bedside (WAKE_EXIT)

export class Death {
  constructor({ app, camera, player, intruder, bank, music, veil, clock, onSkipKey = () => {} }) {
    Object.assign(this, { app, camera, player, intruder, bank, music, veil, clock });
    this.running = null;
    app.on('update', dt => this.update(dt));
    window.addEventListener('keydown', (e) => { if (this.running?.wake && this.running.t > 0.8 && !e.repeat) this.running.t = Math.max(this.running.t, this.running.wakeEnd - 0.35); });
  }

  // He has the player: the grab, then black; done() after the black.
  play(done) {
    const cam = this.camera, man = this.intruder, p = this.player;
    p.active = false; p.keys.clear(); p.vel.set(0, 0, 0);
    const eye = cam.getPosition().clone();
    const toHim = new Vec3(man.pos.x - eye.x, 0, man.pos.z - eye.z);
    const yaw = Math.atan2(-toHim.x, -toHim.z) * 180 / Math.PI;
    // Put him right in front, face to face, his light in your eyes.
    const d = Math.max(0.55, Math.min(0.75, toHim.length()));
    toHim.normalize();
    man.show(true);
    man.place(eye.x + toHim.x * d, eye.z + toHim.z * d, Math.atan2(-toHim.x, -toHim.z) * 180 / Math.PI, man.pos.y);
    man.torchYaw = null; man.torchPitch = 8; man.setTorch(true, 4.5);
    man.play('idle_breathe_01', { blend: 0.05 });
    this.bank?.play('his_breath_2', { gain: 1, bus: 'sfx' });
    this.music?.sting('scare');
    this.bank?.play('door_kick', { gain: 0.6, delay: 0.32 });
    this.running = { t: 0, from: { yaw: p.yaw, pitch: p.pitch }, to: { yaw, pitch: 6 }, done, grab: true };
  }

  // The wake: lying in bed, eyes opening, sitting up to the bedside (3 s). done() when standing.
  wakeUp(done) {
    this.intruder.show(false); this.intruder.setTorch(false);
    this.running = { t: 0, wake: true, wakeEnd: 3.2, done };
    this.bank?.play('gasp', { gain: 0.9, delay: 0.25 });
    this.bank?.play('bed_move', { gain: 0.6, delay: 0.4 });
    this.clock?.flash(1.2);
  }

  update(dt) {
    const r = this.running;
    if (!r) return;
    r.t += Math.min(dt, 0.05);
    const cam = this.camera, p = this.player;
    if (r.grab) {
      const k = Math.min(1, r.t / 0.25), e = 1 - (1 - k) ** 3;
      p.yaw = r.from.yaw + wrap(r.to.yaw - r.from.yaw) * e; p.pitch = r.from.pitch + (r.to.pitch - r.from.pitch) * e;
      p.apply(0);
      if (r.t > 0.62) this.veil.style.opacity = '1';
      if (r.t > 1.7) { this.running = null; r.done?.(); }
      return;
    }
    if (r.wake) {
      const k = Math.min(1, r.t / r.wakeEnd), e = k * k * (3 - 2 * k);
      const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
      const pos = lerp(WAKE_FROM.pos, WAKE_TO.pos), rot = lerp(WAKE_FROM.rot, WAKE_TO.rot);
      cam.setPosition(...pos); cam.setEulerAngles(...rot);
      this.veil.style.opacity = String(Math.max(0, 1 - r.t / 0.9) * 0.95 + (r.t < 1.6 ? 0.88 * Math.exp(-(((r.t - 1.25) / 0.12) ** 2)) : 0));
      if (r.t >= r.wakeEnd) {
        this.veil.style.opacity = '0';
        p.pos.set(WAKE_TO.pos[0], 0, WAKE_TO.pos[2]); p.yaw = WAKE_TO.rot[1]; p.pitch = WAKE_TO.rot[0];
        p.floor = p.grid.floorUnder(p.pos.x, p.pos.z, 0.22); p.eyeY = p.floor + 1.62; p.crouched = false;
        p.vel.set(0, 0, 0); p.apply(0);
        p.active = document.pointerLockElement === this.app.graphicsDevice.canvas;
        this.running = null; r.done?.();
      }
    }
  }

  get busy() { return !!this.running; }
}

const wrap = (a) => ((a + 180) % 360 + 360) % 360 - 180;

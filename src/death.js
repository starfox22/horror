// Caught (docs/STORY.md Act IV). Contact to black in under three seconds:
//   0.00  the view is wrenched round to him in a tenth of a second; his phone light comes up under the white mask; a
//         full-level sting with every bed ducked under it (sound.js scare path)
//   0.12  the knife goes up into his light (intruder.knifePose)
//   0.45  it comes down: the camera kicks, a red flash (a fade instead with reduced flashes), blood on the lens
//   0.60  the fall: the view drops to the floor and rolls; a body's thud and a bounce; colour drains, two heartbeats
//   1.30  on the floor, sideways: he steps over you and looks down. Still. One breath
//   2.30  black, and silence
// Then you wake on the sofa, gasping (story.js wake: "...A dream?"). Repeat deaths are shorter: the floor holds for
// 0.4 s, the wake takes 1.4 s; any key skips the wake once it has begun. Everything on screen is page overlays and a
// CSS filter on the canvas, so no shader is ever built for it.
import { Vec3 } from 'playcanvas';

// Lying on the sofa (head on the north arm, looking up), then standing beside it facing into the room. Measured: the seat
// is at 0.57 m along the west window wall (x -6.14..-5.54, z 1.08..3.28); the floor there is 0.24; (-5.12, 2.0) is free.
const WAKE_FROM = { pos: [-5.86, 0.84, 1.42], rot: [64, 180, 4] };
const WAKE_TO = { pos: [-5.12, 1.86, 2.0], rot: [-3, -90, 0] };
const BLOOD_URL = './assets/fx/blood.webp';

export class Death {
  constructor({ app, camera, player, intruder, bank, music, veil, walk = null, doc = document }) {
    Object.assign(this, { app, camera, player, intruder, bank, music, veil, walk });
    this.running = null;
    this.count = 0;
    this.reducedFlashes = false;
    // Overlays over the canvas, under the black veil (style.css #fade is z-index 12).
    const layer = (id, css) => { const e = doc.createElement('div'); e.id = id; e.style.cssText = `position:fixed;inset:0;pointer-events:none;opacity:0;${css}`; doc.body.appendChild(e); return e; };
    this.flash = layer('death-flash', 'z-index:11;background:#7a0000;mix-blend-mode:multiply;');
    this.blood = layer('death-blood', `z-index:11;background:url(${BLOOD_URL}) center/cover no-repeat;` +
      '-webkit-mask-image:radial-gradient(ellipse at 50% 46%, transparent 18%, #000 72%);mask-image:radial-gradient(ellipse at 50% 46%, transparent 18%, #000 72%);');
    this.dark = layer('death-dark', 'z-index:11;background:radial-gradient(ellipse at 50% 50%, transparent 30%, #000 100%);');
    if (typeof Image !== 'undefined') { this.bloodImage = new Image(); this.bloodImage.src = BLOOD_URL; }   // decoded before it is needed
    this.canvas = app.graphicsDevice?.canvas ?? null;
    app.on('update', dt => this.update(dt));
    doc.defaultView?.addEventListener?.('keydown', (e) => {
      const r = this.running;
      if (r?.wake && r.t > 0.5 && !e.repeat) r.t = Math.max(r.t, r.wakeEnd - 0.35);
    });
  }

  key(name, fallback) { return this.bank?.has?.(name) ? name : fallback; }
  scare(key, opts) { return this.bank?.scare ? this.bank.scare(key, opts) : this.bank?.play(key, opts); }

  // He has the player: the knife, the fall; done() after the black.
  play(done) {
    const cam = this.camera, man = this.intruder, p = this.player;
    this.count++;
    p.active = false; p.keys?.clear?.(); p.vel?.set?.(0, 0, 0);
    const eye = cam.getPosition().clone();
    const toHim = new Vec3(man.pos.x - eye.x, 0, man.pos.z - eye.z);
    if (toHim.length() < 1e-3) toHim.set(0, 0, -1);
    const d = Math.max(0.55, Math.min(0.72, toHim.length()));
    toHim.normalize();
    const yaw = Math.atan2(-toHim.x, -toHim.z) * 180 / Math.PI;
    // Face to face, his light under his chin: the white mask lit from below is the first thing you see.
    man.show(true);
    man.place(eye.x + toHim.x * d, eye.z + toHim.z * d, Math.atan2(-toHim.x, -toHim.z) * 180 / Math.PI, man.pos.y);
    man.torchYaw = null; man.torchPitch = 8; man.torchUnder = true; man.setTorch(true, 3.2);
    man.headPitch = 12;
    man.play('idle_breathe_01', { blend: 0.05 });
    // Where you fall: backwards, away from him, if the floor there is free; straight down otherwise.
    const back = new Vec3(eye.x - toHim.x * 0.45, 0, eye.z - toHim.z * 0.45);
    const free = !this.walk || this.walk.fits?.(back.x, back.z, 0.12, this.walk.floorUnder?.(back.x, back.z, 0.12) ?? 0.17);
    const floor = this.walk?.floorUnder?.(eye.x, eye.z, 0.12) ?? Math.max(0.16, eye.y - 1.62);
    const repeat = this.count > 1;
    this.running = {
      t: 0, grab: true, done, repeat, eye, toHim, yaw, from: { yaw: p.yaw, pitch: p.pitch },
      fallTo: free ? back : eye.clone(), floor, roll: (Math.random() < 0.5 ? -1 : 1) * (68 + Math.random() * 10),
      floorHold: repeat ? 0.4 : 1.0, cues: new Set(),
    };
    this.scare(['sting_scare', 'sting_braam', 'sting_riser'][(this.count - 1) % 3] || 'sting_scare', { gain: 1 });
    this.bank?.play('his_breath_2', { gain: 1, bus: 'sfx' });
  }

  cue(r, name, at, fn) { if (r.t >= at && !r.cues.has(name)) { r.cues.add(name); fn(); } }

  // The wake on the sofa: eyes opening, sitting up, standing beside it (3.2 s; 1.4 s after the first). done() standing.
  wakeUp(done) {
    const man = this.intruder;
    man.torchUnder = false; man.headPitch = 0; man.knifePose?.(0, 0); man.show(false); man.setTorch(false);
    const repeat = this.count > 1;
    this.running = { t: 0, wake: true, wakeEnd: repeat ? 1.4 : 3.2, done };
    this.blood.style.opacity = '0'; this.dark.style.opacity = '0'; this.flash.style.opacity = '0';
    if (this.canvas) this.canvas.style.filter = '';
    this.bank?.play('gasp', { gain: 0.9, delay: 0.2 });
    this.bank?.play('blanket', { gain: 0.5, delay: 0.45 });
  }

  update(dt) {
    const r = this.running;
    if (!r) return;
    r.t += Math.min(dt, 0.05);
    const cam = this.camera, p = this.player, man = this.intruder;
    if (r.grab) {
      const ease = (k) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
      // 0-0.12: snap round to him; the knife up into his light until 0.45; down in 0.12 s.
      if (r.t < 0.6) {
        const e = ease(r.t / 0.12);
        p.yaw = r.from.yaw + wrap(r.yaw - r.from.yaw) * e; p.pitch = r.from.pitch + (6 - r.from.pitch) * e;
        p.apply?.(0);
        man.knifePose?.(Math.min(1, Math.max(0, (r.t - 0.12) / 0.33)), Math.min(1, Math.max(0, (r.t - 0.45) / 0.12)));
      }
      this.cue(r, 'stab', 0.47, () => {
        this.bank?.play(this.key('knife_stab', 'door_kick'), { gain: 1, rate: this.bank?.has?.('knife_stab') ? 1 : 1.7 });
        this.bank?.play('gasp', { gain: 0.8, rate: 0.82, delay: 0.05 });
        if (this.reducedFlashes) { this.blood.style.transition = 'opacity .35s'; }
        else { this.flash.style.transition = 'none'; this.flash.style.opacity = '0.6'; setTimeout(() => { this.flash.style.transition = 'opacity .25s'; this.flash.style.opacity = '0'; }, 70); this.blood.style.transition = 'opacity .06s'; }
        this.blood.style.opacity = '0.92';
        this.blood.style.transform = this.count % 2 ? 'scaleX(-1)' : '';
      });
      // The fall: from the eye down to the floor, accelerating, rolling onto one side, the view turning up to him.
      if (r.t >= 0.45) {
        const k = Math.min(1, (r.t - 0.6) / 0.65), fall = k <= 0 ? 0 : k * k;
        const kick = r.t < 0.6 ? Math.sin(Math.min(1, (r.t - 0.45) / 0.15) * Math.PI) : 0;
        const bounce = r.t > 1.25 && r.t < 1.45 ? Math.sin((r.t - 1.25) / 0.2 * Math.PI) * 0.025 : 0;
        const x = r.eye.x + (r.fallTo.x - r.eye.x) * fall - r.toHim.x * kick * 0.04;
        const z = r.eye.z + (r.fallTo.z - r.eye.z) * fall - r.toHim.z * kick * 0.04;
        const y = r.eye.y + (r.floor + 0.2 - r.eye.y) * fall + bounce;
        const pitch = 6 - kick * 8 + fall * 30, roll = r.roll * Math.min(1, Math.max(0, (r.t - 0.62) / 0.6)) ** 1.5;
        cam.setPosition(x, y, z);
        cam.setEulerAngles(pitch, r.yaw + fall * 8, roll);
        if (this.canvas) this.canvas.style.filter = `saturate(${(1 - 0.7 * fall).toFixed(3)}) brightness(${(1 - 0.25 * fall).toFixed(3)})`;
        this.dark.style.opacity = String((0.65 * fall).toFixed(3));
      }
      this.cue(r, 'thud', 1.22, () => {
        this.bank?.play(this.key('body_fall', 'door_kick'), { gain: 0.95, rate: this.bank?.has?.('body_fall') ? 1 : 0.6 });
        this.bank?.play('heartbeat', { gain: 0.9, delay: 0.15 });
        this.bank?.play('heartbeat', { gain: 0.7, delay: 1.25 });
        this.bank?.play('tinnitus', { gain: 0.18 });
      });
      // On the floor: he steps over you and looks down.
      this.cue(r, 'over', 1.3, () => {
        const over = 0.42;
        man.place(r.fallTo.x + r.toHim.x * over, r.fallTo.z + r.toHim.z * over, man.yaw, man.pos.y);
        man.headPitch = 34; man.knifePose?.(0.25, 0);
        this.bank?.play('his_breath_1', { gain: 0.8 });
      });
      const black = 1.3 + r.floorHold;
      this.cue(r, 'black', black, () => { this.veil.style.transition = 'opacity .4s'; this.veil.style.opacity = '1'; this.music?.stopAll?.(0.4); this.bank?.silence?.(0.4); });
      if (r.t > black + 0.95) {
        this.running = null;
        if (this.canvas) this.canvas.style.filter = '';
        r.done?.();
      }
      return;
    }
    if (r.wake) {
      const k = Math.min(1, r.t / r.wakeEnd), e = k * k * (3 - 2 * k);
      const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
      cam.setPosition(...lerp(WAKE_FROM.pos, WAKE_TO.pos)); cam.setEulerAngles(...lerp(WAKE_FROM.rot, WAKE_TO.rot));
      this.veil.style.transition = 'none';
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
export { WAKE_FROM, WAKE_TO };

// First-person walker: pointer-lock mouse look, WASD/arrows, Shift to walk faster, subtle head bob (B toggles).
// Moves on the WalkGrid (no physics engine): each axis is tried separately so walls slide instead of stopping you.
import { Vec3, math } from 'playcanvas';

const EYE = 1.62;          // eye height above the floor, metres
const RADIUS = 0.22;       // body radius, metres
const WALK = 1.35, FAST = 2.4;   // m/s; a slow, deliberate pace suits the mood
const ACCEL = 9;           // how quickly speed follows input (1/s)
const LOOK = 0.11;         // degrees per mouse pixel

export class Player {
  constructor(app, camera, grid, spawn) {
    this.app = app;
    this.camera = camera;
    this.grid = grid;
    this.pos = new Vec3(spawn.x, 0, spawn.z);
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.vel = new Vec3();
    this.floor = grid.floorUnder(spawn.x, spawn.z, RADIUS);
    this.eyeY = this.floor + EYE;
    this.bobPhase = 0;
    this.bobOn = true;
    this.active = false;
    this.keys = new Set();
    this.onStep = null;    // (surface, speed) => void, called on each footfall

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyB') this.bobOn = !this.bobOn;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== app.graphicsDevice.canvas) return;
      this.yaw -= e.movementX * LOOK;
      this.pitch = math.clamp(this.pitch - e.movementY * LOOK, -85, 85);
    });
    this.apply(0);
  }

  held(...codes) { return codes.some(c => this.keys.has(c)); }

  update(dt) {
    dt = Math.min(dt, 0.05);
    let fx = 0, fz = 0;
    if (this.active) {
      const f = (this.held('KeyW', 'ArrowUp') ? 1 : 0) - (this.held('KeyS', 'ArrowDown') ? 1 : 0);
      const s = (this.held('KeyD', 'ArrowRight') ? 1 : 0) - (this.held('KeyA', 'ArrowLeft') ? 1 : 0);
      const r = this.yaw * math.DEG_TO_RAD;
      // Camera forward is -Z rotated by yaw about Y.
      fx = -Math.sin(r) * f + Math.cos(r) * s;
      fz = -Math.cos(r) * f - Math.sin(r) * s;
      const len = Math.hypot(fx, fz);
      if (len > 0) { const speed = this.held('ShiftLeft', 'ShiftRight') ? FAST : WALK; fx = fx / len * speed; fz = fz / len * speed; }
    }
    const k = 1 - Math.exp(-ACCEL * dt);
    this.vel.x += (fx - this.vel.x) * k;
    this.vel.z += (fz - this.vel.z) * k;

    const g = this.grid;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (g.fits(nx, this.pos.z, RADIUS, this.floor)) this.pos.x = nx; else this.vel.x = 0;
    if (g.fits(this.pos.x, nz, RADIUS, this.floor)) this.pos.z = nz; else this.vel.z = 0;
    this.floor = g.floorUnder(this.pos.x, this.pos.z, RADIUS);

    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.15) {
      const before = Math.floor(this.bobPhase / Math.PI);
      this.bobPhase += dt * speed * 4.6;   // ~1.75 steps per second at walking pace
      if (Math.floor(this.bobPhase / Math.PI) !== before && this.onStep) this.onStep(this.surface(), speed);
    } else {
      this.bobPhase += (Math.round(this.bobPhase / Math.PI) * Math.PI - this.bobPhase) * k;
    }
    this.apply(dt);
  }

  // Floor finish under the player: the living area's stone sits higher (0.23 m) than the wood floors.
  surface() { return this.floor > 0.21 ? 'stone' : 'wood'; }

  apply(dt) {
    const target = this.floor + EYE;
    this.eyeY += (target - this.eyeY) * (dt ? 1 - Math.exp(-12 * dt) : 1);
    const amp = this.bobOn ? Math.min(1, Math.hypot(this.vel.x, this.vel.z) / WALK) : 0;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.022 * amp;
    const sway = Math.sin(this.bobPhase) * 0.012 * amp;
    const r = this.yaw * math.DEG_TO_RAD;
    this.camera.setPosition(this.pos.x + Math.cos(r) * sway, this.eyeY + bobY - 0.01 * amp, this.pos.z - Math.sin(r) * sway);
    this.camera.setEulerAngles(this.pitch, this.yaw, Math.sin(this.bobPhase) * 0.25 * amp);
  }
}

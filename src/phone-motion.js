// Camera-space secondary motion, in metres/degrees. Play time alone drives it:
// the hand freezes in pause/read overlays and never catches up a wall-clock sine.
const follow = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const clamp = (value, max) => Math.max(-max, Math.min(max, value));
const difference = (a, b) => ((a - b + 540) % 360) - 180;

export class PhoneMotion {
  constructor() {
    this.time = 0; this.watch = 0; this.x = 0; this.y = 0; this.roll = 0; this.speed = 0;
    this.look = null;
  }

  update(dt, { watch = false, yaw = 0, pitch = 0, speed = 0, phase = 0 } = {}) {
    dt = Math.max(0, Math.min(dt, 0.1));
    if (dt > 0) {
      this.time += dt;
      this.watch = follow(this.watch, watch ? 1 : 0, 6, dt);
      const vx = this.look ? clamp(difference(yaw, this.look.yaw) / dt, 360) : 0;
      const vy = this.look ? clamp(difference(pitch, this.look.pitch) / dt, 240) : 0;
      this.x = follow(this.x, vx * 0.000014, 12, dt);
      this.y = follow(this.y, -vy * 0.000012, 12, dt);
      this.roll = follow(this.roll, -vx * 0.004, 10, dt);
      this.speed = follow(this.speed, Math.min(1, Math.max(0, speed) / 1.35), 8, dt);
      this.look = { yaw, pitch };
      this.phase = phase;
    }
    const w = this.watch, t = this.time, gait = this.speed * Math.sin(this.phase || 0);
    return {
      x: 0.06 - 0.045 * w + this.x + gait * 0.0015,
      y: -0.047 + 0.018 * w + this.y + Math.sin(t * 1.3) * 0.0012 - Math.abs(gait) * 0.001,
      z: -0.25 + 0.018 * w,
      pitch: 5 - 3 * w,
      yaw: -6 + 5 * w,
      roll: -3 + 3 * w + this.roll + Math.sin(t * 0.9) * 0.35,
    };
  }
}

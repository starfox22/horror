// One timeline drives the machine, liquid and sound. Times are seconds from the button press.
export const COFFEE_TIMING = Object.freeze({ grindStart: 0.65, infusionStart: 3.25, pourStart: 5.35,
  pourEnd: 12.4, readyAt: 14, restartAt: 15.5, steamEnd: 31 });

// Measured from the authored espresso cups and outlet tips, not the machine's bounding box.
export const COFFEE_CUPS = Object.freeze([
  Object.freeze({ x: -5.499531, z: -0.911748, bottom: 0.892, full: 0.934, bottomRadius: 0.022, radius: 0.0305 }),
  Object.freeze({ x: -5.407094, z: -0.911748, bottom: 0.892, full: 0.934, bottomRadius: 0.022, radius: 0.0305 }),
]);
export const COFFEE_NOZZLES = Object.freeze([
  Object.freeze({ x: -5.49997, y: 1.0565, z: -0.90851 }),
  Object.freeze({ x: -5.41925, y: 1.0565, z: -0.90851 }),
]);
export const COFFEE_POSITION = Object.freeze({ x: -5.455, y: 1.08, z: -0.86 });
const clamp = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };

export function sampleCoffee(seconds) {
  const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0), k = COFFEE_TIMING;
  let phase = 'Heating', flow = 0, fill = 0;
  if (t >= k.restartAt) phase = 'Ready';
  else if (t >= k.readyAt) phase = 'Cooling down';
  else if (t >= k.pourEnd) phase = 'Finishing';
  else if (t >= k.pourStart) phase = 'Pouring coffee';
  else if (t >= k.infusionStart) phase = 'Pre-infusing';
  else if (t >= k.grindStart) phase = 'Grinding beans';

  if (t >= k.infusionStart && t < k.pourStart) {
    const a = t - k.infusionStart;
    flow = (a > 0.3 && a < 0.7) || (a > 1.15 && a < 1.65) ? 0.23 : 0;
    fill = 0.055 * smooth(a / (k.pourStart - k.infusionStart));
  } else if (t >= k.pourStart && t < k.pourEnd) {
    const a = t - k.pourStart;
    flow = smooth(a / 0.45) * smooth((k.pourEnd - t) / 0.65) * (0.94 + 0.06 * Math.sin(a * 19));
    fill = 0.055 + 0.945 * smooth(a / (k.pourEnd - k.pourStart));
  } else if (t >= k.pourEnd) fill = 1;

  const drip = t >= k.pourEnd && t < k.readyAt;
  const steam = smooth((t - (k.infusionStart + 0.8)) / 3) * (1 - smooth((t - k.readyAt) / (k.steamEnd - k.readyAt)));
  const glow = t < k.readyAt ? smooth(t / 0.28) * (0.8 + 0.08 * Math.sin(t * 4))
    : (1 - smooth((t - k.readyAt) / (k.restartAt - k.readyAt))) * 0.72;
  return { elapsed: t, phase, busy: t < k.restartAt, flow, fill, drip, steam,
    crema: smooth((fill - 0.12) / 0.65), glow };
}

export class CoffeeCycle {
  constructor() { this.state = null; this.time = 0; this.clock = null; this.active = false; }

  start(clock = null) {
    if (this.state?.busy) return false;
    this.time = 0; this.clock = clock; this.active = true; this.state = sampleCoffee(0);
    return true;
  }

  update(dt) {
    if (!this.active) return this.state;
    const now = this.clock?.();
    // Audio time naturally pauses with a suspended AudioContext and catches up after a hidden tab.
    // The silent fallback is simulation time, bounded against a single tab-resume jump.
    this.time = Number.isFinite(now) ? Math.max(this.time, now) : this.time + Math.min(0.1, Math.max(0, dt || 0));
    this.state = sampleCoffee(this.time);
    if (this.time >= COFFEE_TIMING.steamEnd) this.active = false;
    return this.state;
  }

  stop() { this.active = false; this.clock = null; }
}

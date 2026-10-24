// The flat's electricity (docs/STORY.md Acts II-IV): a main switch, an RCD (earth-leakage trip) and seven circuit
// breakers. A light or appliance works when its circuit is live (main on, RCD up, its breaker on). The RCD trips
// whenever a faulty (wet) circuit is switched on with it up: the bathroom always once the basin has flooded, and on
// some runs a nuisance circuit with a cause the player could have seen (fusebox.js, story.js).
// What the player sees: a cut goes out in a cascade from where it happened (a stutter, then dark, a few hundredths of a
// second later per metre); a restore stutters on, off and on. Systems ask k(circuit, position) for the level (0..1) of
// a light at a position; while anything is changing, power re-applies them every frame.
export const CIRCUITS = [
  { id: 'lights1', label: 'LIGHTS 1', note: 'living · kitchen · office' },
  { id: 'lights2', label: 'LIGHTS 2', note: 'hall · bedroom' },
  { id: 'kitchen', label: 'KITCHEN', note: 'fridge · worktop' },
  { id: 'living', label: 'SOCKETS LIVING', note: 'lamps · desk · router' },
  { id: 'bed', label: 'SOCKETS BED', note: 'bedside' },
  { id: 'bathroom', label: 'BATHROOM', note: '' },
  { id: 'oven', label: 'OVEN', note: '' },
];

export class Power {
  constructor({ app } = {}) {
    this.app = app;
    this.main = true; this.rcd = true;
    this.breakers = Object.fromEntries(CIRCUITS.map(c => [c.id, true]));
    this.faults = new Set();
    this.listeners = new Set();
    this.time = 0;
    // A transition: { at, from: [x, z], off (going out) or on (coming back), circuits it affects }.
    this.transitions = [];
    app?.on?.('update', dt => this.update(dt));
  }

  live(c) { return this.main && this.rcd && !!this.breakers[c]; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // Level of a light on circuit c at position p ({x, z} or Vec3), with the cut/restore animation.
  k(c, p) {
    const target = this.live(c) ? 1 : 0;
    const t = this.transitions.find(tr => tr.circuits.includes(c));
    if (!t) return target;
    const d = p ? Math.hypot((p.x ?? p[0]) - t.from[0], (p.z ?? p[2] ?? p[1]) - t.from[1]) : 0;
    const local = this.time - t.at - d * t.spread;
    if (local < 0) return t.on ? 0 : 1;
    if (t.on) {
      // On, off for a beat, on: a restore's inrush.
      if (local < 0.07) return 1; if (local < 0.16) return 0.15; if (local < 0.24) return 0.8; if (local < 0.3) return 0.3;
      return 1;
    }
    // A stutter, then dark.
    if (local < 0.05) return 0.25; if (local < 0.09) return 1; if (local < 0.13) return 0.1; if (local < 0.17) return 0.7;
    return 0;
  }

  get changing() { return this.transitions.length > 0; }

  // What is live now vs. a snapshot of before; starts the animation for the circuits that changed.
  apply(before, from, cause) {
    const changed = CIRCUITS.map(c => c.id).filter(c => before[c] !== this.live(c));
    if (!changed.length) return [];
    const off = changed.filter(c => !this.live(c)), on = changed.filter(c => this.live(c));
    if (off.length) this.transitions.push({ at: this.time, from, circuits: off, on: false, spread: 0.035 });
    if (on.length) this.transitions.push({ at: this.time, from, circuits: on, on: true, spread: 0.012 });
    for (const fn of this.listeners) fn({ cause, off, on });
    return changed;
  }

  snapshot() { return Object.fromEntries(CIRCUITS.map(c => [c.id, this.live(c.id)])); }

  // Is any faulty circuit switched on? (Then the RCD cannot stay up.)
  faulty() { return [...this.faults].some(c => this.breakers[c]); }

  // The RCD trips (a fault: the hair-dryer in the basin, a wet socket). from: [x, z] where it happened.
  trip(from, cause = 'trip') {
    const before = this.snapshot();
    this.rcd = false;
    return this.apply(before, from, cause);
  }

  // The player lifts the RCD: it stays up only if no faulty circuit is on; otherwise it snaps back down at once.
  setRcd(up, from = [2.3, 4.4]) {
    const before = this.snapshot();
    if (up && this.faulty()) { this.rcd = true; this.apply(before, from, 'attempt'); this.rcd = false; this.apply(this.snapshot(), from, 'retrip'); return 'tripped'; }
    this.rcd = up;
    this.apply(before, from, up ? 'restore' : 'off');
    return up ? 'up' : 'down';
  }

  setBreaker(c, on, from = [2.3, 4.4]) {
    const before = this.snapshot();
    this.breakers[c] = on;
    if (on && this.rcd && this.main && this.faults.has(c)) {
      // A wet circuit switched on: the RCD trips the whole flat.
      this.apply(before, from, 'attempt');
      this.rcd = false;
      this.apply(this.snapshot(), from, 'retrip');
      return 'tripped';
    }
    this.apply(before, from, on ? 'restore' : 'off');
    return on ? 'on' : 'off';
  }

  setMain(on, from = [2.3, 4.4]) {
    const before = this.snapshot();
    this.main = on;
    this.apply(before, from, on ? 'restore' : 'main');
  }

  update(dt) {
    this.time += Math.min(dt, 0.1);
    if (!this.transitions.length) return;
    for (const fn of this.listeners) fn(null);        // re-apply levels this frame
    this.transitions = this.transitions.filter(t => this.time - t.at < 1.2);
    if (!this.transitions.length) for (const fn of this.listeners) fn({ settled: true });
  }

  save() { return { main: this.main, rcd: this.rcd, breakers: { ...this.breakers }, faults: [...this.faults] }; }
  load(s) {
    if (!s) return;
    this.main = s.main; this.rcd = s.rcd; Object.assign(this.breakers, s.breakers); this.faults = new Set(s.faults);
    this.transitions = [];
    for (const fn of this.listeners) fn({ settled: true, loaded: true });
  }
}

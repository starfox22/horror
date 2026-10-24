// The intruder's mind in the hunt (docs/STORY.md, Act IV). Pure JS on top of navgrid.js, so tools/check-stalker.mjs can
// run thousands of simulated hunts in Node to tune it; intruder-controller.js turns its decisions into the body
// (intruder.js): where he is, which way he faces, how fast he moves, where his phone light points, and the sounds.
//
// States: off · scripted (story-events drives him) · patrol · alert · investigate · search · chase · kill · ambush
// (light off, waiting, only his breathing gives him away) · backstage (up in the ceiling void; he comes back down
// through the wardrobe).
// Seeing: a suspicion meter fills while the player is in his phone light, close in his side view, or anywhere in sight
// with a torch on; it fills faster up close, slower crouched; at half he stops and turns his light on you (a warning
// breath), full and he comes. Hearing: noises carry a radius in path metres (through doorways, never walls).
// The director keeps him from camping on the player and from losing them for too long.
import { zoneAt } from './zones.js';

export const DIFFICULTY = {
  story: { patrol: 0.9, investigate: 1.3, chase: 2.0, hear: { crouch: 0, walk: 0, run: 8, loud: 6 }, fill: 0.6, police: 60 },
  normal: { patrol: 1.0, investigate: 1.6, chase: 2.6, hear: { crouch: 0.5, walk: 2.5, run: 8, loud: 6 }, fill: 1, police: 100 },
  hard: { patrol: 1.1, investigate: 1.8, chase: 3.0, hear: { crouch: 1, walk: 4, run: 9, loud: 7 }, fill: 1.3, police: 110 },
};
export const SENSES = {
  eye: 1.62, coneHalf: 35, coneRange: 9, sideHalf: 110, sideStand: 2, sideCrouch: 1, torchRange: 14,
  alertAt: 0.5, decay: 0.3, kill: 1.1, killWindup: 0.3, loseAfter: 6, breath: 4,
};
// Waypoints: [id, x, z, room, dwell] (dwell: does he stop and sweep there; he never stops in the corridor).
export const NODES = [
  ['bed-wardrobe', 10.25, -0.15, 'bed', 1], ['bed-foot', 11.1, 1.0, 'bed', 1], ['bed-window', 12.6, -0.95, 'bed', 1],
  ['bed-side', 12.9, 1.95, 'bed', 1], ['bed-door', 10.45, 2.15, 'bed', 1],
  ['bath-sink', 7.6, 0.9, 'bath', 1], ['bath-back', 7.6, -0.6, 'bath', 1],
  ['hall-east', 12.3, 3.55, 'hall', 0], ['hall-mid', 8.0, 3.55, 'hall', 0], ['hall-west', 3.0, 3.6, 'hall', 0],
  ['office-desk', 4.4, 0.2, 'main', 1], ['office-door', 4.6, 2.2, 'main', 1],
  ['kitchen-fridge', 0.5, 0.15, 'main', 1], ['kitchen-sink', -2.2, 0.2, 'main', 1], ['kitchen-coffee', -4.6, -0.3, 'main', 1],
  ['dining', -1.6, 3.3, 'main', 1], ['mouth', 1.0, 3.6, 'main', 1],
  ['living-sofa', -4.2, 1.2, 'main', 1], ['living-window', -5.6, 3.3, 'main', 1], ['living-tv', -2.6, 3.7, 'main', 1],
];
const CORRIDOR = (x, z) => z > 2.72 && x > 1.55 && x < 13.95;
const DEG = Math.PI / 180;
const angleTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz) / DEG;           // yaw facing from f to t
const wrap = (a) => ((a + 180) % 360 + 360) % 360 - 180;

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Stalker {
  // nav: NavGrid; hooks: { state(name, prev), breath(kind), caught(), lostLight(), backstage(on), creak(x, z) }
  constructor({ nav, difficulty = 'normal', random = Math.random, hooks = {} }) {
    Object.assign(this, { nav, random, hooks });
    this.setDifficulty(difficulty);
    this.nodes = NODES.map(([id, x, z, room, dwell]) => {
      const k = nav.nearestFree(x, z), i = k % nav.w, [cx, cz] = nav.centre(i, (k - i) / nav.w);
      return { id, x: nav.open(nav.index(...nav.cellOf(x, z))) ? x : cx, z: nav.open(nav.index(...nav.cellOf(x, z))) ? z : cz, room, dwell };
    });
    this.x = 0; this.z = 0; this.yaw = 0; this.speed = 0;
    this.state = 'off'; this.time = 0; this.stateTime = 0;
    this.torch = false; this.torchYaw = 0; this.torchPitch = -12;
    this.suspicion = 0; this.lastSeen = null; this.sinceSeen = Infinity; this.recent = [];
    this.path = null; this.goal = null; this.wait = 0; this.sweep = null;
    this.closeTime = []; this.farTime = 0; this.nextBackstage = false;
    this.tutorial = 0;               // seconds left of the first encounter's lenient senses
    this.grace = 0;                  // seconds he cannot catch anyone (after a wake-up)
    this.noiseQueue = [];
  }

  setDifficulty(name) { this.difficulty = name; this.tune = DIFFICULTY[name] || DIFFICULTY.normal; }

  set(state) {
    if (state === this.state) return;
    const prev = this.state;
    this.state = state; this.stateTime = 0; this.path = null; this.wait = 0; this.sweep = null;
    this.hooks.state?.(state, prev);
  }

  // Put him somewhere and start a state (patrol by default).
  spawn(x, z, yaw = 0, state = 'patrol') {
    this.x = x; this.z = z; this.yaw = yaw; this.speed = 0; this.suspicion = 0; this.lastSeen = null; this.sinceSeen = Infinity;
    this.state = 'off'; this.set(state);
    this.torch = state !== 'backstage';
  }

  // A noise the player made: radius = how far (path metres) it carries.
  noise(x, z, radius) { if (radius > 0) this.noiseQueue.push({ x, z, radius }); }

  // player: { x, z, crouched, running, torch (on), moving, inWardrobe }
  update(dt, player) {
    if (this.state === 'off' || this.state === 'scripted') { this.noiseQueue.length = 0; return; }
    dt = Math.min(dt, 0.1);
    this.time += dt; this.stateTime += dt;
    this.tutorial = Math.max(0, this.tutorial - dt); this.grace = Math.max(0, this.grace - dt);
    this.director(dt, player);
    if (this.state === 'backstage') { this.updateBackstage(dt); this.noiseQueue.length = 0; return; }
    if (this.state === 'kill') { this.speed = 0; return; }
    this.perceive(dt, player);
    this.hear(player);
    this[`update_${this.state}`]?.(dt, player);
    this.move(dt);
  }

  // --- senses ---------------------------------------------------------------------------------------------------
  seesPlayer(p) {
    const s = SENSES, dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    if (d > s.torchRange + 1) return null;
    const target = { x: p.x, y: p.crouched ? 0.85 : 1.3, z: p.z }, eye = { x: this.x, y: s.eye, z: this.z };
    if (!this.nav.sees(eye, target)) return null;
    const bearing = angleTo(this.x, this.z, p.x, p.z);
    // A phone LED lights a person well only so far: further for someone standing or moving than for a still, crouched shape.
    const reach = s.coneRange * (p.crouched ? 0.45 : 1) * (p.moving === false ? 0.6 : 1);
    const inCone = this.torch && d < reach && Math.abs(wrap(bearing - this.torchYaw)) < s.coneHalf;
    const inSide = d < (p.crouched ? s.sideCrouch : s.sideStand) && Math.abs(wrap(bearing - this.yaw)) < s.sideHalf;
    const byTorch = p.torch && d < s.torchRange;
    this.seenBy = inCone ? 'light' : inSide ? 'side' : byTorch ? 'torch' : null;
    if (this.tutorial > 0) return (p.torchHeld > 1.5 || p.running) && (inCone || byTorch) ? d : null;
    return inCone || inSide || byTorch ? d : null;
  }

  perceive(dt, p) {
    const d = this.seesPlayer(p);
    if (d !== null) {
      let rate = this.tune.fill / (0.8 + 0.3 * d);
      if (p.crouched) rate *= 0.5;
      if (p.moving === false) rate *= 0.67;
      if (p.running || p.torch) rate *= 2;
      if (this.state === 'chase' || this.state === 'kill') rate = 99;
      const before = this.suspicion;
      this.suspicion = Math.min(1, this.suspicion + rate * dt);
      this.lastSeen = { x: p.x, z: p.z, vx: p.vx || 0, vz: p.vz || 0 };
      this.sinceSeen = 0;
      if (this.suspicion >= 1 && this.state !== 'chase') this.set('chase');
      // Half way: he stops and turns his light to you (once, as it crosses; while he walks over it keeps filling).
      else if (before < SENSES.alertAt && this.suspicion >= SENSES.alertAt && ['patrol', 'search', 'investigate', 'ambush'].includes(this.state)) this.alert(p.x, p.z, 'sight');
      else if (this.state === 'investigate') this.target = { x: p.x, z: p.z, why: 'sight' };
    } else {
      this.sinceSeen += dt;
      if (this.state !== 'chase') this.suspicion = Math.max(0, this.suspicion - SENSES.decay * dt);
    }
    this.seeing = d !== null;
  }

  hear() {
    for (const n of this.noiseQueue) {
      if (Math.hypot(n.x - this.x, n.z - this.z) > n.radius) continue;          // cheap reject before the path search
      if (this.nav.pathDistance(this.x, this.z, n.x, n.z) > n.radius) continue;
      if (this.state === 'chase') { this.lastSeen = { x: n.x, z: n.z, vx: 0, vz: 0 }; continue; }
      if (this.state === 'kill') continue;
      this.alert(n.x, n.z, 'sound');
    }
    this.noiseQueue.length = 0;
  }

  alert(x, z, why) {
    this.target = { x, z, why };
    if (this.state === 'alert') return;
    this.set('alert');
    this.wait = why === 'sound' ? 0.5 : 0;       // a beat before he turns to a noise
    this.hooks.breath?.('alert');
  }

  // --- states ---------------------------------------------------------------------------------------------------
  update_patrol(dt, p) {
    this.torch = true;
    if (this.wait > 0) { this.wait -= dt; this.sweepLight(dt); return; }
    if (!this.path) {
      const node = this.pickNode(p);
      this.goTo(node.x, node.z, this.tune.patrol);
      this.goal = node;
    }
    if (this.arrived()) {
      this.recent = [this.goal.id, ...this.recent].slice(0, 4);
      this.path = null;
      if (this.goal.dwell) { this.wait = 2 + this.random() * 2; this.sweep = { base: this.yaw, t: 0 }; }
    }
  }

  update_alert(dt) {
    this.speed = 0;
    const t = this.target;
    if (this.wait > 0) { this.wait -= dt; return; }
    const want = angleTo(this.x, this.z, t.x, t.z);
    this.turnTowards(want, 300, dt); this.torchYaw = this.yaw;
    if (this.stateTime > 1 + (t.why === 'sound' ? 0.5 : 0)) { this.set('investigate'); this.goTo(t.x, t.z, this.tune.investigate); }
  }

  update_investigate(dt) {
    this.torch = true;
    if (!this.path) this.goTo(this.target.x, this.target.z, this.tune.investigate);
    if (this.arrived() || this.stateTime > 20) this.set('search');
  }

  update_search(dt) {
    this.speed = 0;
    if (!this.searchPlan) {
      const near = [...this.nodes].sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z)).filter(n => n.dwell).slice(0, 2);
      this.searchPlan = { steps: [{ sweep: 4 }, ...near.map(n => ({ node: n, sweep: 3 }))], at: 0 };
      // Sometimes, having lost you, he puts his light out and waits.
      if (this.lastSeen && this.random() < 0.3) { this.searchPlan = null; this.set('ambush'); return; }
    }
    const plan = this.searchPlan, step = plan.steps[plan.at];
    if (!step) { this.searchPlan = null; this.set(this.nextBackstage ? 'backstage' : 'patrol'); return; }
    if (step.node && !step.reached) {
      if (!this.path) this.goTo(step.node.x, step.node.z, this.tune.investigate);
      if (this.arrived()) { step.reached = true; this.path = null; this.sweep = { base: this.yaw, t: 0 }; }
      return;
    }
    this.sweep ||= { base: this.yaw, t: 0 };
    this.sweepLight(dt);
    step.time = (step.time || 0) + dt;
    if (step.time > step.sweep) { plan.at++; this.sweep = null; }
  }
  set searchPlan(v) { this._plan = v; }
  get searchPlan() { return this._plan; }

  update_ambush(dt) {
    this.speed = 0; this.torch = false;
    if (this.stateTime > 8 + (this.ambushFor ??= this.random() * 5)) { this.ambushFor = null; this.torch = true; this.hooks.lostLight?.(false); this.set('patrol'); }
  }

  update_chase(dt, p) {
    this.torch = true;
    const target = this.seeing ? { x: p.x, z: p.z } : this.lastSeen ? { x: this.lastSeen.x + this.lastSeen.vx * 1.5, z: this.lastSeen.z + this.lastSeen.vz * 1.5 } : null;
    if (!target) { this.set('search'); return; }
    if (!this.path || this.repath <= 0) { this.goTo(target.x, target.z, this.tune.chase); this.repath = 0.3; }
    this.repath -= dt;
    this.torchYaw = this.yaw;
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (this.seeing && d < SENSES.kill && this.grace <= 0) { this.windup = (this.windup || 0) + dt; if (this.windup >= SENSES.killWindup) { this.set('kill'); this.hooks.caught?.(); } }
    else this.windup = 0;
    if (this.sinceSeen > SENSES.loseAfter) { this.target = { x: target.x, z: target.z }; this.suspicion = 0.4; this.set('search'); }
  }

  // Up in the void: invisible, creaks crossing the ceiling, then down through the wardrobe.
  updateBackstage(dt) {
    this.speed = 0; this.torch = false;
    if (this.stateTime === dt || !this.backstageFor) { this.backstageFor = 25 + this.random() * 15; this.hooks.backstage?.(true); this.nextBackstage = false; }
    this.creakTimer = (this.creakTimer || 0) - dt;
    if (this.creakTimer <= 0) { this.creakTimer = 2.5 + this.random() * 3; const n = this.nodes[Math.floor(this.random() * this.nodes.length)]; this.hooks.creak?.(n.x, n.z); }
    if (this.stateTime > this.backstageFor) {
      const w = this.nodes[0];
      this.x = w.x; this.z = w.z; this.yaw = 90; this.backstageFor = 0;
      this.hooks.backstage?.(false);
      this.set('patrol'); this.torch = true; this.wait = 1.5;
    }
  }

  // --- director ---------------------------------------------------------------------------------------------------
  director(dt, p) {
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    this.closeTime.push(d < 6 && this.state !== 'chase' && this.state !== 'backstage' ? dt : 0);
    if (this.closeTime.length > 600) this.closeTime.shift();      // ~60 s at 10 Hz
    const close = this.closeTime.reduce((a, b) => a + b, 0);
    if (close > 25 && !this.nextBackstage) { this.nextBackstage = true; this.closeTime.length = 0; }
    this.farTime = d > 12 && this.state !== 'backstage' ? this.farTime + dt : 0;
  }

  pickNode(p) {
    if (this.nextBackstage) { this.nextBackstage = false; this.set('backstage'); return this.nodes[0]; }
    let pool = this.nodes.filter(n => n.dwell && !this.recent.includes(n.id));
    if (this.farTime > 45) {
      // Head for the player's side of the flat (the room next to theirs).
      const room = zoneAt(p.x, p.z);
      const near = pool.filter(n => n.room === room || (room === 'bed' && n.room === 'bath') || (room === 'bath' && n.room === 'bed') || (room === 'hall'));
      if (near.length) pool = near;
      this.farTime = 0;
    }
    const weights = pool.map(n => 1 / (1 + Math.hypot(n.x - this.x, n.z - this.z) * 0.08));
    let r = this.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1] || this.nodes[0];
  }

  // --- movement ---------------------------------------------------------------------------------------------------
  goTo(x, z, speed) {
    const p = this.nav.path(this.x, this.z, x, z);
    this.path = p ? { points: p.points, at: 1, speed } : null;
    if (!p) this.wait = 1;
  }

  arrived() { return this.path && this.path.at >= this.path.points.length; }

  move(dt) {
    const path = this.path;
    if (!path || this.arrived() || this.wait > 0 || this.state === 'alert') { this.speed = 0; return; }
    const [tx, tz] = path.points[path.at];
    const want = angleTo(this.x, this.z, tx, tz), turn = Math.abs(wrap(want - this.yaw));
    this.turnTowards(want, this.state === 'chase' ? 400 : 220, dt);
    // Doorways into the corridor: stop and light it end to end before stepping in.
    if (this.state === 'patrol' && !CORRIDOR(this.x, this.z) && CORRIDOR(tx, tz) && !this.lookedDown && Math.hypot(tx - this.x, tz - this.z) < 1.2) {
      this.lookedDown = true; this.wait = 2; this.torchYaw = this.x > 7 ? -90 : 90; return;
    }
    if (CORRIDOR(this.x, this.z)) this.lookedDown = false;
    // Turns on the spot first when the corner is sharp (walk cycles slide on tight turns).
    const target = turn > 60 ? 0 : path.speed;
    this.speed += (target - this.speed) * Math.min(1, dt * 6);
    const step = this.speed * dt, dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d <= step || d < 0.05) { this.x = tx; this.z = tz; path.at++; }
    else { this.x += dx / d * step; this.z += dz / d * step; }
    if (this.state !== 'search' && this.state !== 'ambush') this.torchYaw = wrap(this.torchYaw + wrap(this.yaw - this.torchYaw) * Math.min(1, dt * 5));
  }

  turnTowards(want, rate, dt) {
    const diff = wrap(want - this.yaw), stepTurn = rate * dt;
    this.yaw = wrap(this.yaw + Math.max(-stepTurn, Math.min(stepTurn, diff)));
  }

  sweepLight(dt) {
    const s = this.sweep || (this.sweep = { base: this.yaw, t: 0 });
    s.t += dt;
    this.torchYaw = wrap(s.base + Math.sin(s.t * 1.3) * 60);
    this.yaw = wrap(s.base + Math.sin(s.t * 1.3) * 25);
  }
}

// The intruder's mind in the hunt (docs/STORY.md, Act IV). Pure JS on top of navgrid.js, so tools/check-stalker.mjs can
// run thousands of simulated hunts in Node to tune it; hunt.js turns its decisions into the body (intruder.js): where he
// is, which way he faces, how fast he moves, where his phone light points, the knife, and the sounds.
//
// States: off · scripted (story-events drives him) · patrol · alert · investigate · search · chase · kill · ambush
// (light off, waiting, only his breathing gives him away; never in the corridor or by the front door) · backstage (up in
// the ceiling void) · drop (down through the wardrobe's hatch: legs first, the landing, getting up, a step out).
// Seeing: a suspicion meter fills while the player is in his phone light, close in his side view, or anywhere in sight
// with a torch on; it fills faster up close, slower crouched; at half he stops and turns his light on you (a warning
// breath), full and he comes. Before he strikes he raises the knife into his light for SENSES.killWindup: out of his
// sight or reach meanwhile, it comes down again. Hearing: noises carry a radius in path metres (through doorways, never
// walls; through the bathroom door, which he opens when he gets to it).
// The first encounter (TUTORIAL): he starts well away from the player, sweeps the open-plan room keeping his distance,
// and notices only a torch kept on after the hint, or running; he may come to look, never chase.
// The director keeps him from camping on the player (too long close by: up into the void, through the wardrobe) and from
// losing them for too long. The wardrobe is his door, not a hiding place: stand in it and he comes down on you.
import { zoneAt } from './zones.js';
import { segmentDistance } from './walkgrid.js';

export const DIFFICULTY = {
  story: { patrol: 0.9, investigate: 1.3, chase: 2.0, hear: { crouch: 0, walk: 0, run: 8, loud: 6 }, fill: 0.6, police: 60 },
  normal: { patrol: 1.0, investigate: 1.6, chase: 2.6, hear: { crouch: 0.5, walk: 2.5, run: 8, loud: 6 }, fill: 1, police: 100 },
  hard: { patrol: 1.1, investigate: 1.8, chase: 3.0, hear: { crouch: 1, walk: 4, run: 9, loud: 7 }, fill: 1.3, police: 110 },
};
// kill: the reach he strikes from; killCancel: out of this reach (or out of his sight) the raised knife comes down again.
export const SENSES = {
  eye: 1.62, coneHalf: 35, coneRange: 9, sideHalf: 110, sideStand: 2, sideCrouch: 1, touch: 0.6, torchRange: 14,
  alertAt: 0.5, decay: 0.3, kill: 1.1, killCancel: 1.4, killWindup: 0.45, loseAfter: 6, breath: 4,
};
// The first encounter: at most `seconds`. A torch counts once on for `torchHeld` s, and only from `hint` s (the thought
// "Torch off. Get down."). It ends when the player walks into the corridor or comes within `near` path metres of him. He
// starts at least `spawn` path metres from the player and on his own never comes nearer than `keep` metres; his suspicion
// stays at `cap` (he can come to look, never chase) and drops to `after` when it ends.
export const TUTORIAL = { seconds: 25, hint: 6, torchHeld: 1.5, near: 4, spawn: 8, keep: 6, cap: 0.95, after: 0.6 };
// Down through the wardrobe's hatch: his feet `height` m above the floor at first, the fall and getting up (seconds; in
// a hurry for the front door, `rushRise`), the step out of the wardrobe (m/s; `rushOut`).
export const DROP = { height: 0.95, fall: 0.35, rise: 1.1, rushRise: 0.6, out: 1.1, rushOut: 2.0 };
// Standing in the wardrobe's right half during the hunt: dust at `dust` s, he comes down at `drop` s, and cannot chase for
// `hold` s after landing.
export const WARDROBE = { dust: 1, drop: 4, hold: 1 };
// Places (x, z): where he lands under the hatch (inside the right half) and steps out to; the bedroom door he patrols
// from after a catch; the front door (no ambush within `noAmbush` m of it).
export const PLACES = { hatch: [9.55, -0.12], hatchOut: [10.2, -0.1], respawn: [10.45, 2.15], frontDoor: [12.9, 4.2], noAmbush: 4 };
// After a catch: seconds he cannot catch anyone; the least path metres from the player he starts.
export const RESPAWN = { grace: 8, from: 8 };
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
// Where the hunt starts when the fuse box is too near the player, in order: the open-plan room's far (west) end, its
// office end, the corridor, the bedroom door.
const START_ALTERNATES = ['living-window', 'kitchen-coffee', 'office-desk', 'hall-mid', 'bed-door'];
const DOOR_GIVEUP = 6;           // seconds at a door that will not open (held) before he takes it for a wall for a while
const THROUGH = { through: true };
export const inCorridor = (x, z) => z > 2.72 && x > 1.55 && x < 13.95;
const DEG = Math.PI / 180;
const angleTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz) / DEG;           // yaw facing from f to t
const wrap = (a) => ((a + 180) % 360 + 360) % 360 - 180;

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Stalker {
  // nav: NavGrid; hooks: { state(name, prev), breath(kind), caught(), backstage(on), creak(x, z), drop(phase, why),
  // dust(), openDoor(door), openWardrobe(), tapOff(x, z) }
  constructor({ nav, difficulty = 'normal', random = Math.random, hooks = {} }) {
    Object.assign(this, { nav, random, hooks });
    this.setDifficulty(difficulty);
    this.nodes = NODES.map(([id, x, z, room, dwell]) => {
      const k = nav.nearestFree(x, z), i = k % nav.w, [cx, cz] = nav.centre(i, (k - i) / nav.w);
      return { id, x: nav.open(nav.index(...nav.cellOf(x, z))) ? x : cx, z: nav.open(nav.index(...nav.cellOf(x, z))) ? z : cz, room, dwell };
    });
    this.byId = new Map(this.nodes.map(n => [n.id, n]));
    this.x = 0; this.z = 0; this.yaw = 0; this.torchYaw = 0; this.torchPitch = -12;
    this.state = 'off'; this.time = 0; this.stateTime = 0;
    this.torch = false;
    this.reset();
  }

  setDifficulty(name) { this.difficulty = name; this.tune = DIFFICULTY[name] || DIFFICULTY.normal; }

  // What one life in the hunt remembers (cleared whenever he is put somewhere anew: spawn).
  reset() {
    this.speed = 0; this.lift = 0;
    this.suspicion = 0; this.lastSeen = null; this.sinceSeen = Infinity; this.seeing = false; this.seenBy = null;
    this.path = null; this.pathTo = null; this.goal = null; this.target = null; this.wait = 0; this.sweep = null; this.look = null;
    this.recent = []; this.searchPlan = null; this.ambushFor = null; this.lookedDown = false; this.repath = 0;
    this.windup = 0; this.rush = false; this.climbing = false;
    this.closeLog = []; this.closeSum = 0; this.farTime = 0; this.nextBackstage = false; this.backstageFor = 0; this.creakTimer = 0;
    this.tutorial = 0; this.tutorialTime = 0; this.tutorialOut = true;
    this.grace = 0; this.hold = 0; this.dark = 0;
    this.drop = null; this.door = null; this.avoid = null; this.wardrobeTime = 0; this.dusted = false;
    this.noiseQueue = [];
  }

  set(state) {
    if (state === this.state) return;
    const prev = this.state;
    this.state = state; this.stateTime = 0; this.path = null; this.wait = 0; this.sweep = null; this.look = null;
    this.searchPlan = null; this.ambushFor = null; this.door = null; this.climbing = false; this.rush = false;
    if (state !== 'chase') this.windup = 0;
    this.hooks.state?.(state, prev);
  }

  // Put him somewhere and start a state (patrol by default): a new life, nothing remembered.
  spawn(x, z, yaw = 0, state = 'patrol') {
    this.reset();
    this.x = x; this.z = z; this.yaw = yaw; this.torchYaw = yaw;
    this.state = 'off'; this.set(state);
    this.torch = state !== 'backstage' && state !== 'drop';
  }

  // The hunt starts (hunt.js start). from 'fusebox': his light comes on by the fuse box (`at`), or at the far end of the
  // open-plan room when the fuse box is within TUTORIAL.spawn path metres of the player; `tutorial`: the first encounter.
  // from 'hatch': he heard the front door's lock: down through the wardrobe's hatch, then straight for the door.
  // player: { x, z }, where the player is now.
  begin({ from = 'fusebox', tutorial = true, player = null, at = [2.3, 3.95] } = {}) {
    if (from === 'hatch') {
      this.reset();
      this.state = 'off';
      this.dropDown('rush');
      return;
    }
    const [x, z] = this.startSpot(at, player);
    this.spawn(x, z, player ? angleTo(player.x, player.z, x, z) : -90, 'patrol');
    this.dark = 1.2;                    // his phone light comes on a moment after the main switch goes
    this.torch = false;
    this.grace = 3;
    if (tutorial) {
      this.tutorial = TUTORIAL.seconds; this.tutorialTime = 0; this.tutorialOut = !player || !inCorridor(player.x, player.z);
      // Whatever ends it early (the corridor, coming close), no chase before the hint has been heard and acted on.
      this.hold = TUTORIAL.hint + TUTORIAL.torchHeld;
    }
  }

  // Where the hunt starts: `at` unless that is within TUTORIAL.spawn path metres of the player; then the first of
  // START_ALTERNATES that far, else whichever is furthest.
  startSpot(at, player) {
    if (!player) return at;
    const far = (x, z) => this.nav.pathDistance(player.x, player.z, x, z, THROUGH);
    let best = at, bestD = far(...at);
    if (bestD >= TUTORIAL.spawn) return at;
    for (const id of START_ALTERNATES) {
      const n = this.byId.get(id), d = far(n.x, n.z);
      if (d >= TUTORIAL.spawn) return [n.x, n.z];
      if (d > bestD) { best = [n.x, n.z]; bestD = d; }
    }
    return best;
  }

  // After a catch (the player wakes on the sofa): he patrols from the bedroom door, in sight and with his light on, and
  // cannot catch anyone for RESPAWN.grace s. If the player is within RESPAWN.from path metres of it (a checkpoint that
  // puts them there), he starts from the furthest place he patrols instead.
  respawn(player = null) {
    let [x, z] = PLACES.respawn;
    if (player && this.nav.pathDistance(player.x, player.z, x, z, THROUGH) < RESPAWN.from) {
      const from = this.nav.distances(player.x, player.z, THROUGH);
      let best = -1;
      for (const n of this.nodes) {
        const d = from.at(n.x, n.z);
        if (n.dwell && Number.isFinite(d) && d > best) { best = d; x = n.x; z = n.z; }
      }
    }
    this.spawn(x, z, 0, 'patrol');
    this.grace = RESPAWN.grace;
  }

  // Down through the wardrobe's hatch. then: 'rush' (for the front door at a run: he heard the lock), 'trap' (onto the
  // player standing in the wardrobe), 'patrol' (back from the void).
  dropDown(then) {
    [this.x, this.z] = PLACES.hatch;
    this.yaw = 90; this.torchYaw = 90; this.speed = 0; this.path = null;
    this.set('drop');
    this.torch = false; this.lift = DROP.height;
    this.drop = { t: 0, then, landed: false };
    this.hooks.drop?.('start', then);
  }

  // A noise the player made: radius = how far (path metres) it carries; kind: hunt.js noise kinds ('tap': he turns it off).
  noise(x, z, radius, kind = null) { if (radius > 0) this.noiseQueue.push({ x, z, radius, kind }); }

  // How far the knife is raised (0..1): during the windup before a strike, and at the strike.
  get knife() { return this.state === 'kill' ? 1 : this.state === 'chase' ? Math.min(1, this.windup / SENSES.killWindup) : 0; }

  // player: { x, z, crouched, running, torch (on), torchHeld (s), moving, vx, vz, inWardrobe }
  update(dt, player) {
    if (this.state === 'off' || this.state === 'scripted') { this.noiseQueue.length = 0; return; }
    dt = Math.min(dt, 0.1);
    this.time += dt; this.stateTime += dt;
    this.wait = Math.max(0, this.wait - dt);
    this.grace = Math.max(0, this.grace - dt); this.hold = Math.max(0, this.hold - dt);
    this.updateTutorial(dt, player);
    this.director(dt, player);
    this.wardrobe(dt, player);
    if (this.state === 'kill') { this.speed = 0; return; }
    if (this.state === 'backstage') { this.updateBackstage(dt, player); this.noiseQueue.length = 0; return; }
    if (this.state === 'drop') { this.updateDrop(dt, player); this.noiseQueue.length = 0; return; }
    if (this.dark > 0) { this.dark -= dt; this.speed = 0; this.torch = this.dark <= 0; this.noiseQueue.length = 0; return; }
    this.perceive(dt, player);
    this.hear(player);
    this[`update_${this.state}`]?.(dt, player);
    if (this.state !== 'kill') this.move(dt);
  }

  // --- the first encounter --------------------------------------------------------------------------------------------
  // It ends after TUTORIAL.seconds, or as soon as the player walks into the corridor (having been out of it) or comes
  // within TUTORIAL.near path metres of him; his suspicion then drops to TUTORIAL.after: a chase needs a fresh look.
  updateTutorial(dt, p) {
    if (this.tutorial <= 0) return;
    this.tutorial = Math.max(0, this.tutorial - dt); this.tutorialTime += dt;
    const corridor = inCorridor(p.x, p.z);
    if (!corridor) this.tutorialOut = true;
    const near = Math.hypot(p.x - this.x, p.z - this.z) < TUTORIAL.near && this.nav.pathDistance(this.x, this.z, p.x, p.z, THROUGH) < TUTORIAL.near;
    if ((corridor && this.tutorialOut) || near) this.tutorial = 0;
    if (this.tutorial <= 0) this.suspicion = Math.min(this.suspicion, TUTORIAL.after);
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
    // Close in his side view; within arm's length (s.touch), whichever way he faces.
    const inSide = d < s.touch || (d < (p.crouched ? s.sideCrouch : s.sideStand) && Math.abs(wrap(bearing - this.yaw)) < s.sideHalf);
    const byTorch = p.torch && d < s.torchRange;
    this.seenBy = inCone ? 'light' : inSide ? 'side' : byTorch ? 'torch' : null;
    if (this.tutorial > 0) {
      // The first encounter: only a torch kept on (counted from the hint), or running, in his light or showing its own.
      const torch = p.torch && (p.torchHeld ?? 0) > TUTORIAL.torchHeld && this.tutorialTime >= TUTORIAL.hint;
      return (torch || p.running) && (inCone || byTorch) ? d : null;
    }
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
      // The first encounter, and the moment after he lands on someone in the wardrobe: never a chase. While he stands
      // and breathes in (alert), nothing more: that is the player's moment to get out of his light.
      const cap = this.tutorial > 0 || this.hold > 0 ? TUTORIAL.cap : 1;
      if (this.suspicion < cap && this.state !== 'alert') this.suspicion = Math.min(cap, this.suspicion + rate * dt);
      this.lastSeen = { x: p.x, z: p.z, vx: p.vx || 0, vz: p.vz || 0 };
      this.sinceSeen = 0;
      if (this.suspicion >= 1 && this.state !== 'chase') this.set('chase');
      // Half way: he stops and turns his light to you (once, as it crosses; while he walks over it keeps filling). Not
      // when he is already running at a noise he knows is you (the front door's lock).
      else if (before < SENSES.alertAt && this.suspicion >= SENSES.alertAt && !this.rush && ['patrol', 'search', 'investigate', 'ambush'].includes(this.state)) this.alert(p.x, p.z, 'sight');
      else if (this.state === 'investigate') this.target = { ...this.target, x: p.x, z: p.z, why: 'sight', kind: null };
    } else {
      this.sinceSeen += dt;
      if (this.state !== 'chase' && !this.rush) this.suspicion = Math.max(0, this.suspicion - SENSES.decay * dt);
    }
    this.seeing = d !== null;
  }

  hear() {
    for (const n of this.noiseQueue) {
      if (Math.hypot(n.x - this.x, n.z - this.z) > n.radius) continue;          // cheap reject before the path search
      if (this.nav.pathDistance(this.x, this.z, n.x, n.z, this.navOptions()) > n.radius) continue;
      if (this.state === 'chase') { this.lastSeen = { x: n.x, z: n.z, vx: 0, vz: 0 }; continue; }
      if (this.state === 'kill') continue;
      // Already on his way to it (a tap that keeps running, steps he is following): the target moves, no new pause.
      const t = this.target, off = t ? Math.hypot(n.x - t.x, n.z - t.z) : Infinity;
      if (this.state === 'investigate' && off < 2.5) {
        if (off > 0.5) { this.target = { ...t, x: n.x, z: n.z, kind: n.kind }; this.path = null; }
        continue;
      }
      this.alert(n.x, n.z, 'sound', n.kind);
    }
    this.noiseQueue.length = 0;
  }

  alert(x, z, why, kind = null) {
    this.target = { x, z, why, kind };
    if (this.state === 'alert') return;
    this.set('alert');
    this.torch = true;
    this.wait = why === 'sound' ? 0.5 : 0;       // a beat before he turns to a noise
    this.hooks.breath?.('alert');
  }

  investigate(x, z, { why = 'sound', kind = null, rush = false } = {}) {
    this.target = { x, z, why, kind };
    this.set('investigate');
    this.rush = rush;                            // at a run (he heard the front door's lock)
  }

  // --- states ---------------------------------------------------------------------------------------------------
  update_patrol(dt, p) {
    this.torch = true;
    if (this.wait > 0) { if (this.look) this.holdLook(dt); else this.sweepLight(dt); return; }
    if (this.climbing) { this.set('backstage'); return; }          // up through the wardrobe's hatch
    if (!this.path) {
      const node = this.pickNode(p);
      if (!node) { this.wait = 1; this.sweep = null; return; }      // nowhere to go for now: he stands and sweeps
      if (!this.goTo(node.x, node.z, this.tune.patrol)) { this.recent = [node.id, ...this.recent].slice(0, 4); this.wait = 0.3; return; }
      this.goal = node;
    }
    if (this.arrived()) {
      const goal = this.goal;
      this.recent = [goal.id, ...this.recent].slice(0, 4);
      this.path = null;
      if (goal.up) {
        // At the wardrobe: he opens its right door, turns to it, and goes up.
        this.climbing = true; this.wait = 1.2; this.look = { yaw: -90, t: 0, sweep: 0 };
        this.hooks.openWardrobe?.();
      } else if (goal.dwell) { this.wait = 2 + this.random() * 2; this.sweep = { base: this.yaw, t: 0 }; }
    }
  }

  update_alert(dt) {
    this.speed = 0; this.torch = true;
    const t = this.target;
    if (this.wait > 0) return;
    this.turnTowards(angleTo(this.x, this.z, t.x, t.z), 300, dt); this.torchYaw = this.yaw;
    if (this.stateTime > 1 + (t.why === 'sound' ? 0.5 : 0)) this.investigate(t.x, t.z, { why: t.why, kind: t.kind, rush: !!t.rush });
  }

  update_investigate(dt, p) {
    this.torch = true;
    const t = this.target;
    if (this.tutorial > 0 && Math.hypot(p.x - this.x, p.z - this.z) < TUTORIAL.keep) {
      // The first encounter: he comes to look, never nearer than TUTORIAL.keep; his light on you while he still sees you.
      this.path = null; this.speed = 0;
      if (this.seeing) { this.turnTowards(angleTo(this.x, this.z, p.x, p.z), 200, dt); this.torchYaw = this.yaw; }
      else this.set('search');
      return;
    }
    // What he saw or heard moved (he keeps seeing you, the steps go on): a new way there.
    if (this.path && this.pathTo && Math.hypot(t.x - this.pathTo[0], t.z - this.pathTo[1]) > 1) this.path = null;
    if (!this.path && !this.goTo(t.x, t.z, this.rush ? this.tune.chase : this.tune.investigate)) { this.set('search'); return; }
    if (this.arrived() || this.stateTime > 20) {
      if (t.kind === 'tap') this.hooks.tapOff?.(t.x, t.z);     // a tap left running: he turns it off, then looks round
      this.set('search');
    }
  }

  update_search(dt) {
    this.speed = 0; this.torch = true;
    if (!this.searchPlan) {
      // Sometimes, having lost you, he puts his light out and waits: never in the corridor, near the front door or in the
      // first encounter (the way out stays fair).
      if (this.lastSeen && this.canAmbush() && this.random() < 0.3) { this.set('ambush'); return; }
      // A look round where he is (short in the corridor: he never stops there for long), then the nearest rooms.
      const near = this.tutorial > 0 ? [] : this.nodes.filter(n => n.dwell)
        .sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z)).slice(0, 2);
      this.searchPlan = { steps: [{ sweep: inCorridor(this.x, this.z) ? 1.5 : 4 }, ...near.map(n => ({ node: n, sweep: 3 }))], at: 0 };
    }
    const plan = this.searchPlan, step = plan.steps[plan.at];
    if (!step) { this.set('patrol'); return; }
    if (step.node && !step.reached) {
      if (!this.path && !this.goTo(step.node.x, step.node.z, this.tune.investigate)) { step.reached = true; return; }   // out of reach: skip it
      if (this.arrived()) { step.reached = true; this.path = null; this.sweep = { base: this.yaw, t: 0 }; }
      return;
    }
    this.sweep ||= { base: this.yaw, t: 0 };
    this.sweepLight(dt);
    step.time = (step.time || 0) + dt;
    if (step.time > step.sweep) { plan.at++; this.sweep = null; }
  }

  canAmbush() {
    const [fx, fz] = PLACES.frontDoor;
    return this.tutorial <= 0 && !inCorridor(this.x, this.z) && Math.hypot(this.x - fx, this.z - fz) >= PLACES.noAmbush;
  }

  update_ambush(dt) {
    this.speed = 0; this.torch = false;
    this.ambushFor ??= 8 + this.random() * 5;
    if (this.stateTime > this.ambushFor) { this.torch = true; this.set('patrol'); }
  }

  update_chase(dt, p) {
    this.torch = true;
    const seen = this.seeing, ls = this.lastSeen;
    // Where you are, or where you were heading when he last saw you.
    const target = seen ? { x: p.x, z: p.z } : ls ? { x: ls.x + ls.vx * 1.5, z: ls.z + ls.vz * 1.5 } : null;
    if (!target) { this.set('search'); return; }
    this.repath -= dt;
    if (!this.path || this.repath <= 0) {
      this.repath = 0.3;
      // No way there (behind a door held shut, say): where he last saw you; failing that, he searches from here.
      if (!this.goTo(target.x, target.z, this.tune.chase) && !(ls && this.goTo(ls.x, ls.z, this.tune.chase))) { this.lose(target); return; }
    }
    // The strike: within reach and in sight, he raises the knife into his light for SENSES.killWindup; out of his sight or
    // beyond SENSES.killCancel meanwhile, it comes down and he must close in again.
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (this.grace <= 0 && seen && (d < SENSES.kill || (this.windup > 0 && d < SENSES.killCancel))) {
      this.windup += dt;
      this.torchYaw = angleTo(this.x, this.z, p.x, p.z);
      if (this.windup >= SENSES.killWindup) { this.set('kill'); this.hooks.caught?.(); return; }
    } else this.windup = 0;
    if (this.sinceSeen > SENSES.loseAfter) this.lose(target);
  }

  lose(target) { this.target = { x: target.x, z: target.z, why: 'sight', kind: null }; this.suspicion = 0.4; this.set('search'); }

  // Legs first out of the hatch, the landing (a thump), getting up, a step out of the wardrobe into the bedroom; then
  // onto the player who stood in it ('trap'), for the front door ('rush') or on his rounds ('patrol').
  updateDrop(dt, p) {
    const d = this.drop;
    d.t += dt; this.speed = 0;
    if (d.t < DROP.fall) { const k = d.t / DROP.fall; this.lift = DROP.height * (1 - k * k); return; }
    this.lift = 0;
    if (!d.landed) {
      d.landed = true; this.torch = true;
      this.hooks.drop?.('land', d.then);
      this.hooks.openWardrobe?.();
      if (d.then === 'trap') this.hold = WARDROBE.hold;
    }
    const rush = d.then === 'rush';
    if (d.t < DROP.fall + this.riseTime(d.then)) { this.torchYaw = this.yaw; return; }
    const [ox, oz] = PLACES.hatchOut, dx = ox - this.x, dz = oz - this.z, dist = Math.hypot(dx, dz), v = rush ? DROP.rushOut : DROP.out;
    if (dist > 0.03) {
      const step = Math.min(dist, v * dt);
      this.x += dx / dist * step; this.z += dz / dist * step; this.speed = v;
      this.yaw = this.torchYaw = angleTo(this.x, this.z, ox, oz);
      return;
    }
    const then = d.then;
    this.drop = null;
    // After the player who stood in the wardrobe: out of it, he stops and breathes in where they went (the alert: their
    // moment), then comes at a run. For the door: he knows someone is there. Either way the first sight is a chase.
    if (then === 'trap') { this.suspicion = TUTORIAL.cap; this.alert(p.x, p.z, 'sight'); this.target.rush = true; }
    else if (rush) { this.suspicion = TUTORIAL.cap; this.investigate(...PLACES.frontDoor, { rush: true }); }
    else { this.set('patrol'); this.wait = 1; }
  }

  // How long getting up takes after the landing (hunt.js plays the crouch's rise over it).
  riseTime(then) { return then === 'rush' ? DROP.rushRise : DROP.rise; }

  // Up in the void: invisible, creaks crossing the ceiling; then down through the wardrobe again: not while someone
  // stands right by it (up to 15 s more; standing in it is the wardrobe's own rule, below).
  updateBackstage(dt, p) {
    this.speed = 0; this.torch = false;
    if (!this.backstageFor) {
      this.backstageFor = 25 + this.random() * 15; this.nextBackstage = false; this.closeLog = []; this.closeSum = 0;
      this.hooks.backstage?.(true);
    }
    this.creakTimer -= dt;
    if (this.creakTimer <= 0) { this.creakTimer = 2.5 + this.random() * 3; const n = this.nodes[Math.floor(this.random() * this.nodes.length)]; this.hooks.creak?.(n.x, n.z); }
    const clear = Math.hypot(p.x - PLACES.hatchOut[0], p.z - PLACES.hatchOut[1]) > 3;
    if (this.stateTime > this.backstageFor && (clear || this.stateTime > this.backstageFor + 15)) {
      this.backstageFor = 0;
      this.hooks.backstage?.(false);
      this.dropDown('patrol');
    }
  }

  // The wardrobe is his door, not a hiding place: someone standing in its right half sees dust fall at WARDROBE.dust s,
  // and at WARDROBE.drop s he comes down through the hatch onto them, unless he is in sight of them already.
  wardrobe(dt, p) {
    if (!p.inWardrobe) { this.wardrobeTime = 0; this.dusted = false; return; }
    if (this.state === 'chase' || this.state === 'kill' || this.state === 'drop') return;
    this.wardrobeTime += dt;
    if (this.wardrobeTime >= WARDROBE.dust && !this.dusted) { this.dusted = true; this.hooks.dust?.(); }
    if (this.wardrobeTime < WARDROBE.drop) return;
    const seen = this.state !== 'backstage' && this.nav.sees({ x: p.x, y: p.crouched ? 1.05 : 1.62, z: p.z }, { x: this.x, y: 1.4, z: this.z });
    if (seen) return;
    this.wardrobeTime = 0;
    if (this.state === 'backstage') { this.backstageFor = 0; this.hooks.backstage?.(false); }
    this.dropDown('trap');
  }

  // --- director ---------------------------------------------------------------------------------------------------
  // Too long close by (more than 25 of the last 60 s within 6 m, not chasing) and he goes up into the void for a while
  // (through the wardrobe: pickNode); too long far away (45 s beyond 12 m) and he heads for the player's side.
  director(dt, p) {
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    const close = d < 6 && this.tutorial <= 0 && !['chase', 'kill', 'backstage', 'drop'].includes(this.state);
    const second = Math.floor(this.time), log = this.closeLog;
    if (!log.length || log[log.length - 1].at !== second) log.push({ at: second, close: 0 });
    if (close) { log[log.length - 1].close += dt; this.closeSum += dt; }
    while (log.length && log[0].at <= second - 60) this.closeSum -= log.shift().close;
    if (this.closeSum > 25 && !this.nextBackstage) { this.nextBackstage = true; this.closeLog = []; this.closeSum = 0; }
    this.farTime = d > 12 && this.state !== 'backstage' ? this.farTime + dt : 0;
  }

  pickNode(p) {
    if (this.tutorial > 0) return this.tutorialNode(p);
    if (this.nextBackstage) return { ...this.byId.get('bed-wardrobe'), up: true, dwell: 0 };
    let pool = this.nodes.filter(n => n.dwell && !this.recent.includes(n.id));
    if (this.farTime > 45) {
      // Head for the player's side of the flat (the room next to theirs).
      const room = zoneAt(p.x, p.z);
      const near = pool.filter(n => n.room === room || (room === 'bed' && n.room === 'bath') || (room === 'bath' && n.room === 'bed') || (room === 'hall'));
      if (near.length) pool = near;
      this.farTime = 0;
    }
    return this.weighted(pool) || this.nodes[0];
  }

  // A node from the pool, the nearer to him the likelier.
  weighted(pool) {
    const weights = pool.map(n => 1 / (1 + Math.hypot(n.x - this.x, n.z - this.z) * 0.08));
    let r = this.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1] || null;
  }

  // The first encounter's sweep: a place in the open-plan room at least TUTORIAL.keep from the player, reached without
  // passing within TUTORIAL.near + 1 of them; null when there is none (he stays and sweeps where he is).
  tutorialNode(p) {
    const ok = (n) => n.room === 'main' && n.dwell && Math.hypot(n.x - p.x, n.z - p.z) >= TUTORIAL.keep && Math.hypot(n.x - this.x, n.z - this.z) > 0.5;
    for (const pool of [this.nodes.filter(n => ok(n) && !this.recent.includes(n.id)), this.nodes.filter(ok)]) {
      while (pool.length) {
        const n = this.weighted(pool);
        pool.splice(pool.indexOf(n), 1);
        const path = this.nav.path(this.x, this.z, n.x, n.z, this.navOptions());
        if (path && keepsAway(path.points, p, TUTORIAL.near + 1)) return n;
      }
    }
    return null;
  }

  // --- movement ---------------------------------------------------------------------------------------------------
  // How his paths and hearing use the doors (navgrid.js): through the ones he can open, but a door held against him is a
  // wall for a while.
  navOptions() {
    if (this.avoid && this.time >= this.avoid.until) this.avoid = null;
    return this.avoid ? { through: true, avoid: new Set([this.avoid.door]) } : THROUGH;
  }

  // A path to (x, z) at `speed`; false (and no path) when there is none: each state decides what to do instead.
  goTo(x, z, speed) {
    const p = this.nav.path(this.x, this.z, x, z, this.navOptions());
    this.path = p ? { points: p.points, at: 1, speed } : null;
    this.pathTo = [x, z];
    return !!p;
  }

  arrived() { return this.path && this.path.at >= this.path.points.length; }

  move(dt) {
    const path = this.path;
    if (!path || this.arrived() || this.wait > 0 || this.state === 'alert') { this.speed = 0; return; }
    const [tx, tz] = path.points[path.at];
    if (this.doorInWay(tx, tz, dt)) return;
    const want = angleTo(this.x, this.z, tx, tz), turn = Math.abs(wrap(want - this.yaw));
    this.turnTowards(want, this.state === 'chase' || this.rush ? 400 : 220, dt);
    // Doorways into the corridor: he stops and lights it end to end before stepping in.
    if (this.state === 'patrol' && !inCorridor(this.x, this.z) && inCorridor(tx, tz) && !this.lookedDown && Math.hypot(tx - this.x, tz - this.z) < 1.2) {
      this.lookedDown = true; this.wait = 2; this.look = { yaw: this.x > 7 ? -90 : 90, t: 0, sweep: 12 }; this.speed = 0; return;
    }
    if (inCorridor(this.x, this.z)) this.lookedDown = false;
    // Turns on the spot first when the corner is sharp (walk cycles slide on tight turns).
    const target = turn > 60 ? 0 : path.speed;
    this.speed += (target - this.speed) * Math.min(1, dt * 6);
    const step = this.speed * dt, dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d <= step || d < 0.05) { this.x = tx; this.z = tz; path.at++; }
    else { this.x += dx / d * step; this.z += dz / d * step; }
    if (this.state !== 'search' && this.state !== 'ambush' && !this.windup) this.torchYaw = wrap(this.torchYaw + wrap(this.yaw - this.torchYaw) * Math.min(1, dt * 5));
  }

  // A door of his in the way (the bathroom's, shut or ajar): he walks up to it, stops, opens it (hunt.js: the latch and a
  // creak) and waits for the leaf to swing clear; held against him for DOOR_GIVEUP s, he takes it for a wall for a while.
  doorInWay(tx, tz, dt) {
    const hit = this.nav.doorAcross?.(this.x, this.z, tx, tz, 1.5);
    if (!hit) { this.door = null; return false; }
    if (hit.at > 0.5) return false;
    this.speed = 0;
    this.turnTowards(angleTo(this.x, this.z, tx, tz), 200, dt);
    if (this.door?.door !== hit.door) { this.door = { door: hit.door, t: 0 }; this.hooks.openDoor?.(hit.door); }
    this.door.t += dt;
    if (this.door.t > DOOR_GIVEUP) { this.avoid = { door: hit.door, until: this.time + 10 }; this.door = null; this.path = null; }
    return true;
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

  // Holding his light one way (down the corridor from a doorway; into the wardrobe), with a slow small sweep.
  holdLook(dt) {
    const l = this.look;
    l.t += dt;
    this.turnTowards(l.yaw, 160, dt);
    this.torchYaw = wrap(this.yaw + Math.sin(l.t * 1.1) * (l.sweep ?? 12));
  }
}

// Does a walk along `points` stay at least `dist` metres from p everywhere?
function keepsAway(points, p, dist) {
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    if (segmentDistance(p.x, p.z, [ax, az, bx, bz]) < dist) return false;
  }
  return points.length > 1 || Math.hypot(points[0][0] - p.x, points[0][1] - p.z) >= dist;
}

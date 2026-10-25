// Simulated hunts (src/stalker.js on the real walk grid and sight map, no browser): bots with different habits play
// many seeded rounds. The hunt must be survivable by careful play and deadly to careless play, and fair: the first
// encounter never kills, the knife always comes up before a strike, no ambush where the way out runs, a grace after
// waking, the bathroom no safe room, the wardrobe his door, a race at the front door the player can win, the director's
// window in seconds whatever the frame rate, and a path that cannot be found never freezes him.
// node --test tools/check-stalker.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WalkGrid } from '../src/walkgrid.js';
import { NavGrid } from '../src/navgrid.js';
import { Stalker, rng, SENSES, TUTORIAL, PLACES, RESPAWN, WARDROBE, DROP, NODES, inCorridor } from '../src/stalker.js';

const COLLISION = JSON.parse(readFileSync(new URL('../public/assets/apartment/collision.json', import.meta.url), 'utf8'));
const SIGHT = JSON.parse(readFileSync(new URL('../public/assets/apartment/sight.json', import.meta.url), 'utf8'));
const walk = new WalkGrid(COLLISION);
const nav = new NavGrid(walk, SIGHT);
const DT = 0.1;
const THROUGH = { through: true };
const FUSEBOX = [2.3, 3.95];              // hunt.js: where his light comes on (story.js FUSEBOX, 0.3 m into the corridor)
const SOFA = [-5.12, 2.0];                // where the player stands up after a catch (death.js WAKE_TO)
const DOOR = [12.5, 3.9];                 // where the player turns the front door's lock (story.js: within 1.5 m of it)
const LOCK = [12.88, 4.36];               // the lock (story.js FRONT_DOOR): each click a 6 m noise
// Where the player stands to take the spare key (story.js SPARE_KEY, world.js SPARE_SPOTS), measured walkable.
const KEYS = { tin: [-4.95, -0.45], sofa: [-5.1, 2.3], plant: [-3.97, 1.69] };
// Where the player may be when the hunt starts: outside the bedroom after LIVE, in the bedroom or office (fallbacks).
const STARTS = { corridor: [10.45, 3.4], bedroom: [11.4, 1.0], office: [4.6, 0.6] };
// Hiding places a player would think of: room corners and the far side of furniture (crouched).
const SPOTS = [[13.6, -1.1], [11.2, -1.1], [13.7, 2.1], [9.9, 2.0], [7.0, -1.1], [8.7, 1.9], [5.9, -1.0], [2.0, -1.0],
  [5.8, 2.2], [-0.2, -0.9], [-6.0, -0.8], [-6.0, 4.0], [-3.4, 4.1], [1.2, 4.2], [-1.9, 2.0], [0.9, 1.8]];
// Where he stops and sweeps his light (stalker.js NODES with dwell): no place to hide.
const ROUNDS = NODES.filter(n => n[4]).map(n => [n[1], n[2]]);
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i);
const pct = (k, n) => `${(k / n * 100).toFixed(0)} %`;

// A simulated player's body: walks nav paths at their pace (crouched 0.7, walking 1.35, running 2.4 m/s; player.js),
// each footfall a noise for him (stalker.js DIFFICULTY.hear), the torch's timer counted from the hint (hunt.js).
class Body {
  constructor(s, at, { crouched = false, torch = false } = {}) {
    this.s = s;
    this.p = { x: at[0], z: at[1], crouched, running: false, torch, torchHeld: 0, moving: false, vx: 0, vz: 0, inWardrobe: false };
    this.leg = null; this.at = 1; this.stepTimer = 0; this.time = 0;
  }
  goTo(target, kind = 'route') {
    const path = nav.path(this.p.x, this.p.z, target[0], target[1]);
    this.leg = path ? { points: path.points, target, kind } : null; this.at = 1;
    return !!path;
  }
  get arrived() { return !this.leg || this.at >= this.leg.points.length; }
  // One step along the leg (or standing still), then his turn.
  step(dt, move = true) {
    const p = this.p;
    this.time += dt;
    p.torchHeld = p.torch && this.time >= TUTORIAL.hint ? p.torchHeld + dt : 0;
    if (move && !this.arrived) {
      const speed = p.running ? 2.4 : p.crouched ? 0.7 : 1.35;
      const [tx, tz] = this.leg.points[this.at], dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), step = speed * dt;
      if (d <= step) { p.x = tx; p.z = tz; this.at++; } else { p.x += dx / d * step; p.z += dz / d * step; }
      p.vx = dx / (d || 1) * speed; p.vz = dz / (d || 1) * speed; p.moving = true;
      this.stepTimer += dt;
      if (this.stepTimer > (p.running ? 0.35 : 0.55)) {
        this.stepTimer = 0;
        const hear = this.s.tune.hear, kind = p.running ? 'run' : p.crouched ? 'crouch' : 'walk';
        this.s.noise(p.x, p.z, hear[kind], kind);
      }
    } else { p.moving = false; p.vx = p.vz = 0; }
    p.running = p.running && p.moving;
    this.s.update(dt, p);
  }
}

// The listening player's caution, every half second: while he is within earshot (12 m of open space) and coming closer,
// or as soon as he has noticed them (his breath, his light turned on them), go to a hiding place: one he cannot see,
// far from him along open space, near themselves, not where he stops to sweep his light, by a way that keeps out of his
// sight; crouched (running if he is chasing), and wait there until he is far away again. dist and closing: for the
// caller.
class Caution {
  constructor(body) {
    this.body = body; this.think = 0; this.lastDist = Infinity; this.hiding = false; this.fleeing = false; this.calm = 0;
    this.dist = Infinity; this.closing = false;
  }
  update(dt, { upright = false } = {}) {
    const { s, p } = this.body;
    if (s.state === 'backstage') { this.dist = Infinity; this.closing = false; }
    this.think -= dt;
    if (this.think <= 0 && s.state !== 'backstage') {
      this.think = 0.5;
      const dist = Math.hypot(s.x - p.x, s.z - p.z) < 14 ? nav.pathDistance(s.x, s.z, p.x, p.z, THROUGH) : Infinity;
      const closing = dist < this.lastDist - 0.15 || ['investigate', 'chase', 'alert'].includes(s.state);
      this.lastDist = dist; this.dist = dist; this.closing = closing;
      // Not yet hiding and he is coming: find a place. Already hiding and he is closing in on it: move to another. He has
      // noticed them: out of his light now, wherever they are.
      const settled = this.body.leg?.kind === 'hide' && this.body.arrived;
      const onMe = (s.state === 'alert' || s.state === 'investigate') && s.target && Math.hypot(s.target.x - p.x, s.target.z - p.z) < 3;
      if (!onMe) this.fleeing = false;
      if ((dist < 12 && closing && (this.body.leg?.kind !== 'hide' || (settled && dist < 5))) || (onMe && !this.fleeing)) {
        this.fleeing = onMe;
        const best = this.spot();
        if (best && this.body.goTo(best, 'hide')) { this.hiding = true; this.calm = 0; }
      }
      if (this.hiding) {
        this.calm = dist > 9 ? this.calm + 0.5 : 0;
        if (this.calm > 4) { this.hiding = false; this.body.leg = null; }
      }
    }
    if (s.state === 'backstage' && this.hiding) { this.calm += dt; if (this.calm > 4) { this.hiding = false; this.body.leg = null; } }
    p.running = s.state === 'chase';
    p.crouched = !p.running && (this.hiding || !upright || this.lastDist < 8);
  }
  // The best hiding place from here.
  spot() {
    const { s, p } = this.body, him = nav.distances(s.x, s.z, THROUGH), mine = nav.distances(p.x, p.z), eye = { x: s.x, y: 1.62, z: s.z };
    let best = null, bestScore = -Infinity;
    for (const spot of SPOTS) {
      const a = mine.at(...spot), b = him.at(...spot);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b < a + 1) continue;
      const hidden = !nav.sees(eye, { x: spot[0], y: 0.85, z: spot[1] });
      const onRound = ROUNDS.some(n => Math.hypot(n[0] - spot[0], n[1] - spot[1]) < 1.6);
      // How much of the way there is in his sight within 6 m of him (every half metre).
      const route = nav.path(p.x, p.z, spot[0], spot[1]);
      let exposed = 0;
      if (route) for (let i = 1; i < route.points.length; i++) {
        const [ax, az] = route.points[i - 1], [bx, bz] = route.points[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
        for (let k = 1; k <= n; k++) {
          const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
          if (Math.hypot(x - s.x, z - s.z) < 6 && nav.sees(eye, { x, y: 0.85, z })) exposed++;
        }
      }
      const score = (hidden ? 6 : 0) + Math.min(b, 10) - a * 0.6 - (onRound ? 5 : 0) - exposed * 1.5;
      if (score > bestScore) { bestScore = score; best = spot; }
    }
    return best;
  }

  // Like a player watching his light: close to him, never move while it points their way (unless he has noticed them).
  lit() {
    const { s, p } = this.body;
    if (this.fleeing) return false;
    const bearing = Math.atan2(p.x - s.x, p.z - s.z) * 180 / Math.PI;
    return s.torch && Math.abs(((bearing - s.torchYaw + 540) % 360) - 180) < 50 && Math.hypot(s.x - p.x, s.z - p.z) < 7 && s.state !== 'chase';
  }
}

// A wandering player (the older tuning check): walks a route round the flat, with habits { crouch, torch, cautious,
// noisy (bangs a door every 4 s: he comes to look, and searches) }.
function wander(seed, habits, route, { difficulty = 'normal', seconds = 150, tutorial = true, record = null } = {}) {
  let caught = false, chases = 0;
  const states = [];
  const s = new Stalker({ nav, difficulty, random: rng(seed), hooks: {
    caught: () => { caught = true; },
    state: (now, prev) => { states.push([now, prev]); if (now === 'chase') chases++; },
  } });
  const body = new Body(s, route[0], { crouched: !!habits.crouch, torch: !!habits.torch });
  s.begin({ from: 'fusebox', tutorial, player: body.p, at: FUSEBOX });
  const caution = habits.cautious ? new Caution(body) : null;
  let next = 1, t = 0;
  for (; t < seconds && !caught; t += DT) {
    if (caution) caution.update(DT, { upright: !habits.crouch });
    else { body.p.running = !!habits.run; }
    const holding = (caution?.hiding && body.leg?.kind === 'hide' && body.arrived) || (caution && caution.lit());
    if (!holding && body.arrived && !caution?.hiding) { body.goTo(route[next]); next = (next + 1) % route.length; }
    if (habits.noisy && Math.floor(t / 4) !== Math.floor((t - DT) / 4)) s.noise(body.p.x, body.p.z, 6, 'door');
    body.step(DT, !holding);
    record?.(t, s, body.p);
  }
  return { caught, chases, t, states };
}

// The whole of Act IV as a player with a goal plays it: from `start`, to the spare key (`key`), take it (1.5 s, a 2.5 m
// noise), then to the front door and turn the lock (3 s of E held: a click each second, a 6 m noise; letting go keeps
// what is turned). Caught: the player stands up on the sofa with the key (death.js; story.js keeps what they carried) and
// the lock to turn again, and he patrols from the bedroom door (respawn). careful: crouched, torch off, into cover when he
// is near and coming, into the corridor or at the lock only when he is far and not coming. careless: upright, torch on,
// straight there (running only once chased).
function escape(seed, { careful, start, key, difficulty = 'normal', limit = 420, record = null } = {}) {
  let caught = false;
  const s = new Stalker({ nav, difficulty, random: rng(seed), hooks: { caught: () => { caught = true; } } });
  const body = new Body(s, start, { crouched: careful, torch: !careful });
  s.begin({ from: 'fusebox', tutorial: true, player: body.p, at: FUSEBOX });
  const caution = careful ? new Caution(body) : null;
  let phase = 'key', took = 0, turned = 0, deaths = 0, t = 0, firstDeath = null;
  const goal = () => (phase === 'key' ? KEYS[key] : DOOR);
  for (; t < limit; t += DT) {
    if (caught) {
      caught = false; deaths++; firstDeath ??= t;
      body.p.x = SOFA[0]; body.p.z = SOFA[1]; body.leg = null; turned = 0; took = 0;
      if (caution) Object.assign(caution, { hiding: false, calm: 0, lastDist: Infinity });
      s.respawn({ x: SOFA[0], z: SOFA[1] });
      continue;
    }
    let move = true;
    if (caution) {
      caution.update(DT);
      if (caution.hiding) move = !(body.leg?.kind === 'hide' && body.arrived);
      else if (caution.lit()) move = false;
    } else body.p.running = s.state === 'chase';
    if (!caution?.hiding) {
      const [gx, gz] = goal(), there = Math.hypot(body.p.x - gx, body.p.z - gz) < 0.3;
      // Careful: no step into the corridor, and no turning of the lock, while he is near or coming.
      const exposed = (!inCorridor(body.p.x, body.p.z) && body.leg && !body.arrived && inCorridor(...body.leg.points[body.at])) || (phase === 'door' && there);
      const wait = careful && exposed && s.state !== 'backstage' && (caution.dist < 11 || caution.closing);
      if (there) {
        move = false;
        if (phase === 'key') { if (took === 0) s.noise(body.p.x, body.p.z, 2.5, 'walk'); took += DT; if (took >= 1.5) { phase = 'door'; body.leg = null; } }
        else if (!wait) {
          const before = Math.floor(turned + 1e-4);
          turned += DT;
          if (Math.floor(turned + 1e-4) > before) s.noise(LOCK[0], LOCK[1], 6, 'unlock');
          if (turned >= 3) { record?.(t, s, body.p); return { escaped: true, deaths, t, firstDeath }; }
        }
      } else if (wait) move = false;
      else if (!body.leg || body.leg.kind !== 'route' || body.arrived) body.goTo(goal(), 'route');
    }
    body.step(DT, move);
    record?.(t, s, body.p);
  }
  return { escaped: false, deaths, t, firstDeath };
}

// Routes through the flat (bot waypoints), from the office to the kitchen and living room, the front door and back.
const ROUTE_LONG = [[4.5, 0.6], [0.5, 0.2], [-2.5, 0.5], [-4.5, 2.6], [3, 3.6], [8, 3.55], [10.45, 2.3], [12.85, 1.8], [12.3, 3.6]];
const RUNS = Object.entries(STARTS).flatMap(([from, start]) => Object.keys(KEYS).map(key => ({ from, start, key })));

test('the walk grid and sight map support the waypoints', () => {
  const s = new Stalker({ nav, random: rng(1) });
  for (const n of s.nodes) assert.ok(nav.open(nav.index(...nav.cellOf(n.x, n.z))), `${n.id} is walkable`);
  for (let i = 0; i < s.nodes.length; i++) for (let j = i + 1; j < s.nodes.length; j++) {
    assert.ok(nav.path(s.nodes[i].x, s.nodes[i].z, s.nodes[j].x, s.nodes[j].z), `path ${s.nodes[i].id} -> ${s.nodes[j].id}`);
  }
  for (const [name, at] of Object.entries({ ...KEYS, ...STARTS, SOFA, DOOR })) assert.ok(walk.fits(at[0], at[1], 0.22, walk.floorAt(...at)), `${name} is somewhere a player can stand`);
});

test('careless play (walking upright, torch on) is usually caught', () => {
  const rounds = SEEDS.map(seed => wander(seed, { torch: true }, ROUTE_LONG));
  const rate = rounds.filter(r => r.caught).length / rounds.length;
  console.log(`careless, wandering 150 s: caught in ${pct(rate, 1)}`);
  assert.ok(rate > 0.6, `careless play should be punished (${rate})`);
});

// The bots play far worse than a person (they cannot read his light or back off sideways); the thresholds catch
// regressions in fairness, they are not the target difficulty.
test('careful play (crouched, torch off, hiding when he comes) survives 150 s of wandering about half the time', () => {
  const rounds = SEEDS.map(seed => wander(seed, { crouch: true, cautious: true }, ROUTE_LONG));
  const rate = rounds.filter(r => !r.caught).length / rounds.length;
  console.log(`careful, wandering 150 s: survived ${pct(rate, 1)}`);
  assert.ok(rate >= 0.45, `careful play should survive (${rate})`);
});

test('walking upright with the torch off but listening is a fair middle ground', () => {
  const rounds = SEEDS.map(seed => wander(seed, { cautious: true }, ROUTE_LONG));
  const rate = rounds.filter(r => !r.caught).length / rounds.length;
  console.log(`listening, upright, wandering 150 s: survived ${pct(rate, 1)}`);
  assert.ok(rate > 0.3 && rate < 0.98, `middle ground (${rate})`);
});

test('Story difficulty is kinder than Normal to the same play', () => {
  const alive = (difficulty) => SEEDS.map(seed => wander(seed, { cautious: true }, ROUTE_LONG, { difficulty })).filter(r => !r.caught).length;
  const story = alive('story'), normal = alive('normal'), hard = alive('hard');
  console.log(`listening, wandering: survived story ${pct(story, SEEDS.length)}, normal ${pct(normal, SEEDS.length)}, hard ${pct(hard, SEEDS.length)}`);
  assert.ok(story > normal && normal >= hard, `story ${story} > normal ${normal} >= hard ${hard}`);
});

test('a chase never starts without his senses: always after sight builds suspicion', () => {
  for (const seed of SEEDS.slice(0, 40)) {
    const r = wander(seed, { torch: true }, ROUTE_LONG, { seconds: 60 });
    for (const [now, prev] of r.states) if (now === 'chase') assert.ok(['alert', 'patrol', 'investigate', 'search', 'ambush'].includes(prev), `chase from ${prev}`);
  }
});

test('a careful player escapes a full hunt (the key, the corridor, the lock) more often than not on Normal', () => {
  const report = {};
  for (const careful of [true, false]) {
    const rounds = RUNS.flatMap(run => SEEDS.slice(0, 12).map(seed => escape(seed, { careful, ...run })));
    const clean = rounds.filter(r => r.escaped && r.deaths === 0).length, out = rounds.filter(r => r.escaped).length;
    const deaths = rounds.reduce((a, r) => a + r.deaths, 0) / rounds.length;
    report[careful ? 'careful' : 'careless'] = { clean: clean / rounds.length, out: out / rounds.length, deaths };
    console.log(`full hunt, ${careful ? 'careful' : 'careless'}: escaped without being caught ${pct(clean, rounds.length)}, escaped in the end ${pct(out, rounds.length)}, ${deaths.toFixed(2)} deaths a run`);
  }
  assert.ok(report.careful.clean > 0.5, `careful play should usually get out untouched (${report.careful.clean})`);
  assert.ok(report.careless.clean < report.careful.clean - 0.2, `careless play should do clearly worse (${report.careless.clean})`);
  assert.ok(report.careless.deaths > report.careful.deaths, 'careless play dies more');
  assert.ok(report.careful.out > 0.9, `careful play gets out in the end (${report.careful.out})`);
});

test('the first encounter never kills: he starts 8 m of path away, a torch counts only from the hint, no chase while it lasts', () => {
  const places = [...Object.values(STARTS), [7, 3.5], [0.5, 0.15], [-1.6, 3.3], [-4, 2.5], [12.5, 3.9], [-5.12, 2.0]];
  let noticedEarly = 0;
  for (const at of places) for (const seed of SEEDS.slice(0, 6)) for (const habit of ['torch', 'run']) {
    let caught = false;
    const s = new Stalker({ nav, random: rng(seed), hooks: { caught: () => { caught = true; } } });
    const body = new Body(s, at, { torch: habit === 'torch' });
    s.begin({ from: 'fusebox', tutorial: true, player: body.p, at: FUSEBOX });
    assert.ok(nav.pathDistance(at[0], at[1], s.x, s.z, THROUGH) >= TUTORIAL.spawn - 1e-6, `from ${at}: he starts ${nav.pathDistance(at[0], at[1], s.x, s.z, THROUGH).toFixed(1)} m away`);
    // The worst a first-timer does: the torch on and never off (or running round and round), never hiding.
    const round = [at, [at[0] + 1.5, at[1]], [at[0] - 1.5, at[1]]].filter(q => walk.fits(q[0], q[1], 0.22, walk.floorAt(...q) ?? 0.15));
    let k = 0;
    for (let t = 0; t < TUTORIAL.seconds + 1 && s.tutorial > 0; t += DT) {
      body.p.running = habit === 'run';
      if (habit === 'run' && body.arrived) body.goTo(round[k++ % round.length]);
      body.step(DT, habit === 'run');
      if (habit === 'torch' && t < TUTORIAL.hint + TUTORIAL.torchHeld - 0.2 && s.suspicion > 0) noticedEarly++;
      if (s.tutorial > 0) {
        assert.notEqual(s.state, 'chase', `from ${at} (${habit}, seed ${seed}): a chase in the first encounter at ${t.toFixed(1)} s`);
        assert.equal(caught, false, `from ${at} (${habit}, seed ${seed}): caught in the first encounter`);
        assert.ok(s.suspicion < 1, 'suspicion stays below a chase');
      }
    }
  }
  assert.equal(noticedEarly, 0, 'a torch is not noticed before the hint and 1.5 s of it');
});

test('the windup always precedes a kill: the knife up for 0.45 s, in his sight and reach all along', () => {
  let kills = 0;
  for (const seed of SEEDS.slice(0, 30)) for (const habits of [{ torch: true }, { torch: true, run: true }, { cautious: true }]) {
    let windup = 0, last = 0, ok = true;
    wander(seed, habits, ROUTE_LONG, { seconds: 90, record: (t, s, p) => {
      if (s.state === 'kill') {
        // The strike's own frame ends the windup: the knife was up for every frame before it and this one.
        if (last !== 'killed') { kills++; assert.ok(windup + DT >= SENSES.killWindup - 1e-6, `seed ${seed}: a kill after ${(windup + DT).toFixed(2)} s of windup`); assert.ok(ok, `seed ${seed}: the windup lost sight or reach`); }
        last = 'killed'; return;
      }
      if (s.knife > 0) {
        windup += DT; last = s.knife;
        ok &&= s.seeing && Math.hypot(p.x - s.x, p.z - s.z) < SENSES.killCancel;
      } else { windup = 0; ok = true; last = 0; }
    } });
  }
  console.log(`windup: ${kills} kills checked`);
  assert.ok(kills > 50, 'enough kills to judge');
});

test('the knife comes down again if the player breaks his sight during the windup', () => {
  const s = new Stalker({ nav, random: rng(5), hooks: { caught: () => assert.fail('no strike without sight') } });
  // In the corridor, the player just ahead of him: he winds up; then the player steps through the office opening.
  s.spawn(6.5, 3.5, -90, 'chase');
  s.suspicion = 1;
  const p = { x: 5.6, z: 3.5, crouched: false, running: false, torch: false, moving: false, vx: 0, vz: 0 };
  for (let i = 0; i < 2; i++) s.update(DT, p);
  assert.ok(s.knife > 0, 'the knife is coming up');
  Object.assign(p, { x: 4.6, z: 1.6 });                       // round the office's corner, out of his sight
  s.update(DT, p);
  assert.equal(s.knife, 0, 'out of sight: the knife comes down');
});

test('he never lies in wait (light off) in the corridor or within 4 m of the front door', () => {
  let ambushes = 0;
  const check = (s, why) => {
    assert.ok(!inCorridor(s.x, s.z), `${why}: an ambush in the corridor at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
    assert.ok(Math.hypot(s.x - PLACES.frontDoor[0], s.z - PLACES.frontDoor[1]) >= PLACES.noAmbush, `${why}: an ambush by the front door`);
    ambushes++;
  };
  // Players he keeps hearing and losing (banging doors, but hiding when he comes): searches, and so ambushes, galore.
  for (const seed of SEEDS.slice(0, 30)) for (const difficulty of ['normal', 'hard']) {
    wander(seed, { noisy: true, cautious: true }, ROUTE_LONG, { difficulty, seconds: 120, record: (t, s) => { if (s.state === 'ambush' && s.stateTime <= DT + 1e-9) check(s, `seed ${seed}`); } });
  }
  for (const run of RUNS) for (const seed of SEEDS.slice(0, 4)) {
    escape(seed, { careful: true, ...run, limit: 240, record: (t, s) => { if (s.state === 'ambush' && s.stateTime <= DT + 1e-9) check(s, `escape seed ${seed}`); } });
  }
  // He loses you in the corridor and by the door with the dice always saying "wait": he never does there; he does in a room.
  for (const [x, z, may] of [[3.0, 3.6, false], [8.0, 3.55, false], [12.0, 3.6, false], [12.6, 1.9, false], [-4.2, 1.2, true], [12.6, -0.95, true]]) {
    const s = new Stalker({ nav, random: () => 0 });
    s.spawn(x, z, 0, 'search');
    s.lastSeen = { x, z, vx: 0, vz: 0 };
    s.update(DT, { x: -5, z: 2, crouched: true, torch: false, moving: false });
    assert.equal(s.state === 'ambush', may, `at ${x}, ${z}`);
  }
  console.log(`ambushes checked: ${ambushes}`);
  assert.ok(ambushes > 10, 'enough ambushes to judge');
});

test('after a catch he patrols from the bedroom door, in sight, and cannot catch anyone for 8 s', () => {
  let caughtAt = null;
  const s = new Stalker({ nav, random: rng(9), hooks: { caught: () => { caughtAt ??= s.stateTime; } } });
  // A hunt in mid-strike before the catch: everything about it is forgotten.
  s.spawn(5, 3.5, 0, 'chase'); s.windup = 0.4; s.suspicion = 1; s.lastSeen = { x: 5, z: 3.5, vx: 1, vz: 0 }; s.nextBackstage = true;
  s.respawn({ x: SOFA[0], z: SOFA[1] });
  assert.deepEqual([s.x, s.z], PLACES.respawn, 'at the bedroom door');
  assert.equal(s.state, 'patrol', 'patrolling (not up in the void)');
  assert.equal(s.torch, true, 'his light on');
  assert.equal(s.grace, RESPAWN.grace);
  assert.equal(s.windup, 0); assert.equal(s.suspicion, 0); assert.equal(s.lastSeen, null); assert.equal(s.nextBackstage, false);
  // The player walks straight into him with the torch on: no catch for 8 s.
  let t = 0;
  const body = new Body(s, [10.45, 3.3], { torch: true });
  body.time = 10;
  for (; t < 12 && caughtAt === null; t += DT) { body.step(DT, false); if (t < RESPAWN.grace - DT) assert.equal(s.state === 'kill', false, `caught at ${t.toFixed(1)} s`); }
  assert.ok(caughtAt !== null && t >= RESPAWN.grace - 1e-6, `the grace ends (caught at ${t.toFixed(1)} s)`);
  // A checkpoint that puts the player near the bedroom door: he starts far from them instead.
  s.respawn({ x: 11.4, z: 1.0 });
  assert.ok(nav.pathDistance(11.4, 1.0, s.x, s.z, THROUGH) >= RESPAWN.from, 'never on top of the player');
});

// The bathroom door as doors.js hangs it: hinge (9.1086, 0.390), 0.86 m to the free edge, swung -92 deg into the bathroom.
function bathroom(angle = 0) {
  const g = new WalkGrid(COLLISION), n = new NavGrid(g, SIGHT);
  const door = { angle, open: -92, locked: false, swings: 0 };
  door.segmentAt = (a) => { const r = a * Math.PI / 180; return [9.1086, 0.39, 9.1086 + Math.sin(r) * 0.86, 0.39 + Math.cos(r) * 0.86]; };
  door.segment = () => door.segmentAt(door.angle);
  door.blocker = g.addBlocker(door.segment);
  n.setDoors([door]);
  return { nav: n, door };
}

test('the bathroom is no safe room: his way goes through its door, which he opens, and a player hiding in there is found', () => {
  const { nav: n, door } = bathroom(0);
  const bedroom = [11.1, 1.0], inside = [7.6, -0.6];
  assert.equal(n.path(...bedroom, ...inside), null, 'shut, the door is a wall for sight and for the sounds the player hears');
  assert.ok(n.path(...bedroom, ...inside, THROUGH), 'his own way goes through it');
  assert.ok(n.pathDistance(...bedroom, ...inside, THROUGH) > n.path(...bedroom, ...inside, THROUGH).length, 'a shut door muffles: a little further to his ears');
  door.locked = true;
  assert.equal(n.path(...bedroom, ...inside, THROUGH), null, 'a locked door stays a wall');
  door.locked = false;
  // He hears someone walking in there, comes to the door, opens it (once), waits for it, and goes in after them.
  for (const start of [0, -14]) {
    door.angle = start; door.target = start;
    let opened = 0, caught = false;
    const s = new Stalker({ nav: n, random: rng(3), hooks: {
      openDoor: (d) => { opened++; d.target = d.open; },
      caught: () => { caught = true; },
    } });
    s.spawn(...bedroom, -90, 'patrol');
    const p = { x: 7.2, z: -0.9, crouched: true, torch: false, moving: false, vx: 0, vz: 0, inWardrobe: false };
    s.noise(p.x, p.z, 8, 'run');                               // running in there: heard from the bedroom
    let t = 0, inBathroom = null;
    for (; t < 40 && !caught; t += DT) {
      // doors.js: the leaf swings towards its target at about 100 deg/s.
      if (door.target !== undefined) door.angle += Math.max(-10, Math.min(10, door.target - door.angle));
      s.update(DT, p);
      if (inBathroom === null && s.x < 9.0) inBathroom = t;
    }
    assert.equal(opened, 1, `ajar at ${start} deg: he opens the door once`);
    assert.ok(inBathroom !== null, `ajar at ${start} deg: he goes in`);
    assert.ok(caught, `ajar at ${start} deg: the player hiding at the back is found (in ${t.toFixed(1)} s)`);
  }
});

test('a door held shut against him: he gives up on it for a while and never freezes', () => {
  const { nav: n, door } = bathroom(0);
  let opened = 0;
  const s = new Stalker({ nav: n, random: rng(4), hooks: { openDoor: () => { opened++; } } });   // the door never moves
  s.spawn(11.1, 1.0, -90, 'patrol');
  s.investigate(7.6, -0.6);
  const p = { x: -5, z: 2, crouched: true, torch: false, moving: false };
  let moved = 0, last = [s.x, s.z];
  for (let t = 0; t < 40; t += DT) { s.update(DT, p); moved += Math.hypot(s.x - last[0], s.z - last[1]); last = [s.x, s.z]; }
  assert.ok(opened >= 1, 'he tried the door');
  assert.notEqual(s.state, 'investigate', 'and moved on');
  assert.ok(moved > 8, `he walks on (${moved.toFixed(1)} m)`);
});

test('a way that cannot be found never freezes him (investigate, chase, search)', () => {
  const { nav: n, door } = bathroom(0);
  door.locked = true;                                         // the bathroom cannot be reached
  for (const state of ['investigate', 'chase', 'search']) {
    const s = new Stalker({ nav: n, random: rng(6) });
    s.spawn(11.1, 1.0, -90, 'patrol');
    if (state === 'investigate') s.investigate(7.6, -0.6);
    if (state === 'chase') { s.set('chase'); s.suspicion = 1; s.lastSeen = { x: 7.6, z: -0.6, vx: 0, vz: 0 }; s.sinceSeen = 0.1; }
    if (state === 'search') { s.set('search'); s.searchPlan = { steps: [{ node: { x: 7.6, z: -0.6 }, sweep: 1 }], at: 0 }; }
    const p = { x: 7.6, z: -0.6, crouched: true, torch: false, moving: false };
    let moved = 0, last = [s.x, s.z];
    for (let t = 0; t < 30; t += DT) { s.update(DT, p); moved += Math.hypot(s.x - last[0], s.z - last[1]); last = [s.x, s.z]; }
    assert.ok(s.wait < 1.5, `${state}: not stuck waiting (${s.wait})`);
    assert.ok(moved > 5, `${state}: he moves on (${moved.toFixed(1)} m in 30 s, now ${s.state})`);
  }
});

test('the director counts 25 of the last 60 s close by in seconds, at any frame rate', () => {
  for (const fps of [10, 30, 60, 144]) {
    const s = new Stalker({ nav, random: rng(2) });
    s.spawn(-4.2, 1.2, 0, 'patrol');
    const near = { x: -4.2, z: 4.0 }, far = { x: 12, z: 3.5 }, dt = 1 / fps;
    const run = (seconds, p) => { for (let t = 0; t < seconds - 1e-9; t += dt) { s.time += dt; s.director(dt, p); } };
    run(20, near); run(30, far); run(4, near);
    assert.equal(s.nextBackstage, false, `${fps} fps: 24 s close in 54 s is not enough`);
    run(2, near);
    assert.equal(s.nextBackstage, true, `${fps} fps: 26 s close within 60 s sends him up`);
    s.nextBackstage = false; s.closeLog = []; s.closeSum = 0;
    run(15, near); run(50, far); run(15, near);
    assert.equal(s.nextBackstage, false, `${fps} fps: closeness older than 60 s is forgotten`);
  }
});

test('too long close by: he walks to the wardrobe, opens it and goes up, never vanishing where he stands', () => {
  const events = [];
  const s = new Stalker({ nav, random: rng(8), hooks: { openWardrobe: () => events.push('open'), backstage: (on) => events.push(on ? 'up' : 'down') } });
  s.spawn(4.4, 0.2, 0, 'patrol');
  s.nextBackstage = true;
  const p = { x: -5, z: 2.5, crouched: true, torch: false, moving: false };
  let upAt = null;
  for (let t = 0; t < 40 && upAt === null; t += DT) { s.update(DT, p); if (s.state === 'backstage') upAt = [s.x, s.z]; }
  s.update(DT, p);
  assert.ok(upAt, 'he went up');
  assert.ok(Math.hypot(upAt[0] - 10.25, upAt[1] + 0.15) < 0.6, `from the wardrobe (${upAt})`);
  assert.deepEqual(events.slice(0, 2), ['open', 'up']);
});

test('from the hatch: he comes down in the wardrobe and makes for the front door; holding E for its 3 s wins the race', () => {
  for (const difficulty of ['story', 'normal', 'hard']) for (const seed of SEEDS.slice(0, 10)) {
    const events = [];
    let caughtAt = null;
    const s = new Stalker({ nav, difficulty, random: rng(seed), hooks: { drop: (phase) => events.push(phase), caught: () => { caughtAt = s.time; } } });
    s.begin({ from: 'hatch' });
    assert.equal(s.state, 'drop'); assert.deepEqual([s.x, s.z], PLACES.hatch);
    // story.js: the lock was started 0.6 s before the hunt; E held, it turns in 3 s; the clicks are heard.
    const p = { x: DOOR[0], z: DOOR[1], crouched: false, running: false, torch: false, moving: false, vx: 0, vz: 0 };
    let t = 0;
    for (; t < 10 && caughtAt === null; t += DT) {
      if (Math.floor(t + 0.6 + 1e-4) > Math.floor(t + 0.6 - DT + 1e-4) && t + 0.6 <= 3) s.noise(LOCK[0], LOCK[1], 6, 'unlock');
      s.update(DT, p);
      if (t + 0.6 < 3) assert.ok(Math.hypot(s.x - p.x, s.z - p.z) > SENSES.kill + 0.3, `${difficulty} ${seed}: he is at the door before the lock is turned (${t.toFixed(1)} s)`);
    }
    assert.deepEqual(events.slice(0, 2), ['start', 'land'], 'the hatch, then the landing');
    assert.ok(caughtAt !== null && caughtAt < 7, `${difficulty} ${seed}: a player who stays at the door is caught (${caughtAt})`);
    assert.ok(caughtAt + 0.6 > 3 + 0.6, `${difficulty} ${seed}: the race is winnable by at least 0.6 s (caught ${caughtAt.toFixed(2)} s into the hunt)`);
  }
});

test('the wardrobe is his door: dust at 1 s, down on you at 4 s, a second before he can chase; running at the thump gets away', () => {
  let escapes = 0;
  for (const seed of SEEDS.slice(0, 20)) {
    const events = [];
    let caught = false;
    const s = new Stalker({ nav, random: rng(seed), hooks: { dust: () => events.push(['dust', s.time]), drop: (phase, why) => events.push([`${phase}:${why}`, s.time]), caught: () => { caught = true; } } });
    s.spawn(-4.2, 1.2, 0, 'patrol');
    const body = new Body(s, [10.1, -0.1]);
    body.p.inWardrobe = true; body.p.crouched = true;
    let landed = null, ran = false, caution = null;
    for (let t = 0; t < 25 && !caught; t += DT) {
      // At the thump: out of the bedroom at a run, for the far corner of the office; then as careful as ever.
      if (landed !== null && !ran) { ran = true; caution = new Caution(body); caution.hiding = true; body.goTo([5.9, -1.0], 'hide'); }
      let move = false;
      if (ran) {
        caution.update(DT);
        if (s.time - landed < 3) { body.p.running = true; body.p.crouched = false; }
        move = !(body.leg?.kind === 'hide' && body.arrived) && !(s.time - landed >= 3 && caution.lit());
      }
      body.p.inWardrobe = !ran;
      body.step(DT, move);
      const land = events.find(e => e[0] === 'land:trap');
      if (land && landed === null) landed = land[1];
      if (landed !== null && s.time < landed + WARDROBE.hold - 1e-6) assert.notEqual(s.state, 'chase', `seed ${seed}: a chase within a second of landing`);
    }
    const dust = events.find(e => e[0] === 'dust'), start = events.find(e => e[0] === 'start:trap');
    assert.ok(dust && Math.abs(dust[1] - WARDROBE.dust) < 0.15, `seed ${seed}: dust at 1 s (${dust?.[1]})`);
    assert.ok(start && Math.abs(start[1] - WARDROBE.drop) < 0.15, `seed ${seed}: he comes down at 4 s (${start?.[1]})`);
    assert.ok(landed !== null && Math.abs(landed - WARDROBE.drop - DROP.fall) < 0.15, `seed ${seed}: the landing`);
    if (!caught) escapes++;
  }
  console.log(`wardrobe: ran at the landing and got away ${pct(escapes, 20)}`);
  assert.ok(escapes >= 10, `a near miss you can learn from (${escapes}/20 got away)`);
  // Standing there regardless of the thump: caught.
  let caught = false;
  const s = new Stalker({ nav, random: rng(1), hooks: { caught: () => { caught = true; } } });
  s.spawn(-4.2, 1.2, 0, 'patrol');
  for (let t = 0; t < 10 && !caught; t += DT) s.update(DT, { x: 10.1, z: -0.1, crouched: true, torch: false, moving: false, inWardrobe: true });
  assert.ok(caught, 'staying in the wardrobe is not hiding');
});

test('a tap left running draws him; he turns it off, then looks round', () => {
  const offs = [];
  const s = new Stalker({ nav, random: rng(2), hooks: { tapOff: (x, z) => offs.push([x, z]) } });
  s.spawn(0.5, 0.15, 0, 'patrol');
  const p = { x: 12, z: 3.5, crouched: true, torch: false, moving: false };
  const tap = [-2.6505, -1.0165];                              // taps.js TAPS.kitchen.spout
  let alerts = 0;
  s.hooks.state = (now) => { if (now === 'alert') alerts++; };
  for (let t = 0; t < 30 && !offs.length; t += DT) {
    if (Math.abs(t % 2) < DT / 2) s.noise(...tap, 7, 'tap');   // a running tap is heard every 2 s (taps.js)
    s.update(DT, p);
  }
  assert.equal(offs.length, 1, 'he turned it off');
  assert.equal(alerts, 1, 'one alert: a tap that keeps running does not stop him on his way to it');
  assert.equal(s.state, 'search', 'and looks round');
});

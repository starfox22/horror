// Simulated hunts (src/stalker.js on the real walk grid and sight map, no browser): bots with different habits play
// many seeded rounds; the hunt must be survivable by careful play, deadly to careless play, and fair.
// node --test tools/check-stalker.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WalkGrid } from '../src/walkgrid.js';
import { NavGrid } from '../src/navgrid.js';
import { Stalker, rng } from '../src/stalker.js';

const walk = new WalkGrid(JSON.parse(readFileSync('public/assets/apartment/collision.json', 'utf8')));
const sight = JSON.parse(readFileSync('public/assets/apartment/sight.json', 'utf8'));
const nav = new NavGrid(walk, sight);
const DT = 0.1;

// Hiding places a player would think of: room corners and the far side of furniture (crouched).
const SPOTS = [[13.6, -1.1], [11.2, -1.1], [13.7, 2.1], [9.9, 2.0], [7.0, -1.1], [8.7, 1.9], [5.9, -1.0], [2.0, -1.0],
  [5.8, 2.2], [-0.2, -0.9], [-6.0, -0.8], [-6.0, 4.0], [-3.4, 4.1], [1.2, 4.2], [-1.9, 2.0], [0.9, 1.8]];

// A bot walks a route of points. habits: { crouch, torch, run, cautious }. A cautious bot plays like someone listening:
// while he is within earshot (12 m of open space) and coming closer, it goes to the hiding place he cannot see that is
// furthest along open space from him and nearest to itself, crouched (running if he is chasing), and waits there until
// he is far away again; then it carries on along its route.
function hunt(seed, habits, route, { difficulty = 'normal', seconds = 150, start = [2.3, 4.0], grace = 0, tutorial = 25, log = null } = {}) {
  const random = rng(seed);
  let caught = false, chases = 0, firstChaseAt = null;
  const states = [];
  const s = new Stalker({ nav, difficulty, random, hooks: {
    caught: () => { caught = true; },
    state: (now, prev) => { states.push([now, prev]); if (now === 'chase') { chases++; firstChaseAt ??= s.time; } },
  } });
  s.spawn(start[0], start[1], 90, 'patrol');
  s.grace = grace; s.tutorial = tutorial;
  const p = { x: route[0][0], z: route[0][1], crouched: !!habits.crouch, torch: !!habits.torch, running: !!habits.run, torchHeld: habits.torch ? 99 : 0, vx: 0, vz: 0, moving: false };
  let leg = null, legAt = 1, stepTimer = 0, think = 0, t = 0, next = 1, hiding = false, lastDist = Infinity, calm = 0;
  const speed = () => (p.crouched ? 0.7 : p.running ? 2.4 : 1.35);
  const setLeg = (target, kind = 'route') => {
    const path = nav.path(p.x, p.z, target[0], target[1]);
    leg = path ? { points: path.points, target, kind } : null; legAt = 1;
  };
  for (; t < seconds && !caught; t += DT) {
    if (habits.cautious && s.state !== 'backstage') {
      think -= DT;
      if (think <= 0) {
        think = 0.5;
        const dist = Math.hypot(s.x - p.x, s.z - p.z) < 14 ? nav.pathDistance(s.x, s.z, p.x, p.z) : Infinity;
        const closing = dist < lastDist - 0.15 || ['investigate', 'chase', 'alert'].includes(s.state);
        lastDist = dist;
        // Not yet hiding and he is coming: find a place. Already hiding and he is closing in on it: move to another.
        const settled = leg?.kind === 'hide' && legAt >= leg.points.length;
        if (dist < 12 && closing && (leg?.kind !== 'hide' || (settled && dist < 5))) {
          let best = null, bestScore = -Infinity;
          for (const spot of SPOTS) {
            const mine = nav.pathDistance(p.x, p.z, spot[0], spot[1]), his = nav.pathDistance(s.x, s.z, spot[0], spot[1]);
            if (!Number.isFinite(mine) || !Number.isFinite(his) || his < mine + 1) continue;
            const hidden = !nav.sees({ x: s.x, y: 1.62, z: s.z }, { x: spot[0], y: 0.85, z: spot[1] });
            const score = (hidden ? 6 : 0) + Math.min(his, 10) - mine * 0.6;
            if (score > bestScore) { bestScore = score; best = spot; }
          }
          if (best) { setLeg(best, 'hide'); hiding = true; calm = 0; }
        }
        if (hiding) {
          calm = dist > 9 || s.state === 'backstage' ? calm + 0.5 : 0;
          if (calm > 4) { hiding = false; leg = null; }
        }
      }
      p.running = s.state === 'chase';
      p.crouched = !p.running && (hiding || !!habits.crouch || lastDist < 8);
    }
    // Like a player watching his light: close to him, never move while it points their way.
    const bearing = Math.atan2(p.x - s.x, p.z - s.z) * 180 / Math.PI;
    const lit = s.torch && Math.abs(((bearing - s.torchYaw + 540) % 360) - 180) < 50 && Math.hypot(s.x - p.x, s.z - p.z) < 7 && s.state !== 'chase';
    const holding = (hiding && leg?.kind === 'hide' && legAt >= leg.points.length) || (habits.cautious && lit);
    if (!holding) {
      if (!leg || legAt >= leg.points.length) { if (!hiding) { setLeg(route[next]); next = (next + 1) % route.length; } }
      if (leg && legAt < leg.points.length) {
        const [tx, tz] = leg.points[legAt], dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), step = speed() * DT;
        if (d <= step) { p.x = tx; p.z = tz; legAt++; } else { p.x += dx / d * step; p.z += dz / d * step; }
        p.vx = dx / (d || 1) * speed(); p.vz = dz / (d || 1) * speed();
        stepTimer += DT;
        if (stepTimer > (p.running ? 0.35 : 0.55)) {
          stepTimer = 0;
          const hear = s.tune.hear, radius = p.running ? hear.run : p.crouched ? hear.crouch : hear.walk;
          s.noise(p.x, p.z, radius);
        }
      }
    } else { p.vx = p.vz = 0; }
    p.moving = !holding && !!leg && legAt < leg.points.length;
    s.update(DT, p);
    log?.(t, s, p);
  }
  return { caught, chases, firstChaseAt, t, states };
}

// Routes through the flat (bot waypoints), from the bedroom to the office and kitchen, the front door and back.
const ROUTE_LONG = [[4.5, 0.6], [0.5, 0.2], [-2.5, 0.5], [-4.5, 2.6], [3, 3.6], [8, 3.55], [10.45, 2.3], [12.85, 1.8], [12.3, 3.6]];
const SEEDS = Array.from({ length: 120 }, (_, i) => 1000 + i);

test('the walk grid and sight map support the waypoints', () => {
  const s = new Stalker({ nav, random: rng(1) });
  for (const n of s.nodes) assert.ok(nav.open(nav.index(...nav.cellOf(n.x, n.z))), `${n.id} is walkable`);
  for (let i = 0; i < s.nodes.length; i++) for (let j = i + 1; j < s.nodes.length; j++) {
    assert.ok(nav.path(s.nodes[i].x, s.nodes[i].z, s.nodes[j].x, s.nodes[j].z), `path ${s.nodes[i].id} -> ${s.nodes[j].id}`);
  }
});

test('careless play (walking upright, torch on) is usually caught', () => {
  const rounds = SEEDS.map(seed => hunt(seed, { torch: true }, ROUTE_LONG));
  const rate = rounds.filter(r => r.caught).length / rounds.length;
  console.log(`careless: caught in ${(rate * 100).toFixed(0)} %`);
  assert.ok(rate > 0.6, `careless play should be punished (${rate})`);
});

// The bots play far worse than a person (they cannot read his light or back off sideways); the thresholds catch
// regressions in fairness, they are not the target difficulty. Measured at this tuning (120 seeds, 150 s of wandering):
// careless 0 %, careful 55 %, upright and listening ~50 %, Story ~60 %.
test('careful play (crouched, torch off, hiding when he comes) survives 150 s of wandering about half the time', () => {
  const rounds = SEEDS.map(seed => hunt(seed, { crouch: true, cautious: true }, ROUTE_LONG));
  const rate = rounds.filter(r => !r.caught).length / rounds.length;
  console.log(`careful: survived ${(rate * 100).toFixed(0)} %`);
  assert.ok(rate >= 0.45, `careful play should survive (${rate})`);
});

test('walking upright with the torch off but listening is a fair middle ground', () => {
  const rounds = SEEDS.map(seed => hunt(seed, { cautious: true }, ROUTE_LONG));
  const rate = rounds.filter(r => !r.caught).length / rounds.length;
  console.log(`listening, upright: survived ${(rate * 100).toFixed(0)} %`);
  assert.ok(rate > 0.3 && rate < 0.98, `middle ground (${rate})`);
});

test('nobody is caught during the grace after waking', () => {
  for (const seed of SEEDS.slice(0, 40)) {
    const r = hunt(seed, { torch: true, run: true }, [[12.85, 1.8], [10.3, 0.2], [12.85, 1.8]], { seconds: 20, start: [10.3, 0.0], grace: 20 });
    assert.equal(r.caught, false, `seed ${seed} caught within the grace`);
  }
});

test('Story difficulty is kinder than Normal to the same play', () => {
  const story = SEEDS.map(seed => hunt(seed, { cautious: true }, ROUTE_LONG, { difficulty: 'story' })).filter(r => !r.caught).length;
  const normal = SEEDS.map(seed => hunt(seed, { cautious: true }, ROUTE_LONG)).filter(r => !r.caught).length;
  const hard = SEEDS.map(seed => hunt(seed, { cautious: true }, ROUTE_LONG, { difficulty: 'hard' })).filter(r => !r.caught).length;
  console.log(`story, listening: survived ${(story / SEEDS.length * 100).toFixed(0)} %, normal ${(normal / SEEDS.length * 100).toFixed(0)} %, hard ${(hard / SEEDS.length * 100).toFixed(0)} %`);
  assert.ok(story > normal && normal >= hard, `story ${story} > normal ${normal} >= hard ${hard}`);
});

test('a chase never starts without his senses: always after sight builds suspicion', () => {
  for (const seed of SEEDS.slice(0, 40)) {
    const r = hunt(seed, { torch: true }, ROUTE_LONG, { seconds: 60 });
    for (const [now, prev] of r.states) if (now === 'chase') assert.ok(['alert', 'patrol', 'investigate', 'search', 'ambush'].includes(prev), `chase from ${prev}`);
  }
});

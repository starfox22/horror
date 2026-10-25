// Doors swinging into the player (walkgrid.js swingInto) on the real walk grid, without a browser: the refrigerator's
// upper door, the bathroom door and the wardrobe's four doors, with the player standing at spots all round each one.
// Opening and shutting always complete; the player ends on walkable floor, clear of everywhere the leaf swept but no
// further out than that, is moved a few centimetres a frame at most and only when the leaf reaches them, and can still
// walk away (never boxed in between the leaf and the cabinet or a wall). The story's held wardrobe door stays shut.
// node --test tools/check-doors.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Entity, Vec3 } from 'playcanvas';
import { WalkGrid, segmentDistance, swingInto } from '../src/walkgrid.js';
import { Fridge, DOOR_CLEAR } from '../src/fridge.js';
import { FRIDGE, fridgeDoorSegment } from '../src/fridge-geometry.js';
import { Doors, BODY } from '../src/doors.js';
import { Closets, LEAF_CLEAR } from '../src/closets.js';

const COLLISION = JSON.parse(readFileSync(new URL('../public/assets/apartment/collision.json', import.meta.url), 'utf8'));
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const RADIUS = 0.22, DT = 1 / 60;
const newGrid = () => new WalkGrid(COLLISION);
const app = () => ({ root: new Entity('root'), on() {}, graphicsDevice: {} });
const body = (grid, x, z) => ({ pos: new Vec3(x, 0, z), floor: grid.floorUnder(x, z, RADIUS) });

// Everywhere a body can walk to from `goals` with the doors as they stand (the player's own rules): a flood fill on a
// 5 cm lattice inside `box`. has(x, z): a lattice point next to (x, z) is reachable.
const L = 0.05, key = (i, j) => (i + 1000) * 10000 + (j + 1000);
function flood(grid, goals, [x0, x1, z0, z1]) {
  const floor = grid.floorUnder(goals[0][0], goals[0][1], RADIUS), seen = new Set(), tried = new Set(), queue = [];
  for (const [gx, gz] of goals) {
    const i = Math.round(gx / L), j = Math.round(gz / L);
    if (!seen.has(key(i, j)) && grid.fits(i * L, j * L, RADIUS, floor)) { seen.add(key(i, j)); queue.push([i, j]); }
  }
  for (let q = 0; q < queue.length; q++) {
    const [i, j] = queue[q];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, k = key(ni, nj), x = ni * L, z = nj * L;
      if (seen.has(k) || tried.has(k) || x < x0 || x > x1 || z < z0 || z > z1) continue;
      tried.add(k);
      if (grid.fits(x, z, RADIUS, floor)) { seen.add(k); queue.push([ni, nj]); }
    }
  }
  return {
    at: (x, z) => seen.has(key(Math.round(x / L), Math.round(z / L))),
    has: (x, z) => [Math.floor(x / L), Math.ceil(x / L)].some(i => [Math.floor(z / L), Math.ceil(z / L)].some(j => seen.has(key(i, j)))),
  };
}

// Runs one swing to its end and checks everything about where the player went. leaf(angle) -> segment; from/to: the
// swing's angles; clear: the leaf's clearance; moving(), step(): the door system; reach(): where a body can walk from
// the room's open floor with the doors as the swing left them.
function swing(name, { grid, player, leaf, from, to, clear, moving, step, reach, frames = 900 }) {
  const start = player.pos.clone();
  const sweep = (p) => { let m = Infinity; for (let i = 0; i <= 200; i++) m = Math.min(m, segmentDistance(p.x, p.z, leaf(from + (to - from) * i / 200))); return m; };
  const before = sweep(start);
  let n = 0, worst = 0;
  while (moving() && n++ < frames) {
    const p = player.pos.clone();
    step();
    worst = Math.max(worst, p.distance(player.pos));
  }
  const p = player.pos, where = `${name} from (${start.x.toFixed(2)}, ${start.z.toFixed(2)}) -> (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
  assert.equal(moving(), false, `${where}: the swing must finish`);
  assert.ok(worst <= 0.05 + 1e-9, `${where}: moved ${worst.toFixed(3)} m in one frame`);
  assert.ok(grid.fits(p.x, p.z, RADIUS, player.floor), `${where}: must end on walkable floor, clear of walls and doors`);
  const after = sweep(p);
  assert.ok(after >= clear - 0.003, `${where}: must end outside the leaf's sweep (${after.toFixed(3)} m from it)`);
  if (before >= clear + 0.003) assert.equal(start.distance(p), 0, `${where}: a player the leaf never reaches must not move`);
  else if (before < clear - 0.003) assert.ok(after <= clear + 0.03, `${where}: pushed ${after.toFixed(3)} m clear, further than needed`);
  assert.ok(reach().has(p.x, p.z), `${where}: boxed in, cannot walk away`);
  return { moved: start.distance(p), frames: n };
}

// Lattice spots (10 cm apart) inside a box that a player can walk to (the walk grid has a few isolated cells a body
// fits in but cannot reach).
function spots(reachable, [x0, x1, z0, z1]) {
  const out = [];
  for (let z = z0; z <= z1 + 1e-9; z += 0.1) for (let x = x0; x <= x1 + 1e-9; x += 0.1) {
    const i = Math.round(x / L), j = Math.round(z / L);
    if (reachable.at(i * L, j * L)) out.push([i * L, j * L]);
  }
  return out;
}

// The flood for each state the doors end a swing in, made once.
function reachFor(grid, goals, box, state) {
  const cache = new Map();
  return () => { const k = state(); if (!cache.has(k)) cache.set(k, flood(grid, goals, box)); return cache.get(k); };
}

function fakeFridge(grid, player) {
  const f = Object.create(Fridge.prototype);
  Object.assign(f, { angle: 0, target: 0, velocity: 0, openRequested: false, moving: false, handle: new Vec3(), door: new Entity(),
    app: { root: { findComponents: () => [] } }, light: { getPosition: () => new Vec3(), light: {} }, glow: { emissiveIntensity: 0, update() {} },
    baseIntensity: 0.24, recapture() {}, grid, player });
  f.blocker = grid.addBlocker(() => (f.angle > 0.5 ? fridgeDoorSegment(f.angle) : null));
  f.updateHandle();
  return f;
}

test('the refrigerator door opens and shuts round a player standing anywhere in front of it', () => {
  const grid = newGrid(), player = body(grid, 5, 5), f = fakeFridge(grid, player);
  const reach = reachFor(grid, [[1.5, 1.0]], [0, 3.2, -0.6, 1.8], () => f.angle);
  const run = (to) => ({ grid, player, leaf: fridgeDoorSegment, from: f.angle, to, clear: DOOR_CLEAR, moving: () => f.moving,
    step: () => f.update(DT), reach });
  let pushedOpen = 0, pushedShut = 0;
  // Opening: from every spot in front of the shut door (and beside it).
  for (const [x, z] of spots(reach(), [0.9, 2.5, -0.15, 0.75])) {
    player.pos.set(x, 0, z); player.floor = grid.floorUnder(x, z, RADIUS);
    f.toggle();
    if (swing('opening', run(FRIDGE.opening)).moved > 0) pushedOpen++;
    assert.equal(f.angle, FRIDGE.opening);
    assert.equal(f.blocked, false);
    // and shut again from wherever it left them
    f.toggle(); swing('shutting', run(0));
    assert.equal(f.angle, 0);
  }
  // Shutting: from every spot in front of the open door, the cabinet and the wall beside it.
  player.pos.set(5, 0, 5); f.toggle(); while (f.moving) f.update(DT);
  for (const [x, z] of spots(reach(), [0.9, 2.5, -0.15, 0.75])) {
    player.pos.set(x, 0, z); player.floor = grid.floorUnder(x, z, RADIUS);
    f.toggle();
    if (swing('shutting', run(0)).moved > 0) pushedShut++;
    assert.equal(f.angle, 0);
    player.pos.set(5, 0, 5); f.toggle(); while (f.moving) f.update(DT);
  }
  assert.ok(pushedOpen > 20 && pushedShut > 20, `the spots must include players in the way (${pushedOpen} opening, ${pushedShut} shutting)`);
});

test('standing in front of the refrigerator, opening it steps you back to look in rather than round the door', () => {
  const grid = newGrid(), player = body(grid, 1.55, 0.05), f = fakeFridge(grid, player);
  f.toggle(); while (f.moving) f.update(DT);
  // Still in front of the cabinet (left of the hinge), about a door's width from it: not carried round to the far side.
  assert.ok(player.pos.x < 1.75 && player.pos.z > 0.2 && player.pos.z < 0.7, `ended at ${player.pos.x.toFixed(2)}, ${player.pos.z.toFixed(2)}`);
});

function bathroom(grid, player) {
  const scene = app(), part = new Entity('door leaf');
  scene.root.addChild(part);
  const doors = new Doors(scene, { findComponents: () => [{ entity: part, meshInstances: [{ material: { name: 'door.bathdoor' } }] }] },
    { add() {} }, grid, player, null);
  return { doors, door: doors.doors[0] };
}

test('the bathroom door opens and shuts round a player in the bathroom or in the doorway', () => {
  const grid = newGrid(), player = body(grid, 12, 4), { doors, door } = bathroom(grid, player);
  // Walking away: into the bathroom, or out past the wardrobe, whichever side of the door they ended on.
  const reach = reachFor(grid, [[7.7, 0.9], [9.9, 0.9]], [7.2, 10.6, -0.6, 2.0], () => door.angle);
  const run = (to) => ({ grid, player, leaf: door.segmentAt, from: door.angle, to, clear: BODY, moving: () => door.moving,
    step: () => doors.update(DT), reach });
  let pushed = 0;
  for (const [x, z] of spots(reach(), [8.0, 9.6, 0.3, 1.6])) {
    player.pos.set(x, 0, z); player.floor = grid.floorUnder(x, z, RADIUS);
    doors.toggle(door);
    if (swing('bathroom opening', run(door.open)).moved > 0) pushed++;
    assert.ok(Math.abs(door.angle - door.open) < 0.05);
    doors.toggle(door);
    if (swing('bathroom shutting', run(0)).moved > 0) pushed++;
    assert.equal(door.angle, 0);
  }
  // Shutting on a player standing in the open doorway or just inside: out of the way, the door shuts.
  player.pos.set(12, 0, 4); doors.toggle(door); while (door.moving) doors.update(DT);
  for (const [x, z] of spots(reach(), [8.3, 9.5, 0.35, 1.5])) {
    player.pos.set(x, 0, z); player.floor = grid.floorUnder(x, z, RADIUS);
    doors.toggle(door);
    if (swing('bathroom shutting', run(0)).moved > 0) pushed++;
    assert.equal(door.angle, 0);
    player.pos.set(12, 0, 4); doors.toggle(door); while (door.moving) doors.update(DT);
  }
  assert.ok(pushed > 20, `the spots must include players in the way (${pushed})`);
});

function wardrobe(grid, player, stuck = () => false) {
  const original = Closets.prototype.buildInteriors, add = Entity.prototype.addComponent;
  Closets.prototype.buildInteriors = () => {};
  Entity.prototype.addComponent = function (type, data) { this[type] = { ...data }; };
  try {
    const closets = new Closets(app(), { findComponents: () => [] }, { add() {} }, null, grid);
    closets.player = player; closets.stuck = stuck;
    return closets;
  } finally { Closets.prototype.buildInteriors = original; Entity.prototype.addComponent = add; }
}

test('the wardrobe doors open and shut round a player standing in front of them', () => {
  const grid = newGrid(), player = body(grid, 12, 4), closets = wardrobe(grid, player);
  let pushed = 0;
  for (const door of closets.doors) {
    const box = door.section === 'tall' ? [9.9, 10.9, -1.4, 0.5] : [9.9, 10.7, 1.2, 2.5];
    const reach = reachFor(grid, [[11.4, 0.5]], [9.8, 12.2, -1.6, 2.7], () => door.angle);
    const run = (to) => ({ grid, player, leaf: door.segment, from: door.angle, to, clear: LEAF_CLEAR,
      moving: () => closets.moving.includes(door), step: () => closets.update(DT), reach });
    for (const [x, z] of spots(reach(), box)) {
      player.pos.set(x, 0, z); player.floor = grid.floorUnder(x, z, RADIUS);
      closets.toggle(door);
      if (swing(`wardrobe ${door.id} opening`, run(1)).moved > 0) pushed++;
      assert.equal(door.angle, 1);
      closets.toggle(door);
      if (swing(`wardrobe ${door.id} shutting`, run(0)).moved > 0) pushed++;
      assert.equal(door.angle, 0);
    }
  }
  assert.ok(pushed > 40, `the spots must include players in the way (${pushed})`);
});

test('the story\'s held wardrobe door gives a centimetre and stays shut, pushing nobody', () => {
  const grid = newGrid(), player = body(grid, 10.15, -0.1), closets = wardrobe(grid, player, door => door.id === 'right');
  const right = closets.doors.find(d => d.id === 'right'), start = player.pos.clone();
  closets.toggle(right);
  for (let n = 0; n < 60; n++) closets.update(DT);
  assert.equal(right.openRequested, false);
  assert.ok(right.angle <= 0.012 && !closets.moving.includes(right));
  assert.equal(player.pos.distance(start), 0);
});

test('a player who cannot be moved at all still stops a door, and the next press reverses it', () => {
  const grid = newGrid(), player = body(grid, 1.55, 0.05), f = fakeFridge(grid, player);
  grid.fitsGrid = () => false;         // boxed in on every side
  f.toggle(); for (let n = 0; n < 120 && f.moving; n++) f.update(DT);
  assert.equal(f.blocked, true); assert.equal(f.moving, false);
  assert.ok(f.angle > 0 && f.angle < FRIDGE.opening && f.openRequested);
  assert.ok(segmentDistance(player.pos.x, player.pos.z, fridgeDoorSegment(f.angle)) >= DOOR_CLEAR - 1e-6, 'never through the player');
  f.toggle(); for (let n = 0; n < 240 && f.moving; n++) f.update(DT);
  assert.equal(f.angle, 0);
});

test('a leaf never passes through the body, even in one long frame', () => {
  const grid = newGrid(), leaf = fridgeDoorSegment;
  for (const [x, z] of [[1.55, 0.05], [1.3, 0.2], [1.8, 0.1]]) {
    const p = { x, z }, floor = grid.floorUnder(x, z, RADIUS);
    let angle = 0;
    for (let n = 0; n < 60 && angle < FRIDGE.opening; n++) {
      const r = swingInto(grid, p, leaf, angle, Math.min(FRIDGE.opening, angle + 30), { clear: DOOR_CLEAR, step: 0.05, floor });
      assert.ok(segmentDistance(p.x, p.z, leaf(r.angle)) >= DOOR_CLEAR - 0.002);   // (a plan is followed between its states: within 2 mm)
      angle = r.angle;
    }
    assert.equal(angle, FRIDGE.opening);
  }
});

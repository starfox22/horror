// Which rooms can the player walk to from the spawn? Flood-fills the walk grid with the same rules as the game
// (src/walkgrid.js fits(): body radius, step height) and reports each named spot as reachable or not.
// Usage: node tools/check-reach.mjs [public/assets/apartment/collision.json]
import { readFileSync } from 'node:fs';
import { WalkGrid } from '../src/walkgrid.js';

globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const grid = new WalkGrid(JSON.parse(readFileSync(process.argv[2] || 'public/assets/apartment/collision.json', 'utf8')));
const RADIUS = 0.22;
const SPAWN = [13.0, 3.55];
const SPOTS = { 'living room': [-3.0, 1.6], kitchen: [-1.0, 0.2], 'dining table side': [0.2, 0.3], office: [3.6, 0.0],
  corridor: [6.0, 3.6], bathroom: [7.7, 0.4], bedroom: [11.5, 1.0], 'entrance door': [12.8, 4.0] };

const { w, h, cell, x0, z0 } = grid;
const centre = (i, j) => [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell];
const seen = new Uint8Array(w * h);
const floorOf = new Float32Array(w * h);
const start = [Math.floor((SPAWN[0] - x0) / cell), Math.floor((SPAWN[1] - z0) / cell)];
const queue = [start];
seen[start[1] * w + start[0]] = 1;
floorOf[start[1] * w + start[0]] = grid.floorUnder(...SPAWN, RADIUS);
let count = 0;
while (queue.length) {
  const [i, j] = queue.pop();
  count++;
  const from = floorOf[j * w + i];
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di, nj = j + dj, k = nj * w + ni;
    if (ni < 0 || nj < 0 || ni >= w || nj >= h || seen[k]) continue;
    const [x, z] = centre(ni, nj);
    if (!grid.fits(x, z, RADIUS, from)) continue;
    seen[k] = 1; floorOf[k] = grid.floorUnder(x, z, RADIUS); queue.push([ni, nj]);
  }
}
console.log(`reachable area ${(count * cell * cell).toFixed(1)} m²`);
let ok = true;
for (const [name, [x, z]] of Object.entries(SPOTS)) {
  // a spot counts when any cell within 0.4 m of it was reached
  let hit = false;
  for (let dz = -0.4; dz <= 0.4 && !hit; dz += cell) for (let dx = -0.4; dx <= 0.4 && !hit; dx += cell) {
    const k = grid.index(x + dx, z + dz); if (k >= 0 && seen[k]) hit = true;
  }
  ok &&= hit;
  console.log(`${hit ? 'ok     ' : 'BLOCKED'} ${name} (${x}, ${z})`);
}
process.exit(ok ? 0 : 1);

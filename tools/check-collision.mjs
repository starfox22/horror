// Writes a picture of the walk grid (white walkable, black blocked, pink = raised floor) for checking the pipeline.
// Usage: node tools/check-collision.mjs [out.png]
import { readFileSync } from 'node:fs';
import { collisionImage } from './collision.mjs';
const col = JSON.parse(readFileSync('public/assets/apartment/collision.json', 'utf8'));
await collisionImage(col, process.argv[2] || 'assets-src/collision.png');
console.log(`grid ${col.w}x${col.h} cells of ${col.cell} m, origin ${col.x0.toFixed(2)}, ${col.z0.toFixed(2)}`);

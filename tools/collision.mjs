// Walk grid for the first-person controller, baked from the final geometry (world space, Y up, metres).
// A cell is blocked when any surface passes through the body band (0.25-1.9 m above the lowest floor); its floor height
// is the highest upward-facing surface below 0.5 m. Cells with no floor are blocked too (outside the walls).
import sharp from 'sharp';

export const CELL = 0.05;
const BAND = [0.25, 1.9];
const FLOOR_MAX = 0.5;
const NO_FLOOR = 255;

export function buildCollision(doc, bounds) {
  const x0 = bounds.min[0] - 0.2, z0 = bounds.min[2] - 0.2;
  const w = Math.ceil((bounds.max[0] + 0.2 - x0) / CELL), h = Math.ceil((bounds.max[2] + 0.2 - z0) / CELL);
  const blocked = new Uint8Array(w * h);
  const floorCm = new Uint8Array(w * h).fill(NO_FLOOR);
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], p = [0, 0, 0];
  const mark = (x, y, z, up) => {
    const i = Math.floor((x - x0) / CELL), j = Math.floor((z - z0) / CELL);
    if (i < 0 || j < 0 || i >= w || j >= h) return;
    const k = j * w + i;
    if (y > BAND[0] && y < BAND[1]) blocked[k] = 1;
    if (up && y < FLOOR_MAX) { const cm = Math.max(0, Math.round(y * 100)); if (floorCm[k] === NO_FLOOR || cm > floorCm[k]) floorCm[k] = cm; }
  };
  for (const node of doc.getRoot().listScenes()[0].listChildren()) {
    node.traverse(n => {
      const mesh = n.getMesh(); if (!mesh) return;
      const m = n.getWorldMatrix();
      const tf = (src, out) => { const [x, y, z] = src;
        out[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[2] = m[2] * x + m[6] * y + m[10] * z + m[14]; };
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== 4) continue;
        const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
        const count = idx ? idx.getCount() : pos.getCount();
        const v = [], e = [0, 0, 0];
        const get = (k, out) => { pos.getElement(idx ? idx.getScalar(k) : k, e); tf(e, out); };
        for (let t = 0; t < count; t += 3) {
          get(t, a); get(t + 1, b); get(t + 2, c);
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const up = ny > 0.7 * Math.hypot(nx, ny, nz);
          const edge = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]));
          const n = Math.max(1, Math.ceil(edge / (CELL * 0.5)));
          for (let s = 0; s <= n; s++) for (let r = 0; r <= n - s; r++) {
            const fs = s / n, fr = r / n;
            p[0] = a[0] + ux * fs + vx * fr; p[1] = a[1] + uy * fs + vy * fr; p[2] = a[2] + uz * fs + vz * fr;
            mark(p[0], p[1], p[2], up);
          }
        }
      }
    });
  }
  for (let k = 0; k < w * h; k++) if (floorCm[k] === NO_FLOOR) blocked[k] = 1;
  return { cell: CELL, x0, z0, w, h, noFloor: NO_FLOOR,
    blocked: Buffer.from(blocked).toString('base64'), floorCm: Buffer.from(floorCm).toString('base64') };
}

// Debug picture: white = walkable, black = blocked, red tint = raised floor. Used by tools/check-collision.mjs.
export async function collisionImage(col, path) {
  const blocked = Buffer.from(col.blocked, 'base64'), floor = Buffer.from(col.floorCm, 'base64');
  const rgb = Buffer.alloc(col.w * col.h * 3);
  for (let k = 0; k < col.w * col.h; k++) {
    const free = !blocked[k], f = floor[k] === col.noFloor ? 0 : floor[k];
    rgb[k * 3] = free ? 255 : 0; rgb[k * 3 + 1] = free ? 255 - Math.min(200, f * 8) : 0; rgb[k * 3 + 2] = free ? 255 - Math.min(200, f * 8) : 0;
  }
  await sharp(rgb, { raw: { width: col.w, height: col.h, channels: 3 } }).png().toFile(path);
}

// Bakes public/assets/apartment/sight.json from the built apartment (public/assets/apartment/scene.gltf): for every cell
// of the walk grid (collision.json, same origin and 5 cm cells) the height of the tallest thing standing in it, in cm
// above 0.25 m and below 2.2 m (0 = nothing). The intruder's eyes (stalker.js, navgrid.js) trace sight lines over this
// height field: a wall or wardrobe hides you; a sofa, bed or counter hides you only while you crouch.
// Moving parts (doors, wardrobe doors, the fridge door) are left out: the game adds them as they move.
// Usage: node tools/sight-grid.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const DIR = 'public/assets/apartment';
const SKIP = /\.(bathdoor|wardrobe-\w+|laptoplid)$|^Prop_flashlight|^Glass|WindowGlass|curtain|97\.001|Plain_Natural_Sheer/;
const col = JSON.parse(readFileSync(`${DIR}/collision.json`, 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(`${DIR}/scene.gltf`);
const top = new Uint8Array(col.w * col.h);
const floor = Uint8Array.from(Buffer.from(col.floorCm, 'base64'));
const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], e = [0, 0, 0];
const mark = (x, y, z) => {
  const i = Math.floor((x - col.x0) / col.cell), j = Math.floor((z - col.z0) / col.cell);
  if (i < 0 || j < 0 || i >= col.w || j >= col.h) return;
  const k = j * col.w + i, f = floor[k] === col.noFloor ? 0.16 : floor[k] / 100;
  const h = y - f;                      // height above this cell's floor
  if (h < 0.25 || h > 2.2) return;
  const cm = Math.min(254, Math.round(h * 100));
  if (cm > top[k]) top[k] = cm;
};
let triangles = 0;
for (const node of doc.getRoot().listScenes()[0].listChildren()) node.traverse(n => {
  const mesh = n.getMesh(); if (!mesh) return;
  const m = n.getWorldMatrix();
  const tf = (s, out) => { out[0] = m[0] * s[0] + m[4] * s[1] + m[8] * s[2] + m[12]; out[1] = m[1] * s[0] + m[5] * s[1] + m[9] * s[2] + m[13]; out[2] = m[2] * s[0] + m[6] * s[1] + m[10] * s[2] + m[14]; };
  for (const prim of mesh.listPrimitives()) {
    const name = prim.getMaterial()?.getName() || '';
    if (prim.getMode() !== 4 || SKIP.test(name.replace(/@\w+$/, ''))) continue;
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), count = idx ? idx.getCount() : pos.getCount();
    const get = (k, out) => { pos.getElement(idx ? idx.getScalar(k) : k, e); tf(e, out); };
    for (let t = 0; t < count; t += 3) {
      get(t, a); get(t + 1, b); get(t + 2, c); triangles++;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const edge = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]));
      const steps = Math.max(1, Math.ceil(edge / (col.cell * 0.5)));
      for (let s = 0; s <= steps; s++) for (let r = 0; r <= steps - s; r++) {
        const fs = s / steps, fr = r / steps;
        mark(a[0] + ux * fs + vx * fr, a[1] + uy * fs + vy * fr, a[2] + uz * fs + vz * fr);
      }
    }
  }
});
writeFileSync(`${DIR}/sight.json`, JSON.stringify({ cell: col.cell, x0: col.x0, z0: col.z0, w: col.w, h: col.h,
  topCm: Buffer.from(top).toString('base64') }));
console.log(`sight.json: ${col.w}x${col.h} cells from ${triangles} triangles`);

// Checks the mask's fit (build.mjs) through his clips: every tenth of a second of each clip the game plays (and the
// head turns the story adds on top: looking up into the camera, down at you), his skinned face (the balaclava) and hood
// against the mask, in the head bone's space where the mask is fixed. Prints per clip: the face's and the hood's closest
// approach behind the mask (mm), how many face vertices stand in front of it (poking through: must be 0), how many hood
// vertices lie over it (the hood's edge in front of the mask's: allowed) and how many hood triangles cross its surface
// (must be 0). Exits 1 when the face pokes through or the hood cuts the mask. About 15 s.
// Usage: node tools/intruder/fit-check.mjs [public/assets/props/intruder.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Quat, Vec3 } from 'playcanvas';
import { against, rig, Surface } from './fit.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2] || 'public/assets/props/intruder.glb');
const root = doc.getRoot(), body = rig(doc);
const skinned = root.listNodes().find(n => n.getSkin()), maskNode = root.listNodes().find(n => n.getName() === 'mask face');
if (!maskNode) throw new Error('no mask face node');
const face = maskNode.getMesh().listPrimitives()[0], v = [];
const pos = face.getAttribute('POSITION');
const mask = new Surface(Array.from({ length: pos.getCount() }, (_, i) => [...pos.getElement(i, v)]), face.getIndices().getArray());
body.update();
const head = body.nodes.get('Bip01 Head');
// The mask's front in the head's space: his forward (+Z) at rest.
const forward = head.world.clone().invert().transformVector(new Vec3(0, 0, 1)).normalize();
const fwd = [forward.x, forward.y, forward.z];
// Vertices worth testing: the head mesh's, and the body's within 35 cm of the head at rest (the hood, the collar, the
// shoulders: what the mask's chin could meet when he looks down).
const restHead = head.world.getTranslation(), restBody = new Map();
const near = (prim) => {
  if (!restBody.has(prim)) restBody.set(prim, body.skin(skinned, prim).map(q => Math.hypot(q[0] - restHead.x, q[1] - restHead.y, q[2] - restHead.z) < 0.35));
  const keep = restBody.get(prim);
  return (i) => keep[i];
};
const prims = skinned.getMesh().listPrimitives().map(prim => ({ prim, part: /head/.test(prim.getMaterial().getName()) ? 'face' : 'hood', filter: /head/.test(prim.getMaterial().getName()) ? () => true : near(prim) }));
const CASES = [
  ['walk_slow_01'], ['walk_neutral_01'], ['run_neutral_01'], ['idle_breathe_01'], ['idle_look_around_01'], ['idle_look_around_02'],
  ['idle_neutral_01'], ['crouch_idle'], ['crouch_out'], ['walk_start'], ['walk_stop'],
  ['idle_breathe_01', -38, 'looking up into the camera (seccam.js)'], ['idle_breathe_01', 34, 'looking down at you (death.js)'],
  ['run_neutral_01', 6, 'the corridor (story.js)'],
];
let failed = false;
const rows = [];
for (const [clip, pitch = 0, note = ''] of CASES) {
  if (!body.clipNames.includes(clip)) continue;
  const row = { clip: clip + (pitch ? ` ${pitch > 0 ? '+' : ''}${pitch}°` : ''), 'face behind (mm)': Infinity, 'face through': 0, 'hood behind (mm)': Infinity, 'hood over': 0, 'hood crossing': 0, note };
  for (let t = 0; t <= body.duration(clip) + 1e-6; t += 0.1) {
    body.pose(clip, t);
    if (pitch) { head.r.mul(new Quat().setFromEulerAngles(0, 0, pitch)); body.update(); }
    const toHead = head.world.clone().invert(), p = new Vec3();
    for (const { prim, part, filter } of prims) {
      const verts = body.skin(skinned, prim, filter).map(q => (q ? (toHead.transformPoint(p.set(...q), p), [p.x, p.y, p.z]) : null));
      const where = verts.map(q => (q ? against(mask, q, fwd) : null));
      for (const w of where) {
        if (!w) continue;
        if (part === 'face') { if (w.behind !== undefined) row['face behind (mm)'] = Math.min(row['face behind (mm)'], w.behind * 1000); else row['face through']++; }
        else if (w.through !== undefined) row['hood over']++; else row['hood behind (mm)'] = Math.min(row['hood behind (mm)'], w.behind * 1000);
      }
      if (part === 'hood') {
        const idx = prim.getIndices().getArray();
        for (let k = 0; k < idx.length; k += 3) {
          const tri = [where[idx[k]], where[idx[k + 1]], where[idx[k + 2]]];
          if (tri.some(w => w?.through !== undefined) && tri.some(w => w?.behind !== undefined)) row['hood crossing']++;
        }
      }
    }
  }
  row['face behind (mm)'] = +row['face behind (mm)'].toFixed(1); row['hood behind (mm)'] = +row['hood behind (mm)'].toFixed(1);
  if (row['face through'] || row['hood crossing']) failed = true;
  rows.push(row);
}
console.table(rows);
console.log(failed ? 'FAIL: the mask is cut by his face or hood' : 'ok: nothing pokes through the mask');
process.exit(failed ? 1 : 0);

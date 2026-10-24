// Builds the story's props (tools/props/props.json) into public/assets/props/story/<id>.glb: each one downloaded from a
// GitHub mirror pinned to a commit (sources checked against sources.lock.json, recorded on the first run) into
// assets-src/props/, its scene flattened, kept/cropped to the part the game uses, fitted to real size, simplified where
// it was heavy, textures resized; then per-prop handling ('op'):
//  - fusebox: the consumer unit's own breaker levers, RCD lever and red main switch split off as nodes on pivots
//    (toggle-a1..a8, toggle-b1..b8, toggle-rcd, toggle-main) and its cover closed on a hinge node (cover); fusebox.js
//    animates them.
//  - clock: the three hands on pivots at the dial's centre, pointing at twelve (hand-hour, hand-minute, hand-second).
//  - pills: the pharmacy label repainted for the story's prescription (zolpidem, Dr Haas).
//  - polaroids: the blood smears painted out and the photo areas filled with the night shot of your bed
//    (public/assets/clips/polaroid.jpg from tools/bake-clips.mjs, when present); three of the seven photos kept.
//  - blanket: the blue towel scan dyed a worn charcoal wool.
// Also writes public/assets/props/story/LICENSES.txt. Usage: node tools/props/build.mjs [id ...]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, transformMesh, unpartition, weld, listTextureSlots } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const HERE = dirname(new URL(import.meta.url).pathname);
const SPEC = JSON.parse(readFileSync(join(HERE, 'props.json'), 'utf8')).props;
const LOCK_FILE = join(HERE, 'sources.lock.json');
const SRC = 'assets-src/props', OUT = 'public/assets/props/story';
const lock = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : {};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
mkdirSync(OUT, { recursive: true });

// --- sources ---------------------------------------------------------------------------------------------------------
async function download(p, rel) {
  const local = join(SRC, p.repo.replace('/', '__'), rel);
  if (!existsSync(local)) {
    const url = `https://raw.githubusercontent.com/${p.repo}/${p.commit}/${rel.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${p.id}: ${rel}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0, 40).toString().startsWith('version https://git-lfs')) throw new Error(`${p.id}: ${rel} is a Git LFS pointer`);
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(local, bytes);
  }
  const key = `${p.repo}@${p.commit}/${rel}`, sha256 = createHash('sha256').update(readFileSync(local)).digest('hex');
  if (lock[key] && lock[key] !== sha256) throw new Error(`${key}: checksum ${sha256} differs from sources.lock.json`);
  lock[key] = sha256;
  return local;
}

async function fetchSources(p) {
  const main = await download(p, p.file);
  if (p.file.endsWith('.gltf')) {
    const json = JSON.parse(readFileSync(main, 'utf8'));
    for (const item of [...(json.buffers || []), ...(json.images || [])]) {
      if (item.uri && !item.uri.startsWith('data:')) await download(p, posix.join(posix.dirname(p.file), decodeURIComponent(item.uri)));
    }
  }
  if (p.texture) await download(p, p.texture);
  return main;
}

// A Wavefront OBJ (the Google Scanned Objects meshes) with its one texture, as a glTF document.
function objDocument(text, texture) {
  const v = [], vt = [], vn = [], pos = [], uv = [], nrm = [], idx = [], seen = new Map();
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'vt') vt.push([+p[1], +p[2]]);
    else if (p[0] === 'vn') vn.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'f') {
      const corners = p.slice(1).map(c => {
        if (!seen.has(c)) {
          const [a, b, n] = c.split('/').map(x => (x ? parseInt(x, 10) : 0));
          pos.push(...v[a > 0 ? a - 1 : v.length + a]);
          const t = b ? vt[b > 0 ? b - 1 : vt.length + b] : [0, 0]; uv.push(t[0], 1 - t[1]);
          nrm.push(...(n ? vn[n > 0 ? n - 1 : vn.length + n] : [0, 1, 0]));
          seen.set(c, seen.size);
        }
        return seen.get(c);
      });
      for (let i = 1; i + 1 < corners.length; i++) idx.push(corners[0], corners[i], corners[i + 1]);
    }
  }
  const doc = new Document(), buffer = doc.createBuffer();
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const material = doc.createMaterial('scan').setRoughnessFactor(0.85).setMetallicFactor(0);
  if (texture) material.setBaseColorTexture(doc.createTexture('scan colour').setImage(texture).setMimeType('image/png'));
  const prim = doc.createPrimitive().setMaterial(material).setIndices(acc('SCALAR', new Uint32Array(idx)))
    .setAttribute('POSITION', acc('VEC3', new Float32Array(pos))).setAttribute('NORMAL', acc('VEC3', new Float32Array(nrm)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)));
  doc.createScene().addChild(doc.createNode('scan').setMesh(doc.createMesh('scan').addPrimitive(prim)));
  return doc;
}

// --- geometry helpers ------------------------------------------------------------------------------------------------
const mat = {
  identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul: (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; },
  translation: ([x, y, z]) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  scaling: (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1],
  rotX: (d) => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  rotY: (d) => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  rotZ: (d) => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  // rows: the new X, Y, Z axes in old coordinates
  basis: (x, y, z) => [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, 0, 0, 0, 1],
};
const apply = (m, p) => [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);
const meshNodes = (doc) => doc.getRoot().listNodes().filter(n => n.getMesh());

function eachVertex(doc, fn) {
  const v = [];
  for (const n of meshNodes(doc)) for (const prim of n.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), world = n.getWorldMatrix();
    for (let i = 0; i < pos.getCount(); i++) fn(apply(world, pos.getElement(i, v)), n, prim);
  }
}
function bounds(doc, nodes = null) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  eachVertex(doc, (p, n) => { if (nodes && !nodes.includes(n)) return; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } });
  return { lo, hi, size: hi.map((h, k) => h - lo[k]), centre: hi.map((h, k) => (h + lo[k]) / 2) };
}
const transformAll = (doc, m) => { for (const n of meshNodes(doc)) transformMesh(n.getMesh(), m); };

// Every mesh node's world transform baked into its vertices; all under one root node named after the prop.
function flattenScene(doc, id) {
  const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0];
  const top = doc.createNode(id);
  const nodes = meshNodes(doc).map(n => [n, n.getWorldMatrix()]);
  const used = new Map();
  for (const [n, world] of nodes) {
    let mesh = n.getMesh();
    if (used.has(mesh)) { mesh = mesh.clone(); for (const prim of mesh.listPrimitives()) mesh.removePrimitive(prim); for (const prim of n.getMesh().listPrimitives()) mesh.addPrimitive(prim.clone()); n.setMesh(mesh); }
    used.set(mesh, true);
    transformMesh(mesh, world);
    n.setMatrix(mat.identity());
    for (const c of n.listChildren()) n.removeChild(c);
  }
  for (const c of scene.listChildren()) scene.removeChild(c);
  for (const [n] of nodes) { for (const p of n.listParents()) if (p.propertyType === 'Node') p.removeChild(n); top.addChild(n); }
  scene.addChild(top);
  for (const s of root.listScenes()) if (s !== scene) s.dispose();
  root.setDefaultScene(scene);
  return top;
}

// A new primitive holding the triangles for which keep(i0, i1, i2) is true (vertices copied and renumbered).
function subset(doc, prim, keep) {
  const indices = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: prim.getAttribute('POSITION').getCount() }, (_, i) => i);
  const remap = new Map(), out = [];
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    if (!keep(...tri)) continue;
    for (const i of tri) { if (!remap.has(i)) remap.set(i, remap.size); out.push(remap.get(i)); }
  }
  if (!out.length) return null;
  const order = [...remap.keys()], buffer = doc.getRoot().listBuffers()[0];
  const copy = prim.clone();
  for (const semantic of prim.listSemantics()) {
    const a = prim.getAttribute(semantic), size = a.getElementSize(), src = a.getArray();
    const dst = new src.constructor(order.length * size);
    order.forEach((i, j) => { for (let k = 0; k < size; k++) dst[j * size + k] = src[i * size + k]; });
    copy.setAttribute(semantic, doc.createAccessor().setType(a.getType()).setArray(dst).setNormalized(a.getNormalized()).setBuffer(buffer));
  }
  for (const target of copy.listTargets()) copy.removeTarget(target);
  copy.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(out)).setBuffer(buffer));
  return copy;
}

// Connected pieces of a primitive (vertices welded by position): [{ tris: Set of first-index offsets, lo, hi }].
function islands(prim) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), v = [];
  const rep = new Int32Array(pos.getCount()), seen = new Map();
  for (let i = 0; i < pos.getCount(); i++) { const k = pos.getElement(i, v).map(x => Math.round(x * 1e5)).join(); if (!seen.has(k)) seen.set(k, i); rep[i] = seen.get(k); }
  const parent = Int32Array.from({ length: pos.getCount() }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(rep[idx[t]]); parent[find(rep[idx[t + 1]])] = a; parent[find(rep[idx[t + 2]])] = a; }
  const groups = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(rep[idx[t]]);
    if (!groups.has(r)) groups.set(r, { verts: new Set(), lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
    const g = groups.get(r);
    for (let k = 0; k < 3; k++) { g.verts.add(idx[t + k]); const p = pos.getElement(idx[t + k], v); for (let a = 0; a < 3; a++) { g.lo[a] = Math.min(g.lo[a], p[a]); g.hi[a] = Math.max(g.hi[a], p[a]); } }
  }
  return [...groups.values()].map(g => ({ ...g, size: g.hi.map((h, a) => h - g.lo[a]), centre: g.hi.map((h, a) => (h + g.lo[a]) / 2) }));
}

// Principal axes of a point set (Jacobi eigen-decomposition of the covariance): [{ value, vector }], largest first.
function principal(points) {
  const n = points.length, m = [0, 0, 0];
  for (const p of points) for (let k = 0; k < 3; k++) m[k] += p[k] / n;
  const a = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) a[i][j] += (p[i] - m[i]) * (p[j] - m[j]) / n;
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
    if (Math.abs(a[p][q]) < 1e-15) continue;
    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
  }
  return [0, 1, 2].map(i => ({ value: a[i][i], vector: [V[0][i], V[1][i], V[2][i]] })).sort((x, y) => y.value - x.value);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Moves a mesh node's geometry so that `pivot` becomes its origin, and puts the node there (for things that turn).
function pivotNode(node, pivot) {
  transformMesh(node.getMesh(), mat.translation(pivot.map(x => -x)));
  node.setTranslation(pivot);
}

// --- textures --------------------------------------------------------------------------------------------------------
async function resizeTextures(doc, p) {
  for (const t of doc.getRoot().listTextures()) {
    const slots = listTextureSlots(t), colour = slots.some(s => /baseColor|emissive|diffuse/i.test(s));
    const alpha = colour && doc.getRoot().listMaterials().some(m => m.getBaseColorTexture() === t && m.getAlphaMode() !== 'OPAQUE');
    const size = colour ? p.tex || 1024 : p.tex2 || Math.max(256, (p.tex || 1024) / 2);
    const meta = await sharp(Buffer.from(t.getImage())).metadata();
    const w = Math.min(size, meta.width), h = Math.max(1, Math.round(w * meta.height / meta.width));
    let image = sharp(Buffer.from(t.getImage())).resize(w, h);
    t.setImage(await (alpha ? image.png({ compressionLevel: 9 }) : image.removeAlpha().jpeg({ quality: colour ? 88 : 90, mozjpeg: true })).toBuffer());
    t.setMimeType(alpha ? 'image/png' : 'image/jpeg');
    t.setURI('');
  }
}

// --- per-prop handling -----------------------------------------------------------------------------------------------
const OPS = {
  // The consumer unit. Before fitting (source metres: box x -0.17..0.175, front face z 0.047): the cover, modelled open
  // about 110 degrees, turned shut against the front. After: the levers split off on pivots, the cover on its hinge.
  fusebox: {
    pre(doc) {
      const box = meshNodes(doc).find(n => n.getName() === 'power_box_01_box'), door = meshNodes(doc).find(n => n.getName() === 'power_box_01_door');
      const boxB = bounds(doc, [box]);
      const pts = []; eachVertex(doc, (p, n) => { if (n === door) pts.push([p[0], 0, p[2]]); });
      let [dx, , dz] = principal(pts)[0].vector;
      const along = pts.map(p => p[0] * dx + p[2] * dz), start = pts[along.indexOf(Math.min(...along))];
      if (Math.hypot(start[0] - boxB.lo[0], start[2] - boxB.hi[2]) > 0.1) { dx = -dx; dz = -dz; }   // from the hinge outwards
      const angle = Math.atan2(dz, dx) * 180 / Math.PI;
      transformMesh(door.getMesh(), mat.rotY(angle));
      const shut = bounds(doc, [door]);
      transformMesh(door.getMesh(), mat.translation([boxB.lo[0] - shut.lo[0], 0, boxB.hi[2] - shut.lo[2]]));
      door.setExtras({ openAngle: Math.round(angle) });
    },
    post(doc, top) {
      const box = meshNodes(doc).find(n => n.getName() === 'power_box_01_box'), door = meshNodes(doc).find(n => n.getName() === 'power_box_01_door');
      const prim = box.getMesh().listPrimitives()[0];
      const near = (a, b, tol = 0.0015) => a.every((x, i) => Math.abs(x - b[i]) < tol);
      const pieces = islands(prim).filter(g => near(g.size, [0.020, 0.0241, 0.0105]) || near(g.size, [0.086, 0.024, 0.011], 0.002));
      const take = new Set(pieces.flatMap(g => [...g.verts]));
      const ys = pieces.map(g => g.centre[1]), top0 = Math.max(...ys), bottom0 = Math.min(...ys);
      const rows = { a: pieces.filter(g => g.centre[1] > top0 - 0.02), c: pieces.filter(g => g.centre[1] < bottom0 + 0.02) };
      rows.b = pieces.filter(g => !rows.a.includes(g) && !rows.c.includes(g));
      const name = (g) => {
        if (rows.c.includes(g)) return g.size[0] > 0.05 ? 'toggle-main' : 'toggle-rcd';
        const row = rows.a.includes(g) ? 'a' : 'b';
        return `toggle-${row}${rows[row].sort((x, y) => x.lo[0] - y.lo[0]).indexOf(g) + 1}`;
      };
      for (const g of pieces) {
        const piece = subset(doc, prim, (a, b, c) => g.verts.has(a) && g.verts.has(b) && g.verts.has(c));
        const node = doc.createNode(name(g)).setMesh(doc.createMesh(name(g)).addPrimitive(piece));
        top.addChild(node);
        pivotNode(node, [g.centre[0], g.centre[1], g.lo[2]]);       // turns about its middle, at the module's face
      }
      const rest = subset(doc, prim, (a, b, c) => !(take.has(a) && take.has(b) && take.has(c)));
      box.getMesh().removePrimitive(prim); box.getMesh().addPrimitive(rest);
      const closed = bounds(doc, [door]), modules = pieces.map(g => g.lo[2]);
      door.setName('cover');
      door.setExtras({ ...door.getExtras(), width: closed.size[0], height: closed.size[1], thickness: closed.size[2], moduleFace: Math.min(...modules) });
      pivotNode(door, [closed.lo[0], 0, closed.lo[2]]);
      box.setName('box');
    },
  },

  // Hands pointing at twelve on pivots at the dial's centre (where the hour and minute hands' axes cross).
  clock: { post(doc) {
    const hands = { hour: 'houd_hand', minute: 'minute_hand', second: 'second_hand' };
    const nodes = Object.fromEntries(Object.entries(hands).map(([k, n]) => [k, meshNodes(doc).find(x => x.getName() === n)]));
    const line = (node) => { const pts = []; eachVertex(doc, (p, n) => { if (n === node) pts.push(p); }); const m = pts.reduce((a, p) => a.map((x, i) => x + p[i] / pts.length), [0, 0, 0]); return { m, d: principal(pts)[0].vector, pts }; };
    const h = line(nodes.hour), mn = line(nodes.minute);
    // Intersect the two lines in the dial's plane (x, y).
    const det = h.d[0] * -mn.d[1] - h.d[1] * -mn.d[0];
    const s = ((mn.m[0] - h.m[0]) * -mn.d[1] - (mn.m[1] - h.m[1]) * -mn.d[0]) / det;
    const c = [h.m[0] + s * h.d[0], h.m[1] + s * h.d[1], Math.max(...h.pts.map(p => p[2]))];
    for (const [k, node] of Object.entries(nodes)) {
      const { pts } = line(node);
      const far = pts.reduce((a, p) => Math.hypot(p[0] - c[0], p[1] - c[1]) > Math.hypot(a[0] - c[0], a[1] - c[1]) ? p : a);
      const clockwiseFromTwelve = Math.atan2(far[0] - c[0], far[1] - c[1]) * 180 / Math.PI;
      transformMesh(node.getMesh(), mat.mul(mat.translation(c), mat.mul(mat.rotZ(clockwiseFromTwelve), mat.translation(c.map(x => -x)))));
      node.setName(`hand-${k}`);
      pivotNode(node, c);
    }
  } },

  // The pharmacy label (three columns round the bottle, and a strip): blanked and printed for this story.
  pills: { async post(doc) {
    const t = doc.getRoot().listTextures()[0], img = sharp(Buffer.from(t.getImage())), meta = await img.metadata();
    const k = meta.width / 1024, esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    // The label's UVs are mirrored on the bottle: each column is printed flipped left to right.
    const col = (x, w, lines) => `<g transform="translate(${(x + w) * k} 0) scale(-1 1)">` + lines.map(([y, size, weight, text, fill = '#111']) => `<text x="${6 * k}" y="${y * k}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size * k}" font-weight="${weight}" fill="${fill}" textLength="${Math.min(w - 12, text.length * size * 0.56) * k}" lengthAdjust="spacingAndGlyphs">${esc(text)}</text>`).join('') + '</g>';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">
      <rect x="${2 * k}" y="${2 * k}" width="${203 * k}" height="${298 * k}" fill="#f6f5f0"/><rect x="${216 * k}" y="${2 * k}" width="${189 * k}" height="${298 * k}" fill="#f6f5f0"/>
      <rect x="${411 * k}" y="${2 * k}" width="${187 * k}" height="${298 * k}" fill="#f6f5f0"/><rect x="${2 * k}" y="${314 * k}" width="${146 * k}" height="${304 * k}" fill="#f6f5f0"/>
      <rect x="${411 * k}" y="${150 * k}" width="${187 * k}" height="${26 * k}" fill="#f2e04a"/>
      ${col(411, 187, [[30, 15, 700, 'ZOLPIDEM TARTRATE'], [52, 15, 700, '10 MG TABLETS'], [84, 13, 700, 'TAKE ONE TABLET BY'], [102, 13, 700, 'MOUTH AT BEDTIME'], [124, 11, 400, 'Do not take more than'], [138, 11, 400, 'one tablet a night.'], [168, 13, 700, 'Rx 0315-883', '#111'], [204, 11, 400, 'QTY 30   NO REFILLS'], [236, 11, 400, 'DR. M. HAAS'], [262, 10, 400, 'Sleep clinic, 3rd floor']])}
      ${col(216, 189, [[30, 15, 700, 'CITY PHARMACY'], [48, 10, 400, 'open 24 hours'], [84, 12, 700, 'MAY CAUSE'], [102, 12, 700, 'DROWSINESS'], [132, 10, 400, 'Do not drive or operate'], [146, 10, 400, 'machinery. Do not drink'], [160, 10, 400, 'alcohol with this'], [174, 10, 400, 'medicine.'], [214, 10, 400, 'Filled 02 March'], [262, 12, 700, '(0)20 7946 0381']])}
      ${col(2, 203, [[30, 13, 700, 'IMPORTANT'], [56, 10, 400, 'This medicine may cause'], [70, 10, 400, 'sleepwalking and other'], [84, 10, 400, 'complex sleep behaviours'], [98, 10, 400, 'with no memory of them.'], [126, 10, 400, 'It may cause'], [140, 10, 400, 'hallucinations.'], [168, 10, 400, 'Stop and call your doctor'], [182, 10, 400, 'if you do things in your'], [196, 10, 400, 'sleep you don’t remember.']])}
      ${col(2, 146, [[346, 10, 400, 'Keep out of reach'], [360, 10, 400, 'of children.'], [600, 10, 400, 'P 23453']])}
    </svg>`;
    t.setImage(await img.composite([{ input: Buffer.from(svg) }]).png().toBuffer()).setMimeType('image/png');
  } },

  // Seven photos in the model: keep three. The photo areas (dark rectangles, the blood smears on them counted as dark)
  // get our shot, turned so its bottom faces the card's wide margin as on a real print; smears elsewhere are painted
  // out to the card's white.
  polaroids: { async post(doc, top) {
    for (const n of meshNodes(doc).slice(3)) n.dispose();
    const t = doc.getRoot().listMaterials()[0].getBaseColorTexture();
    const { data, info } = await sharp(Buffer.from(t.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, C = info.channels, at = (x, y) => (y * W + x) * C;
    const red = (i) => data[i] > 38 && data[i] > data[i + 1] * 1.45 && data[i] > data[i + 2] * 1.3;
    const darkish = (x, y) => { const i = at(x, y); return red(i) || data[i] + data[i + 1] + data[i + 2] < 3 * 95; };
    const light = (x, y) => { const i = at(x, y); return !red(i) && data[i] + data[i + 1] + data[i + 2] > 3 * 170; };
    const rects = [], step = Math.max(1, Math.round(W / 512));
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
      if (!darkish(x, y) || rects.some(r => x >= r[0] - 2 * step && x <= r[2] + 2 * step && y >= r[1] - 2 * step && y <= r[3] + 2 * step)) continue;
      // Grow a box while its edges are mostly dark.
      let [x0, y0, x1, y1] = [x, y, x, y];
      const frac = (ax, ay, bx, by) => { let n = 0, d = 0; for (let yy = ay; yy <= by; yy += step) for (let xx = ax; xx <= bx; xx += step) { n++; if (darkish(xx, yy)) d++; } return d / n; };
      for (let grew = true; grew;) {
        grew = false;
        if (x1 + step < W && frac(x1 + step, y0, x1 + step, y1) > 0.8) { x1 += step; grew = true; }
        if (y1 + step < H && frac(x0, y1 + step, x1, y1 + step) > 0.8) { y1 += step; grew = true; }
        if (x0 - step >= 0 && frac(x0 - step, y0, x0 - step, y1) > 0.8) { x0 -= step; grew = true; }
        if (y0 - step >= 0 && frac(x0, y0 - step, x1, y0 - step) > 0.8) { y0 -= step; grew = true; }
      }
      if (x1 - x0 > W * 0.07 && y1 - y0 > H * 0.07 && Math.abs((x1 - x0) / (y1 - y0) - 1) < 0.35) rects.push([x0, y0, x1, y1]);
    }
    const inside = (x, y) => rects.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = at(x, y); if (red(i) && !inside(x, y)) { data[i] = 226; data[i + 1] = 225; data[i + 2] = 221; } }
    let image = sharp(data, { raw: info });
    const shot = 'public/assets/clips/polaroid.jpg';
    if (existsSync(shot)) {
      const layers = [];
      for (const [x0, y0, x1, y1] of rects) {
        // The card's wide margin: the side with the most white beyond the photo.
        const run = (sx, sy, dx, dy) => { let n = 0, x = sx, y = sy; while (x >= 0 && y >= 0 && x < W && y < H && light(x, y) && n < W) { x += dx; y += dy; n++; } return n; };
        const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
        const margin = { down: run(cx, y1 + 2, 0, 1), up: run(cx, y0 - 2, 0, -1), left: run(x0 - 2, cy, -1, 0), right: run(x1 + 2, cy, 1, 0) };
        const side = Object.entries(margin).sort((a, b) => b[1] - a[1])[0][0];
        const turn = { down: 0, left: 90, up: 180, right: 270 }[side];
        const photo = await sharp(shot).rotate(turn).resize(x1 - x0 + 1, y1 - y0 + 1, { fit: 'cover' }).modulate({ brightness: 0.92 }).toBuffer();
        layers.push({ input: photo, left: x0, top: y0 });
      }
      image = sharp(await image.png().toBuffer()).composite(layers);
    }
    t.setImage(await image.jpeg({ quality: 90 }).toBuffer()).setMimeType('image/jpeg');
    top.setExtras({ photos: rects.length });
  } },

  // A folded charcoal wool blanket from the royal-blue towel scan: luminance kept (the pile and folds), colour replaced.
  blanket: { async post(doc) {
    const t = doc.getRoot().listTextures()[0];
    const { data, info } = await sharp(Buffer.from(t.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 3) {
      const l = Math.max(data[i], data[i + 1], data[i + 2]) / 255, v = 34 + l * 92;
      data[i] = v * 1.02; data[i + 1] = v * 0.98; data[i + 2] = v * 0.93;
    }
    t.setImage(await sharp(data, { raw: info }).jpeg({ quality: 90 }).toBuffer()).setMimeType('image/jpeg');
    for (const m of doc.getRoot().listMaterials()) m.setRoughnessFactor(0.95);
  } },
};

// --- one prop --------------------------------------------------------------------------------------------------------
async function build(p) {
  const main = await fetchSources(p);
  const doc = main.endsWith('.obj') ? objDocument(readFileSync(main, 'utf8'), p.texture ? readFileSync(join(SRC, p.repo.replace('/', '__'), p.texture)) : null) : await io.read(main);
  for (const e of doc.getRoot().listExtensionsUsed()) if (/draco|meshopt/.test(e.extensionName)) e.dispose();
  const top = flattenScene(doc, p.id);
  if (p.keep) {
    const re = new RegExp(p.keep);
    for (const n of meshNodes(doc)) if (!re.test(n.getName()) && !n.getMesh().listPrimitives().some(pr => re.test(pr.getMaterial()?.getName() || ''))) n.dispose();
  }
  if (p.crop) {
    const [lo, hi] = p.crop;
    for (const n of meshNodes(doc)) for (const prim of n.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), v = [];
      const kept = subset(doc, prim, (...tri) => { const c = [0, 0, 0]; for (const i of tri) pos.getElement(i, v).forEach((x, k) => c[k] += x / 3); return c.every((x, k) => x >= lo[k] && x <= hi[k]); });
      n.getMesh().removePrimitive(prim);
      if (kept) n.getMesh().addPrimitive(kept);
    }
  }
  await OPS[p.op]?.pre?.(doc, top, p);
  const fit = p.fit || {};
  if (fit.flat) {
    // The thinnest direction up, the longest along x.
    const pts = []; eachVertex(doc, (q) => pts.push([...q]));
    const [major, , minor] = principal(pts).map(a => a.vector);
    transformAll(doc, mat.basis(major, minor, cross(major, minor)));
  }
  if (fit.rotate) transformAll(doc, [mat.rotX(fit.rotate[0]), mat.rotY(fit.rotate[1]), mat.rotZ(fit.rotate[2])].reduceRight((a, b) => mat.mul(b, a)));
  let b = bounds(doc);
  const scale = fit.size ? fit.size / Math.max(...b.size) : fit.scale ?? 1;
  const origin = fit.origin === 'centre' ? b.centre : fit.origin === 'top' ? [b.centre[0], b.hi[1], b.centre[2]] : fit.origin === 'back' ? [b.centre[0], b.centre[1], b.lo[2]] : [b.centre[0], b.lo[1], b.centre[2]];
  transformAll(doc, mat.mul(mat.scaling(scale), mat.translation(origin.map(x => -x))));
  if (p.simplify) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: p.simplify, error: 0.004 }));
  // Material overrides (props.json 'materials': name pattern -> colour [r, g, b, a], roughness, metal, texture: false).
  for (const [pattern, o] of Object.entries(p.materials || {})) for (const m of doc.getRoot().listMaterials()) {
    if (!new RegExp(pattern).test(m.getName())) continue;
    if (o.color) m.setBaseColorFactor(o.color).setAlphaMode(o.color[3] < 1 ? 'BLEND' : 'OPAQUE');
    if (o.roughness != null) m.setRoughnessFactor(o.roughness).setMetallicRoughnessTexture(null);
    if (o.metal != null) m.setMetallicFactor(o.metal);
    if (o.texture === false) m.setBaseColorTexture(null).setNormalTexture(null);
    for (const e of m.listExtensions()) if (o.plain) m.setExtension(e.extensionName, null);
  }
  await resizeTextures(doc, p);
  await OPS[p.op]?.post?.(doc, top, p);
  await doc.transform(unpartition(), prune({ keepLeaves: true }), dedup());
  for (const prim of doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())) for (const t of prim.listTargets()) prim.removeTarget(t);
  doc.getRoot().getAsset().extras = { title: p.title, author: p.author, license: p.license, source: p.source, mirror: `https://github.com/${p.repo}/blob/${p.commit}/${p.file}` };
  const out = join(OUT, `${p.id}.glb`);
  await io.write(out, doc);
  b = bounds(doc);
  let tris = 0; for (const n of meshNodes(doc)) for (const prim of n.getMesh().listPrimitives()) tris += prim.getIndices().getCount() / 3;
  console.log(p.id.padEnd(10), (readFileSync(out).length / 1e6).toFixed(2).padStart(5), 'MB', String(tris).padStart(6), 'tris', 'size', b.size.map(x => x.toFixed(3)).join(' x '), 'm');
}

await MeshoptSimplifier.ready;
const ids = process.argv.slice(2);
for (const p of SPEC) if (!ids.length || ids.includes(p.id)) await build(p);
writeFileSync(LOCK_FILE, JSON.stringify(Object.fromEntries(Object.entries(lock).sort()), null, 1) + '\n');
writeFileSync(join(OUT, 'LICENSES.txt'), 'The story props (tools/props/props.json, built by tools/props/build.mjs). Modified for this game: fitted to real size, simplified, textures resized; see props.json and build.mjs for each.\n\n' +
  SPEC.map(p => `${p.id}.glb: "${p.title}" by ${p.author}${p.authorUrl ? ` (${p.authorUrl})` : ''}, ${p.license}. Source: ${p.source}. Mirror: https://github.com/${p.repo}/blob/${p.commit}/${p.file}`).join('\n') + '\n\n' +
  'CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ · CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/\n');

// Turns the source apartment (assets-src/modern_apartment/scene.gltf, ~3M triangles, 300 MB) into the web build in
// public/assets/apartment/: simplified, joined and Draco-compressed geometry split into <=12 MB .bin files, KTX2 textures
// (ETC1S colour, UASTC normal maps), and collision.json (walk grid + floor heights) for the first-person controller.
// Usage: node tools/build-assets.mjs [--src assets-src/modern_apartment/scene.gltf] [--out public/assets/apartment] [--fast]
//   --fast skips texture compression (PNG/JPEG kept, max 1024 px): quick iteration on geometry or collision.
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, prune, flatten, weld, simplify, join, draco, textureCompress, listTextureSlots, mergeDocuments, unpartition, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import { encodeToKTX2 } from 'ktx2-encoder';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { buildCollision } from './collision.mjs';

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const SRC = arg('--src', 'assets-src/modern_apartment/scene.gltf');
const FAST = process.argv.includes('--fast');
const OUT = arg('--out', 'public/assets/apartment');
const CHUNK = 12 * 1024 * 1024;
// Downloaded props merged into the apartment (assets/props/, credited in docs/CREDITS.md), placed in world metres.
// The front door replaces the model's own entrance door (a flat panel with only a thin bar for a handle).
const PROPS = [
  { file: 'assets/props/flashlite_flashlight.glb', name: 'Prop_flashlight', at: [0, -10, 0], scale: [1, 1, 1], yaw: 0 },
  { file: 'assets/props/door_with_frame.glb', name: 'Prop_front_door', at: [12.88, 0.14, 4.40], scale: [0.01155, 0.0120, 0.01], yaw: 180 },
];
const REMOVE = /^EnteranceDoor_/;
// Bedroom wardrobe doors cut out of the carcass so the game can swing them open: front panels (x > 9.70) and their
// chrome handles inside each box. Hinge edges are the outer edges (handles sit at the inner edges).
const WARDROBE = [
  { id: 'left', z: [-1.323, -0.544], y: [0.14, 2.28] },
  { id: 'right', z: [-0.502, 0.277], y: [0.14, 2.28] },
  { id: 'upperleft', z: [1.341, 1.830], y: [1.205, 2.28] },
  { id: 'upperright', z: [1.866, 2.357], y: [1.205, 2.28] },
];
// Parts the game switches or moves on their own get their own material copy '<material>.<tag>' (see separateMaterials):
// lamp glows per room, the iMac's screen, the coffee machine's panel, the bathroom door leaf (hung on a hinge at run time).
const FIXTURES = { BathroomFurnitures_Light_0: 'bathroom', Hood_Light_0: 'kitchen', OficeDecors_Light_0: 'office',
  iMac_Screen_0: 'imac', 'Coffee+Maker_Coffee_Maker_Material5_0': 'coffee', Curtatins_White1_0: 'curtain' };
// The bathroom door leaf: the white panels and the black piece that starts at the hinge edge (handles); the other black
// piece is the frame. Left out of the walk grid: the game blocks the doorway while the door is shut.
const BATH_DOOR = (n, b) => /^Door\.001_White1_0$/.test(n.getName()) || (/^Door\.001_Black_0$/.test(n.getName()) && b.min[2] > 0.38);
// Triangle-level splits: [node name pattern, (world centroid) => tag or null]. The two bedside reading lamps share one
// glowing mesh (split at the bed's centre line, z 0.5); the MacBook's lid (everything above its base, y > 0.522) swings.
// The bathroom door's lever handles, rose and lock are modelled into the frame's mesh (the black piece that starts at
// z 0.30): cut them out so they swing with the leaf.
const SPLITS = [
  [/^BedDecors_Light_0$/, (c) => (c[2] < 0.5 ? 'bedside-left' : 'bedside-right')],
  [/^MacBook_/, (c) => (c[1] > 0.522 ? 'laptoplid' : null)],
  // the dining pendants' opal globes (diameter ~0.35 m round each bulb): they glow when lit and cast no shadow
  [/^DiningTable\.001_White1_0$/, (c) => (c[1] > 1.74 && c[1] < 2.13 && Math.min(Math.hypot(c[0] + 0.44, c[2] - 1.523), Math.hypot(c[0] - 0.777, c[2] - 1.523)) < 0.2 ? 'pendant' : null)],
  [/^Door\.001_Black_0$/, (c, b) => (b.min[2] < 0.38 && c[0] > 9.0 && c[0] < 9.32 && c[1] > 0.9 && c[1] < 1.3 && c[2] > 0.9 && c[2] < 1.215 ? 'bathdoor' : null)],
];
// Rooms, for per-room reflection probes: every surface is cut exactly at these planes (inside the walls: room / hall
// wall faces at z 2.41 / 2.72, main room / bathroom at x 6.34 / 6.45, bathroom / bedroom at x 9.15 / 9.26; x 1.55 is
// where the open-plan room meets the corridor) and its material copied per room as '<material>@<room>'.
const ZONE_CUTS = [[0, 1.55], [0, 6.40], [0, 9.20], [2, 2.57]];
const zoneOf = ([x, , z]) => (z > 2.57 ? (x < 1.55 ? 'main' : 'hall') : x < 6.40 ? 'main' : x < 9.20 ? 'bath' : 'bed');
// Left whole (the game finds them by name, or they move): tagged parts, props, lamp glows, screens.
const UNZONED = /\.(bathdoor|wardrobe-\w+|laptoplid|bedside-\w+|imac|coffee|kitchen|office|bathroom|pendant)$|^Prop_|^Light|Screen|^Keylight/;
// Materials the walk grid ignores (moving parts).
export const NO_COLLISION = /\.bathdoor$/;

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
await MeshoptSimplifier.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.decoder': MeshoptDecoder,
});

const doc = await io.read(SRC);
const tris = () => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
log('read', SRC, 'triangles', tris());

// Geometry: drop duplicates, bake the Sketchfab root transform into flat nodes, then simplify within 0.4 mm per metre of
// mesh radius (removes the 1M-triangle door's redundant tessellation without visible change) and join by material.
for (const n of doc.getRoot().listNodes()) if (REMOVE.test(n.getName())) n.dispose();
await mergeProps(doc);
await doc.transform(dedup(), prune(), flatten(), unpartition());
extractWardrobeDoors(doc);
splitTriangles(doc);
separateMaterials(doc);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: 0.0004 }));
zoneSplit(doc);
{ const buffer = doc.getRoot().listBuffers()[0]; for (const a of doc.getRoot().listAccessors()) if (!a.getBuffer()) a.setBuffer(buffer); }
await doc.transform(join({ keepNamed: false }), dedup({ keepUniqueNames: true }), prune({ keepAttributes: true }));   // keep the window UVs (no texture uses them in the file)
log('simplified + joined: triangles', tris(), 'meshes', doc.getRoot().listMeshes().length);

async function mergeProps(doc) {
  const scene = doc.getRoot().listScenes()[0];
  for (const p of PROPS) {
    const src = await io.read(p.file);
    for (const e of src.getRoot().listExtensionsUsed()) if (e.extensionName === 'EXT_meshopt_compression') e.dispose();
    // Material names get a prefix so they never collide with (or dedup into) the apartment's own.
    for (const m of src.getRoot().listMaterials()) m.setName(`${p.name}.${m.getName() || 'material'}`);
    const srcScene = src.getRoot().listScenes()[0];
    const map = mergeDocuments(doc, src);
    const holder = doc.createNode(p.name).setTranslation(p.at).setScale(p.scale)
      .setRotation([0, Math.sin(p.yaw * Math.PI / 360), 0, Math.cos(p.yaw * Math.PI / 360)]);
    const merged = map.get(srcScene);
    for (const c of merged.listChildren()) holder.addChild(c);
    merged.dispose();
    scene.addChild(holder);
  }
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  log(`merged props: ${PROPS.map(p => p.name).join(', ')}`);
}

function extractWardrobeDoors(doc) {
  const scene = doc.getRoot().listScenes()[0];
  let made = 0;
  for (const n of scene.listChildren()) {
    const mesh = n.getMesh();
    if (!mesh || !/^BedroomWardrobes_(Wood049|Chrome)/.test(n.getName())) continue;
    const m = n.getMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), e = [0, 0, 0];
      const keep = [], take = WARDROBE.map(() => []);
      for (let t = 0; t < idx.getCount(); t += 3) {
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < 3; k++) {
          pos.getElement(idx.getScalar(t + k), e);
          cx += (m[0] * e[0] + m[4] * e[1] + m[8] * e[2] + m[12]) / 3; cy += (m[1] * e[0] + m[5] * e[1] + m[9] * e[2] + m[13]) / 3; cz += (m[2] * e[0] + m[6] * e[1] + m[10] * e[2] + m[14]) / 3;
        }
        const d = cx > 9.70 ? WARDROBE.findIndex(w => cz > w.z[0] && cz < w.z[1] && cy > w.y[0] && cy < w.y[1]) : -1;
        (d < 0 ? keep : take[d]).push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
      }
      WARDROBE.forEach((w, d) => {
        if (!take[d].length) return;
        const part = doc.createPrimitive().setMode(prim.getMode())
          .setMaterial(prim.getMaterial().clone().setName(`${prim.getMaterial().getName()}.wardrobe-${w.id}`))
          .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(take[d])).setBuffer(idx.getBuffer()));
        for (const sem of prim.listSemantics()) part.setAttribute(sem, prim.getAttribute(sem).clone());
        scene.addChild(doc.createNode(`Wardrobe_${w.id}`).setMatrix(m).setMesh(doc.createMesh(`Wardrobe_${w.id}`).addPrimitive(part)));
        made++;
      });
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(idx.getBuffer()));
    }
  }
  log(`wardrobe doors: ${made} door parts cut out`);
}

// Cuts the SPLITS triangles out of their nodes into new nodes whose materials get the tag as a suffix.
function splitTriangles(doc) {
  const scene = doc.getRoot().listScenes()[0];
  let made = 0;
  for (const n of scene.listChildren()) {
    const rule = n.getMesh() && SPLITS.find(([re]) => re.test(n.getName()));
    if (!rule) continue;
    const m = n.getMatrix(), e = [0, 0, 0];
    for (const prim of n.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), groups = new Map();
      const bounds = getBounds(n);
      for (let t = 0; t < idx.getCount(); t += 3) {
        const c = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          pos.getElement(idx.getScalar(t + k), e);
          for (let r = 0; r < 3; r++) c[r] += (m[r] * e[0] + m[4 + r] * e[1] + m[8 + r] * e[2] + m[12 + r]) / 3;
        }
        const tag = rule[1](c, bounds) ?? '';
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag).push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
      }
      for (const [tag, list] of groups) {
        if (!tag) continue;
        const part = doc.createPrimitive().setMode(prim.getMode())
          .setMaterial(prim.getMaterial().clone().setName(`${prim.getMaterial().getName()}.${tag}`))
          .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(idx.getBuffer()));
        for (const sem of prim.listSemantics()) part.setAttribute(sem, prim.getAttribute(sem).clone());
        scene.addChild(doc.createNode(`${n.getName()}.${tag}`).setMatrix(m).setMesh(doc.createMesh(tag).addPrimitive(part)));
        made++;
      }
      if (groups.has('')) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(groups.get(''))).setBuffer(idx.getBuffer()));
      else prim.dispose();
    }
  }
  log(`split parts: ${made}`);
}

// Cuts every zoned surface at the ZONE_CUTS planes (Sutherland-Hodgman on the straddling triangles, all attributes
// interpolated, shared cut vertices so edges stay closed) and gives each room's part its own material copy.
function zoneSplit(doc) {
  const scene = doc.getRoot().listScenes()[0], copies = new Map();
  const copyFor = (mat, zone) => {
    const key = `${mat.getName()}@${zone}`;
    if (!copies.has(key)) copies.set(key, mat.clone().setName(key));
    return copies.get(key);
  };
  let cutTris = 0, made = 0;
  for (const node of scene.listChildren()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial(), idx = prim.getIndices();
      if (!mat || !idx || prim.getMode() !== 4 || UNZONED.test(mat.getName())) continue;
      const sems = prim.listSemantics(), accs = sems.map(s => prim.getAttribute(s));
      const data = accs.map(a => ({ a, size: a.getElementSize(), arr: Array.from(a.getArray()), float: a.getArray() instanceof Float32Array }));
      const posData = data[sems.indexOf('POSITION')];
      const world = (i) => { const p = posData.arr, o = i * 3;
        return [0, 1, 2].map(r => m[r] * p[o] + m[4 + r] * p[o + 1] + m[8 + r] * p[o + 2] + m[12 + r]); };
      const W = [];
      const wpos = (i) => (W[i] ||= world(i));
      const edgeCache = new Map();
      // New vertex on the edge a-b where plane value is crossed (t from a).
      const lerpVertex = (a, b, t, key) => {
        if (edgeCache.has(key)) return edgeCache.get(key);
        const n = posData.arr.length / 3;
        data.forEach((d, k) => {
          for (let c = 0; c < d.size; c++) {
            const va = d.arr[a * d.size + c], vb = d.arr[b * d.size + c];
            d.arr.push(d.float ? va + (vb - va) * t : (t < 0.5 ? va : vb));
          }
          if (sems[k] === 'NORMAL' || sems[k] === 'TANGENT') {   // renormalise xyz
            const o = n * d.size, l = Math.hypot(d.arr[o], d.arr[o + 1], d.arr[o + 2]) || 1;
            for (let c = 0; c < 3; c++) d.arr[o + c] /= l;
          }
        });
        edgeCache.set(key, n);
        return n;
      };
      const zones = new Map();
      const add = (zone, a, b, c) => { if (!zones.has(zone)) zones.set(zone, []); zones.get(zone).push(a, b, c); };
      const ia = idx.getArray();
      for (let t = 0; t < ia.length; t += 3) {
        let polys = [[ia[t], ia[t + 1], ia[t + 2]]];
        const p0 = wpos(ia[t]), p1 = wpos(ia[t + 1]), p2 = wpos(ia[t + 2]);
        let split = false;
        for (const [axis, v] of ZONE_CUTS) {
          const lo = Math.min(p0[axis], p1[axis], p2[axis]), hi = Math.max(p0[axis], p1[axis], p2[axis]);
          if (!(lo < v - 1e-5 && hi > v + 1e-5)) continue;
          split = true;
          const next = [];
          for (const poly of polys) {
            const side = poly.map(i => wpos(i)[axis] - v);
            if (side.every(d => d <= 1e-5) || side.every(d => d >= -1e-5)) { next.push(poly); continue; }
            const below = [], above = [];
            for (let k = 0; k < poly.length; k++) {
              const a = poly[k], b = poly[(k + 1) % poly.length], da = side[k], db = side[(k + 1) % poly.length];
              if (da <= 0) below.push(a); if (da >= 0) above.push(a);
              if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
                const tt = da / (da - db), key = a < b ? `${a}-${b}-${axis}-${v}` : `${b}-${a}-${axis}-${v}`;
                const nv = a < b ? lerpVertex(a, b, tt, key) : lerpVertex(b, a, 1 - tt, key);
                wpos(nv);
                below.push(nv); above.push(nv);
              }
            }
            if (below.length >= 3) next.push(below);
            if (above.length >= 3) next.push(above);
          }
          polys = next;
        }
        if (split) cutTris++;
        for (const poly of polys) {
          const c = [0, 1, 2].map(r => poly.reduce((s, i) => s + wpos(i)[r], 0) / poly.length);
          const zone = zoneOf(c);
          for (let k = 1; k + 1 < poly.length; k++) add(zone, poly[0], poly[k], poly[k + 1]);
        }
      }
      if (posData.arr.length / 3 > accs[0].getCount()) data.forEach(d => d.a.setArray(new (d.a.getArray().constructor)(d.arr)));
      const list = [...zones];
      list.forEach(([zone, indices], k) => {
        const target = k === 0 ? prim : doc.createPrimitive().setMode(4);
        if (k > 0) { sems.forEach((s, j) => target.setAttribute(s, accs[j])); mesh.addPrimitive(target); }
        const n = posData.arr.length / 3;
        target.setIndices(doc.createAccessor().setType('SCALAR').setArray(n > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)).setBuffer(idx.getBuffer()));
        target.setMaterial(copyFor(mat, zone));
        if (list.length > 1) compactPrimitive(target);
        made++;
      });
    }
  }
  log(`rooms: ${made} primitives, ${cutTris} triangles cut at room boundaries, ${copies.size} material copies`);
}

// Lamp fixtures that glow share one 'Light' material across rooms; give each its own copy ('Light.<room>') so join()
// keeps them apart and the game can switch each room's glow off. Window panes get their own 'WindowGlass' material and
// world-planar UVs (1 unit = 1 m along the wall, v = height) for the rain-on-glass effect.
function separateMaterials(doc) {
  for (const n of doc.getRoot().listScenes()[0].listChildren()) {
    const window = n.getName() === 'Windows_Glass_0';
    const room = FIXTURES[n.getName()] ?? (n.getMesh() && BATH_DOOR(n, getBounds(n)) ? 'bathdoor' : undefined);
    if (!n.getMesh() || (!room && !window)) continue;
    for (const prim of n.getMesh().listPrimitives()) {
      const mat = prim.getMaterial().clone().setName(window ? 'WindowGlass' : `${prim.getMaterial().getName()}.${room}`);
      prim.setMaterial(mat);
      if (window) planarUVs(doc, n, prim);
    }
  }
  log('separated fixture and window materials');
}
function planarUVs(doc, node, prim) {
  const m = node.getMatrix(), pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL');
  const uv = new Float32Array(pos.getCount() * 2), p = [0, 0, 0], q = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, p); nor.getElement(i, q);
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
    const nx = m[0] * q[0] + m[4] * q[1] + m[8] * q[2], nz = m[2] * q[0] + m[6] * q[1] + m[10] * q[2];
    uv[i * 2] = Math.abs(nx) > Math.abs(nz) ? z : x;
    uv[i * 2 + 1] = 3 - y;
  }
  prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(pos.getBuffer()));
}

const scene = doc.getRoot().listScenes()[0];
const bounds = getBounds(scene);
log('bounds', JSON.stringify(bounds));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/textures`, { recursive: true });
writeFileSync(`${OUT}/collision.json`, JSON.stringify(buildCollision(doc, bounds, { skip: NO_COLLISION })));
log('collision.json written');

// Textures: cap at 2048 px, then KTX2 (GPU-compressed: ~6x less video memory than PNG) unless --fast.
const decoder = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
if (FAST) {
  await doc.transform(textureCompress({ encoder: sharp, resize: [1024, 1024] }));
} else {
  await doc.transform(textureCompress({ encoder: sharp, resize: [2048, 2048], targetFormat: 'png' }));
  log('textures resized');
  // Encoding is slow (UASTC normal maps ~1 min each), so results are cached by content in assets-src/ktx2-cache.
  const CACHE = 'assets-src/ktx2-cache';
  mkdirSync(CACHE, { recursive: true });
  let hits = 0;
  for (const tex of doc.getRoot().listTextures()) {
    const normal = listTextureSlots(tex).some(s => /normalTexture/.test(s));
    const opts = normal
      ? { isUASTC: true, isNormalMap: true, needSupercompression: true, generateMipmap: true }
      : { isUASTC: false, qualityLevel: 200, compressionLevel: 2, generateMipmap: true, isPerceptual: true };
    const key = createHash('sha1').update(tex.getImage()).update(JSON.stringify(opts)).digest('hex');
    const file = `${CACHE}/${key}.ktx2`;
    if (existsSync(file)) hits++;
    else writeFileSync(file, await encodeToKTX2(tex.getImage(), { ...opts, imageDecoder: decoder }));
    tex.setImage(new Uint8Array(readFileSync(file))).setMimeType('image/ktx2');
  }
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  log(`textures -> KTX2 (UASTC normal maps, ETC1S others; ${hits} from cache)`);
}
// Each image gets a stable file name: textures/<index>.<ext>.
doc.getRoot().listTextures().forEach((t, i) => t.setURI(`textures/${i}.${t.getMimeType() === 'image/ktx2' ? 'ktx2' : t.getMimeType().split('/')[1]}`));

await doc.transform(draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
log('draco');
{ const buffer = doc.getRoot().listBuffers()[0]; for (const a of doc.getRoot().listAccessors()) if (!a.getBuffer()) a.setBuffer(buffer); }
await io.write(`${OUT}/scene.gltf`, doc);

// Split the single .bin at bufferView boundaries so no file exceeds CHUNK (the artifact host caps files at 15 MB).
const gltfPath = `${OUT}/scene.gltf`;
const json = JSON.parse(readFileSync(gltfPath, 'utf8'));
const binName = json.buffers[0].uri;
const bin = readFileSync(`${OUT}/${binName}`);
const parts = [];
let cur = null;
json.bufferViews.forEach((bv, i) => {
  const len = bv.byteLength;
  if (!cur || cur.size + len > CHUNK) { cur = { views: [], size: 0 }; parts.push(cur); }
  const pad = (4 - (cur.size % 4)) % 4;
  cur.views.push({ i, from: bv.byteOffset || 0, at: cur.size + pad, len });
  cur.size += pad + len;
});
json.buffers = parts.map((p, n) => {
  const out = Buffer.alloc(p.size);
  for (const v of p.views) { bin.copy(out, v.at, v.from, v.from + v.len); Object.assign(json.bufferViews[v.i], { buffer: n, byteOffset: v.at }); }
  writeFileSync(`${OUT}/geometry-${n}.bin`, out);
  return { uri: `geometry-${n}.bin`, byteLength: p.size };
});
rmSync(`${OUT}/${binName}`);
writeFileSync(gltfPath, JSON.stringify(json));

const files = readdirSync(OUT, { recursive: true }).filter(f => statSync(`${OUT}/${f}`).isFile());
const total = files.reduce((n, f) => n + statSync(`${OUT}/${f}`).size, 0);
const biggest = Math.max(...files.map(f => statSync(`${OUT}/${f}`).size));
log(`done: ${files.length} files, ${(total / 1e6).toFixed(1)} MB, largest ${(biggest / 1e6).toFixed(1)} MB`);

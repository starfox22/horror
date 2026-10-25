// Builds the crow that strikes the window (src/crow.js; docs/STORY.md beat 5): public/assets/props/crow.glb and
// crow.LICENSE.txt, from two downloads pinned to commits and checked against their SHA-256 (cached in assets-src/crow/):
//  - "Crow" by Alexei Ostapenko (CC BY 4.0, Sketchfab): a skinned crow (92 joints, 2,208 triangles, feather cards) with
//    one 10.5 s timeline, "root|TakeOff" (perched, a take-off with wing beats, a glide, a landing that folds the wings),
//    from the Jazhikho/project_harvest mirror (Git LFS; 1024 px textures; the licence is in the file's asset.extras).
//    The Rico-Rodriguez/critter-clash mirror's cut of the same timeline was looked at first and is not used: its clips
//    are mislabelled ("Fast_Flying" is the glide and the landing, without a wing beat; "Attack", "Hit" and "Special"
//    are slices of the perched idle). The two clips the game plays are cut here from the timeline instead:
//      Fast_Flying  7.0-7.5 s: one wing beat, closed into a seamless loop, the take-off's heave of the body damped to
//                   level flight (he is flying fast and straight, not climbing).
//      Hit          9.65-10.52 s: the glide, wings spread flat (he meets the glass CONTACT s in: the moment that leaves
//                   a bird's print on a pane), then the wings flung up and folded as he drops away from it.
//  - "Blood Splatter" by ExileGL (CC0, OpenGameArt; the KurtBliss/Karnage mirror): one dense patch of it with a soft
//    edge is the smear he leaves on the glass ('smear'); the same patch dragged down in streaks and thinned is that
//    smear as the rain washes it ('smear-wash'). src/crow.js cross-fades them over about 40 s.
// The crow: Sketchfab's wrapper keeps its nodes (the skin needs them) under a new root node 'crow' that puts him in
// metres (0.90 m wingspan, spread), facing -Z (PlayCanvas forward), the middle of his body at the origin; its lamp and
// camera are dropped. Material: alpha-tested feather cards (the source alpha-blends them: sorted against the window
// glass he would flicker through it), metalness 0 (the conversion had made him 87 % metal), roughness from the
// source's gloss map (satin feathers, a wet eye), textures 1024 px (base colour, PNG: its alpha cuts the cards) and
// 512 px (normal and metal/rough, JPEG).
// Loose feathers: quads 'feather-1'..'feather-5' mapped onto the five loose feather cards painted in his own texture
// (the small separate islands of its alpha), quill at -X, tip at +X, facing +Z; their material shares his textures.
// The smears: quads 'smear' and 'smear-wash' facing +Z (towards the room once placed), their top edges together.
// Finally the crow is measured (CPU skinning over both clips, measure() below) and what src/crow.js uses is printed.
// Usage: node tools/crow/build.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample } from '@gltf-transform/functions';

export const SOURCES = {
  crow: {
    title: 'Crow', author: 'Alexei Ostapenko', authorUrl: 'https://sketchfab.com/alexanders823', license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', original: 'https://sketchfab.com/3d-models/crow-d5a9b0df4da3493688b63ce42c8a83e2',
    repo: 'Jazhikho/project_harvest', commit: '851d18e50e756df659bd476fad58ee7c8e4fdeb3', path: 'assets/models/crow (1).glb', lfs: true,
    sha256: '710db5076a32e450b88401bde2f63294a7837b460ec6f9341de4582b8b95315a',
    licenseConfirmedVia: 'the file\'s glTF asset.extras (author, "CC-BY-4.0", source); the same model in Rico-Rodriguez/critter-clash ' +
      '(commit 7fcd4f4, assets/sidekicks/LICENSE-sidekicks.txt: "Crow" by Alexei Ostapenko, CC BY 4.0, verified via the Sketchfab API)',
  },
  blood: {
    title: 'Blood Splatter', author: 'ExileGL', authorUrl: 'https://opengameart.org/content/blood-splatter', license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', original: 'https://opengameart.org/content/blood-splatter',
    repo: 'KurtBliss/Karnage', commit: '8dfaa32779482b0de927ddcf46be0a18ce523c09', path: 'assets/opengameart/ExileGL/ExileGL__blood.png',
    sha256: '2f625d3ce46c723c54f3a78a94cd54aef808ef2480b470dd70bf7b6fdbb42c14',
    licenseConfirmedVia: 'BentleyBlanks/bentleyblanks.github.io Taierzhuang1938/_import/Data_SourceLicenses.md, which records ' +
      'the original blood_0.png with this SHA-256 ("ExileGL; Blood Splatter, page marked CC0; downloaded as-is"); CC0 also in ' +
      'sohaibsohail98/london-underground-the-last-train docs/reference/free-asset-sweep-2026-09.md',
  },
};
const SRC = 'assets-src/crow', OUT = 'public/assets/props';
const WINGSPAN = 0.90;                       // metres, wings spread (a carrion crow: 0.84-1.0 m)
const CLIPS = { Fast_Flying: [7.0, 7.5, { loop: true }], Hit: [9.65, 10.52, {}] };
export const CONTACT = 0.2;                  // seconds into Hit when he meets the glass: the last of the glide
const FPS = 30;

// --- sources ---------------------------------------------------------------------------------------------------------
async function download(s) {
  const local = join(SRC, s.repo.replace('/', '__'), s.path);
  if (!existsSync(local)) {
    const host = s.lfs ? 'https://media.githubusercontent.com/media' : 'https://raw.githubusercontent.com';
    const url = `${host}/${s.repo}/${s.commit}/${s.path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${s.title}: HTTP ${response.status} for ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0, 40).toString().startsWith('version https://git-lfs')) throw new Error(`${s.title}: got a Git LFS pointer`);
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(local, bytes);
  }
  const sha256 = createHash('sha256').update(readFileSync(local)).digest('hex');
  if (sha256 !== s.sha256) throw new Error(`${local}: SHA-256 ${sha256}, expected ${s.sha256}`);
  return local;
}

// --- maths (column-major 4x4, quaternions x y z w) -------------------------------------------------------------------
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const compose = (t, q, s) => {
  const [x, y, z, w] = q, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [(1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0, 2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
};
const apply = (m, p) => [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const c = d < 0 ? b.map(v => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) { const r = a.map((v, i) => v + (c[i] - v) * t), l = Math.hypot(...r); return r.map(v => v / l); }
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + c[i] * wb);
}

// A channel's value at `time` (LINEAR samplers: lerp, slerp for rotations).
function sample(channel, time) {
  const s = channel.getSampler(), inp = s.getInput().getArray(), out = s.getOutput().getArray(), n = channel.getTargetPath() === 'rotation' ? 4 : 3;
  if (time <= inp[0]) return Array.from(out.slice(0, n));
  const last = inp.length - 1;
  if (time >= inp[last]) return Array.from(out.slice(last * n, last * n + n));
  let i = 0;
  while (inp[i + 1] < time) i++;
  const t = (time - inp[i]) / (inp[i + 1] - inp[i]), a = Array.from(out.slice(i * n, i * n + n)), b = Array.from(out.slice((i + 1) * n, (i + 2) * n));
  return n === 4 ? slerp(a, b, t) : a.map((v, k) => v + (b[k] - v) * t);
}

// --- measuring: the skinned crow's vertices at a moment of a clip (null: the nodes' rest pose), in the scene's space --
export function skinner(doc) {
  const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0];
  const skin = root.listSkins()[0], joints = skin.listJoints(), ibm = skin.getInverseBindMatrices().getArray();
  const prim = root.listNodes().find(n => n.getSkin()).getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const pose = (animation, time) => {
    const local = new Map(root.listNodes().map(n => [n, { translation: n.getTranslation(), rotation: n.getRotation(), scale: n.getScale() }]));
    for (const c of animation?.listChannels() ?? []) local.get(c.getTargetNode())[c.getTargetPath()] = sample(c, time);
    const world = new Map();
    const walk = (n, parent) => { const L = local.get(n), m = mul(parent, compose(L.translation, L.rotation, L.scale)); world.set(n, m); for (const c of n.listChildren()) walk(c, m); };
    for (const n of scene.listChildren()) walk(n, IDENTITY);
    return world;
  };
  return (animation = null, time = 0) => {
    const world = pose(animation, time), mats = joints.map((j, i) => mul(world.get(j), Array.from(ibm.slice(i * 16, i * 16 + 16))));
    const out = [], p = [], jj = [], ww = [];
    for (let v = 0; v < P.getCount(); v++) {
      P.getElement(v, p); J.getElement(v, jj); W.getElement(v, ww);
      const acc = [0, 0, 0];
      for (let k = 0; k < 4; k++) if (ww[k]) { const q = apply(mats[jj[k]], p); for (let i = 0; i < 3; i++) acc[i] += q[i] * ww[k]; }
      out.push(acc);
    }
    return out;
  };
}
const boundsOf = (pts) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return { lo, hi };
};
const duration = (a) => Math.max(...a.listChannels().map(c => { const t = c.getSampler().getInput().getArray(); return t[t.length - 1]; }));

// What src/crow.js needs to keep him outside the glass and in view (metres, in his own frame: -Z forward, +Y up):
// front: how far ahead of his origin his foremost point reaches; nose: the same for his head and body alone (within
// 0.1 m of his middle: what meets the pane), wings: for the rest (what could reach the window's frame, which stands
// 2 cm proud of the glass); span: wingspan; below and above: his lowest and highest points; every one the worst over
// the clip, sampled at 60 per second. contact: nose and wings at the moment he meets the glass (Hit at CONTACT s).
// reach (Hit only): how far ahead his foremost point reaches with his body pitched nose-up by 0, 5, ... 180 degrees
// (about his X axis, as src/crow.js flares him at the pane and tumbles him off it), the worst over the clip, rounded up
// to the millimetre.
export const REACH_STEP = 5;
export function measure(doc) {
  const skinned = skinner(doc), out = {};
  for (const a of doc.getRoot().listAnimations()) {
    const T = duration(a), m = { front: 0, nose: 0, wings: 0, back: 0, span: 0, below: 0, above: 0 };
    const pitched = a.getName() === 'Hit' ? Array.from({ length: 180 / REACH_STEP + 1 }, (_, i) => [Math.sin(i * REACH_STEP * Math.PI / 180), Math.cos(i * REACH_STEP * Math.PI / 180), 0]) : [];
    for (let t = 0; t <= T + 1e-6; t += 1 / 60) {
      const pts = skinned(a, Math.min(t, T)), b = boundsOf(pts);
      m.front = Math.max(m.front, -b.lo[2]); m.back = Math.max(m.back, b.hi[2]); m.span = Math.max(m.span, b.hi[0] - b.lo[0]);
      m.below = Math.max(m.below, -b.lo[1]); m.above = Math.max(m.above, b.hi[1]);
      for (const p of pts) { if (Math.abs(p[0]) < 0.1) m.nose = Math.max(m.nose, -p[2]); else m.wings = Math.max(m.wings, -p[2]); }
      for (const r of pitched) for (const p of pts) r[2] = Math.max(r[2], -(p[1] * r[0] + p[2] * r[1]));
    }
    if (pitched.length) m.reach = pitched.map(r => Math.ceil(r[2] * 1000 - 1e-9) / 1000);
    if (a.getName() === 'Hit') {
      const pts = skinned(a, CONTACT);
      m.contact = { nose: Math.max(...pts.filter(p => Math.abs(p[0]) < 0.1).map(p => -p[2])), wings: Math.max(...pts.filter(p => Math.abs(p[0]) >= 0.1).map(p => -p[2])) };
      m.contact = Object.fromEntries(Object.entries(m.contact).map(([k, v]) => [k, +v.toFixed(3)]));
      // The tip of his beak then ([y, z]): what meets the glass first when he rears up.
      const tip = pts.filter(p => Math.abs(p[0]) < 0.1).reduce((a, p) => (-p[2] > -a[2] ? p : a));
      m.beak = [+tip[1].toFixed(4), +tip[2].toFixed(4)];
    }
    out[a.getName()] = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(3) : v]));
    out[a.getName()].duration = +T.toFixed(3);
  }
  return out;
}

// --- the clips ---------------------------------------------------------------------------------------------------------
// Each channel of the timeline sampled at FPS over [t0, t1], shifted to start at 0. loop: the last key made equal to the
// first, the difference spread evenly over the clip (vectors linearly, rotations by a growing share of the correcting
// rotation), so the cycle has no seam. heave: the body's root bone (its translation and rotation) pulled towards its
// pose in the glide, keeping that share of the take-off's motion.
function cut(doc, timeline, name, t0, t1, { loop = false } = {}, heave = 0.25) {
  const buffer = doc.getRoot().listBuffers()[0], clip = doc.createAnimation(name), N = Math.round((t1 - t0) * FPS);
  const glide = 9.3;
  for (const ch of timeline.listChannels()) {
    const node = ch.getTargetNode(), path = ch.getTargetPath(), size = path === 'rotation' ? 4 : 3;
    const keys = Array.from({ length: N + 1 }, (_, i) => sample(ch, t0 + (t1 - t0) * i / N));
    if (loop) {
      if (size === 4) { const fix = qmul(keys[0], qinv(keys[N])); keys.forEach((q, i) => { keys[i] = qmul(slerp([0, 0, 0, 1], fix, i / N), q); }); }
      else { const d = keys[0].map((v, k) => v - keys[N][k]); keys.forEach((v, i) => { keys[i] = v.map((x, k) => x + d[k] * i / N); }); }
    }
    if (name === 'Fast_Flying' && node.getName() === 'CROW__01' && path !== 'scale') {
      const level = sample(ch, glide);
      if (size === 4) keys.forEach((q, i) => { keys[i] = slerp(level, q, heave); });
      else {
        const mean = [0, 1, 2].map(k => keys.reduce((s, v) => s + v[k], 0) / keys.length);
        keys.forEach((v, i) => { keys[i] = v.map((x, k) => level[k] + (x - mean[k]) * heave); });
      }
    }
    const input = doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Float32Array(keys.map((_, i) => (t1 - t0) * i / N)));
    const output = doc.createAccessor().setType(size === 4 ? 'VEC4' : 'VEC3').setBuffer(buffer).setArray(new Float32Array(keys.flat()));
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    clip.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
  }
  return clip;
}

// --- textures ------------------------------------------------------------------------------------------------------
// Lossless PNG, filtered per row (half the size of the default filter on these textures).
const PNG = { compressionLevel: 9, adaptiveFiltering: true, effort: 10 };
const png = (raw, w, h) => sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png(PNG).toBuffer();

// The loose feather cards: islands of the base colour's alpha that are small, long and thin. [x0, y0, x1, y1] in pixels.
async function featherCards(base) {
  const { data, info } = await sharp(base).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, seen = new Uint8Array(W * H), cards = [];
  const solid = (i) => data[i * 4 + 3] > 96;
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || !solid(start)) continue;
    const stack = [start], box = [W, H, 0, 0];
    let area = 0;
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i - x) / W;
      area++;
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && !seen[j] && solid(j)) { seen[j] = 1; stack.push(j); }
      }
    }
    const w = box[2] - box[0] + 1, h = box[3] - box[1] + 1, long = Math.max(w, h), short = Math.min(w, h);
    if (area > W * H * 0.002 && area < W * H * 0.03 && long > 4 * short) cards.push({ box, w, h, area });
  }
  return cards.sort((a, b) => b.area - a.area).slice(0, 5).map(c => ({ ...c, box: [Math.max(0, c.box[0] - 2), Math.max(0, c.box[1] - 2), Math.min(W - 1, c.box[2] + 2), Math.min(H - 1, c.box[3] + 2)], size: W }));
}

// Roughness from the source's gloss map (its G = B channel: white feathers, black eye): satin feathers 0.56, the eye
// 0.16; metalness 0.
async function metalRough(image) {
  const { data, info } = await sharp(image).resize(512, 512).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = Math.round(255 * (0.16 + 0.40 * data[i + 1] / 255)); data[i + 2] = 0; data[i + 3] = 255; }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).removeAlpha().jpeg({ quality: 92 }).toBuffer();
}

// A seeded random for the textures (the same smear every build).
const random = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The smears, from the splatter's densest patch (searched in the same way every build): 'smear' 256 x 320 with a soft
// oval edge; 'smear-wash' 256 x 512, the same patch with every column of it dragged down into streaks of its own
// length (water carrying the blood down the pane), diluted and thinner. Straight (not premultiplied) RGBA.
async function smears(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels, cw = 280, ch = 340;
  let best = null;
  for (let y = 0; y + ch <= H; y += 20) for (let x = 0; x + cw <= W; x += 20) {
    let s = 0;
    for (let j = y; j < y + ch; j += 4) for (let i = x; i < x + cw; i += 4) {
      const dx = (i - x - cw / 2) / (cw / 2), dy = (j - y - ch / 2) / (ch / 2), r = dx * dx + dy * dy, a = data[(j * W + i) * C + 3];
      s += r < 1 ? a * (1 - r) : -0.3 * a;
    }
    if (!best || s > best.s) best = { s, x, y };
  }
  const fresh = await sharp(file).extract({ left: best.x, top: best.y, width: cw, height: ch }).resize(256, 320).raw().toBuffer();
  // A soft oval, a little above the middle (he hit there; the spray settles below it).
  for (let y = 0; y < 320; y++) for (let x = 0; x < 256; x++) {
    const dx = (x + 0.5) / 128 - 1, dy = ((y + 0.5) / 160 - 1 - -0.08) / 1.02, r = Math.sqrt(dx * dx + dy * dy), k = (y * 256 + x) * 4;
    fresh[k + 3] = Math.round(fresh[k + 3] * (1 - smooth(0.55, 0.98, r)));
  }
  const wash = Buffer.alloc(256 * 512 * 4), rnd = random(20261025);
  for (let x = 0; x < 256; x++) {
    const keep = 0.94 + 0.05 * rnd();                                   // this column's streak: 15-100 px
    let r = 0, g = 0, b = 0, a = 0;
    for (let y = 0; y < 512; y++) {
      const k = (y * 256 + x) * 4, src = y < 320 ? fresh.subarray(k, k + 4) : [0, 0, 0, 0];
      a *= keep;
      const sa = src[3] / 255;
      if (sa > a) { r = src[0]; g = src[1]; b = src[2]; a = sa; } else if (sa > 0) { const t = sa / Math.max(a, 1e-3); r += (src[0] - r) * t; g += (src[1] - g) * t; b += (src[2] - b) * t; }
      // Diluted: a thinner, lighter red that the rain spreads.
      wash[k] = Math.min(255, r * 0.8 + 40); wash[k + 1] = Math.min(255, g * 0.8 + 6); wash[k + 2] = Math.min(255, b * 0.8 + 6);
      wash[k + 3] = Math.round(255 * Math.min(1, a) * 0.7);
    }
  }
  const soft = await sharp(wash, { raw: { width: 256, height: 512, channels: 4 } }).blur(1.1).raw().toBuffer();
  return { fresh: await png(fresh, 256, 320), wash: await png(soft, 256, 512), patch: best };
}

// --- geometry ------------------------------------------------------------------------------------------------------
// A quad in the XY plane facing +Z: corners (x0, y0)-(x1, y1); uv rectangle [u0, v0, u1, v1] (glTF: v down), or
// `along: 'v'` to run the texture's v along +X (a feather card painted upright).
function quad(doc, name, material, [x0, y0, x1, y1], [u0, v0, u1, v1], along = 'u') {
  const buffer = doc.getRoot().listBuffers()[0];
  const pos = [x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0];
  // u runs along +X and v down the quad; or v runs along +X and u down.
  const uv = along === 'u' ? [u0, v1, u1, v1, u1, v0, u0, v0] : [u0, v0, u0, v1, u1, v1, u1, v0];
  // glTF tangents: the way u grows, w chosen so that normal x tangent points up the image (the way v shrinks).
  const tangent = along === 'u' ? [1, 0, 0, 1] : [0, 1, 0, 1];
  const acc = (type, array) => doc.createAccessor().setType(type).setBuffer(buffer).setArray(array);
  const prim = doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])))
    .setAttribute('TANGENT', acc('VEC4', new Float32Array([...tangent, ...tangent, ...tangent, ...tangent])))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)))
    .setIndices(acc('SCALAR', new Uint16Array([0, 1, 2, 0, 2, 3])));
  return doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
}

// --- the build -----------------------------------------------------------------------------------------------------
async function build() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(await download(SOURCES.crow));
  const bloodFile = await download(SOURCES.blood);
  const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0];
  const extras = root.getAsset().extras || {};
  if (!/CC-BY-4\.0/.test(extras.license || '')) throw new Error(`Crow: unexpected licence in asset.extras: ${extras.license}`);
  const named = (name) => root.listNodes().find(n => n.getName() === name);
  // Sketchfab's lamp and camera, and an empty duplicate of the armature node.
  for (const name of ['Lamp', 'Camera', 'SK_Crow.001']) { const n = named(name); if (n) { n.traverse(c => { if (c !== n) c.dispose(); }); n.dispose(); } }
  for (const prim of root.listMeshes().flatMap(m => m.listPrimitives())) prim.setAttribute('TEXCOORD_1', null);   // no texture uses it

  // His frame: metres, facing -Z, the middle of his body (wings spread, the rest pose) at the origin.
  const skinnedRest = skinner(doc)(), rest = boundsOf(skinnedRest);
  const centre = rest.lo.map((v, i) => (v + rest.hi[i]) / 2), s = WINGSPAN / (rest.hi[0] - rest.lo[0]);
  const head = named('CROW_ Head_05'), pelvis = named('CROW_ Pelvis_02');
  if (!head || !pelvis) throw new Error('Crow: the skeleton is not the expected one');
  const crow = doc.createNode('crow').setScale([s, s, s]).setRotation([0, 1, 0, 0])            // 180 degrees about Y
    .setTranslation([s * centre[0], -s * centre[1], s * centre[2]]);
  for (const n of scene.listChildren()) { scene.removeChild(n); crow.addChild(n); }
  scene.addChild(crow);
  // The source's beak points +Z: after the turn it must point -Z.
  const w = new Map(); const walk = (n, m) => { const mm = mul(m, n.getMatrix()); w.set(n, mm); n.listChildren().forEach(c => walk(c, mm)); }; walk(crow, IDENTITY);
  if (apply(w.get(head), [0, 0, 0])[2] > apply(w.get(pelvis), [0, 0, 0])[2]) throw new Error('Crow: he does not face -Z');

  // The clips, cut from the one timeline; then the timeline goes.
  const timeline = root.listAnimations()[0];
  for (const [name, [t0, t1, opts]] of Object.entries(CLIPS)) cut(doc, timeline, name, t0, t1, opts);
  for (const c of timeline.listChannels()) c.dispose();
  for (const s of timeline.listSamplers()) s.dispose();       // or their keys stay in the file
  timeline.dispose();

  // Material and textures.
  const material = root.listMaterials()[0];
  const baseImage = material.getBaseColorTexture().getImage(), normalImage = material.getNormalTexture().getImage(), mrImage = material.getMetallicRoughnessTexture().getImage();
  const base = await sharp(baseImage).resize(1024, 1024).png(PNG).toBuffer();
  const texture = (name, image, mime) => doc.createTexture(name).setImage(image).setMimeType(mime);
  const baseTex = texture('crow base colour', base, 'image/png');
  const normalTex = texture('crow normal', await sharp(normalImage).resize(512, 512).jpeg({ quality: 92 }).toBuffer(), 'image/jpeg');
  const mrTex = texture('crow metal-rough', await metalRough(mrImage), 'image/jpeg');
  for (const t of root.listTextures()) if (![baseTex, normalTex, mrTex].includes(t)) t.dispose();
  material.setName('crow').setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true).setMetallicFactor(0).setRoughnessFactor(1)
    .setBaseColorTexture(baseTex).setNormalTexture(normalTex).setMetallicRoughnessTexture(mrTex);

  // The loose feathers, on his own texture.
  const parts = doc.createNode('crow-parts');
  scene.addChild(parts);
  const feather = doc.createMaterial('crow feather').setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true)
    .setMetallicFactor(0).setRoughnessFactor(1).setBaseColorTexture(baseTex).setNormalTexture(normalTex).setMetallicRoughnessTexture(mrTex);
  const cards = await featherCards(base);
  if (cards.length !== 5) throw new Error(`Crow: expected 5 loose feather cards in the texture, found ${cards.length}`);
  const longest = Math.max(...cards.map(c => Math.max(c.w, c.h)));
  cards.forEach((c, i) => {
    const upright = c.h > c.w, L = 0.16 * Math.max(c.w, c.h) / longest, Wd = L * Math.min(c.w, c.h) / Math.max(c.w, c.h);
    const [x0, y0, x1, y1] = c.box.map(v => v / c.size);
    parts.addChild(quad(doc, `feather-${i + 1}`, feather, [-L / 2, -Wd / 2, L / 2, Wd / 2], [x0, y0, x1, y1], upright ? 'v' : 'u'));
  });

  // The smears on the glass.
  const { fresh, wash, patch } = await smears(bloodFile);
  const smearMat = (name, image, alpha) => doc.createMaterial(name).setAlphaMode('BLEND').setDoubleSided(false).setMetallicFactor(0).setRoughnessFactor(0.22)
    .setBaseColorFactor([1, 1, 1, alpha]).setBaseColorTexture(texture(name, image, 'image/png'));
  parts.addChild(quad(doc, 'smear', smearMat('smear', fresh, 0.92), [-0.08, -0.10, 0.08, 0.10], [0, 0, 1, 1]));
  parts.addChild(quad(doc, 'smear-wash', smearMat('smear-wash', wash, 0.6), [-0.08, -0.22, 0.08, 0.10], [0, 0, 1, 1]));

  await doc.transform(resample({ tolerance: 1e-4 }), prune(), dedup());
  root.getAsset().extras = { ...extras, game: 'Built by tools/crow/build.mjs for src/crow.js; see crow.LICENSE.txt' };
  const fit = measure(doc);
  mkdirSync(OUT, { recursive: true });
  const glb = await io.writeBinary(doc);
  writeFileSync(join(OUT, 'crow.glb'), glb);
  writeFileSync(join(OUT, 'crow.LICENSE.txt'), licence(patch));
  console.log(`wrote ${OUT}/crow.glb (${(glb.length / 1e6).toFixed(2)} MB), crow.LICENSE.txt`);
  console.log('scale', s.toFixed(6), 'feather cards', JSON.stringify(cards.map(c => c.box)), 'blood patch', JSON.stringify({ x: patch.x, y: patch.y, w: 280, h: 340 }));
  console.log('CROW_FIT', JSON.stringify(fit));
}

function licence(patch) {
  const c = SOURCES.crow, b = SOURCES.blood;
  return `The crow at the window (public/assets/props/crow.glb), built by tools/crow/build.mjs for src/crow.js.

1. "${c.title}" by ${c.author} (${c.authorUrl}), licensed ${c.license} (${c.licenseUrl}).
   Original: ${c.original}
   Downloaded from the GitHub mirror ${c.repo} at commit ${c.commit} (${c.path}, Git LFS),
   SHA-256 ${c.sha256}. Licence confirmed by ${c.licenseConfirmedVia}.
   Changes: Sketchfab's lamp and camera removed; scaled to a 0.90 m wingspan and turned to face -Z; two clips cut from
   its one animation (a wing beat looped, with the body's climb damped to level flight; the glide into the landing
   that folds the wings); alpha-blended feather cards made alpha-tested; metalness removed and roughness derived from
   its gloss map; textures resized (1024 px base colour, 512 px normal and metal/roughness); five quads added that
   show the loose feather cards painted in its own texture.

2. "${b.title}" by ${b.author} (${b.authorUrl}), ${b.license} (public domain dedication, ${b.licenseUrl}).
   Downloaded from the GitHub mirror ${b.repo} at commit ${b.commit} (${b.path}),
   SHA-256 ${b.sha256}. Licence confirmed by ${b.licenseConfirmedVia}.
   Changes: a 280 x 340 px patch (at ${patch.x}, ${patch.y}) cropped, resized to 256 x 320 and given a soft oval edge
   ('smear'); the same patch dragged down into streaks, diluted and blurred ('smear-wash').
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await build();

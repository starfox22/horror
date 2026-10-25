// Builds the intruder (public/assets/props/intruder.glb) from the sources fetched by fetch.mjs:
//  1. FBX -> glTF with FBX2glTF (npm 'fbx2gltf', BSD): the skinned avatar and each animation separately.
//  2. One GLB: the avatar's mesh and skin, every animation retargeted by bone name (rotations only, plus the root's
//     translation: the clips come from another body of the same Biped skeleton, so their bone offsets would change his
//     proportions), the face's bones left at rest, redundant keys removed.
//  3. Textures: the avatar's own 2048 px TGAs, base colour dyed for the look (below), normal map, and a roughness map
//     derived from its specular map; 1024 px (roughness 512).
//  4. The mask (tools/intruder/mask.json: "Porcelain Mask" by sleepwalker77, CC BY 4.0, downloaded by fetch.mjs) fixed
//     to the head bone: turned upright, its eye holes put on his eyes (scaled to his eye spacing) a little in front of
//     his face, its geometry baked into the bone's rest space. The glaze stays glossy porcelain (not metal), its crackle
//     a little rougher than the glaze; textures cropped to the face's UV island (colour and normal 1024 px, occlusion
//     and roughness 512); the tear of blood from its left eye is kept (simplified, wet and dark red).
// Looks: 'masked' (Male_Adult_18, the game's intruder: hood up, everything dyed near-black with little sheen on the
// cloth (KHR_materials_specular, per texel: cloth 0.15, leather 0.6), black leather gloves, grime worked into both cuffs,
// dried blood on the right glove from "Blood Splatter" by ExileGL (CC0, fetch.mjs BLOOD), the face under the mask) and
// 'plain' (Male_Adult_20 in a charcoal hoodie, the first draft; the sleeper in tools/bake-clips.mjs).
// The mask's fit is checked against his face and hood in the rest pose (printed: the nearest any of them comes to it);
// tools/intruder/fit-check.mjs checks it through every clip.
// Usage: node tools/intruder/fetch.mjs && node tools/intruder/build.mjs [masked|plain]   (needs ffmpeg for the TGAs)
//        [--fit '{"forward": 0.04}' --out trial.glb]: a fitting trial (mask.json's fit overridden, written elsewhere)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsSpecular } from '@gltf-transform/extensions';
import { resample, prune, dedup, mergeDocuments, transformMesh, unpartition, simplifyPrimitive, weldPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { ANIMATIONS, AVATARS, BLOOD, COMMIT, OUT, maskDir } from './fetch.mjs';
import { against, boundaryLoops, rig, Surface } from './fit.mjs';

const FBX2GLTF = 'node_modules/fbx2gltf/bin/Linux/FBX2glTF';
const GLB = join(OUT, 'glb'), TEX = join(OUT, 'tex');
// Options for fitting: --fit '{"forward": 0.04}' overrides mask.json's fit; --out file writes there instead (trials).
const args = process.argv.slice(2), option = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const fitOverride = JSON.parse(option('--fit') || '{}'), outOverride = option('--out');
const LOOK = args[0] || 'masked';
const AVATAR = LOOK === 'plain' ? 'Male_Adult_20' : 'Male_Adult_18', PREFIX = AVATARS[AVATAR];
const TARGET = outOverride || (LOOK === 'plain' ? 'assets-src/intruder/intruder-plain.glb' : 'public/assets/props/intruder.glb');
mkdirSync(GLB, { recursive: true }); mkdirSync(TEX, { recursive: true });

const convert = (fbx, out) => {
  if (!existsSync(`${out}.glb`)) execFileSync(FBX2GLTF, ['-b', '--anim-framerate', 'bake30', '-i', fbx, '-o', out], { stdio: 'pipe' });
  return `${out}.glb`;
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(convert(join(OUT, `${AVATAR}.fbx`), join(GLB, AVATAR)));
const root = doc.getRoot(), buffer = root.listBuffers()[0];
const nodes = new Map(root.listNodes().map(n => [n.getName(), n]));
for (const a of root.listAnimations()) a.dispose();

// Bones whose motion is kept: the body. The face rig stays at rest (the clips carry no facial performance).
const FACE = /Eye|Mouth|Lip|Jaw|Tongue|Cheek|brow|Nose|Masseter|Caninus/i;
const keep = (name, path) => name !== 'Bip01 Footsteps' && !FACE.test(name) && (path === 'rotation' || (path === 'translation' && name === 'Bip01'));
const restHeight = nodes.get('Bip01').getTranslation()[1];
const clips = [];
for (const name of Object.values(ANIMATIONS).flat()) {
  const src = await io.read(convert(join(OUT, `${name}.max.fbx`), join(GLB, name)));
  const animation = src.getRoot().listAnimations()[0];
  if (!animation) throw new Error(`${name}: no animation`);
  const srcHeight = src.getRoot().listNodes().find(n => n.getName() === 'Bip01').getTranslation()[1];
  const clip = doc.createAnimation(name.replace(/^m_/, ''));
  let duration = 0;
  for (const channel of animation.listChannels()) {
    const bone = channel.getTargetNode().getName(), path = channel.getTargetPath(), target = nodes.get(bone);
    if (!target || !keep(bone, path)) continue;
    const sampler = channel.getSampler();
    const times = sampler.getInput().getArray().slice(), values = sampler.getOutput().getArray().slice();
    const t0 = times[0];
    for (let i = 0; i < times.length; i++) times[i] -= t0;
    duration = Math.max(duration, times[times.length - 1]);
    // The root's height scaled to this body's hips (the clip's actor stood a little taller or shorter).
    if (path === 'translation') for (let i = 1; i < values.length; i += 3) values[i] *= restHeight / srcHeight;
    const input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
    const output = doc.createAccessor().setType(sampler.getOutput().getType()).setArray(values).setBuffer(buffer);
    const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    clip.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(s));
  }
  clips.push({ name: clip.getName(), duration: +duration.toFixed(3), channels: clip.listChannels().length });
}

// Textures.
const tga = (name) => {
  const png = join(TEX, `${name}.png`);
  if (!existsSync(png)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', join(OUT, `${name}.tga`), png]);
  return png;
};
const SIZE = 1024;
// Regions of the body sheet (u, v in 0..1; found from the skin: vertices bound to the hands and the wrist ends of the
// forearms): the hands in the bottom corners (the right hand bottom left), the cuffs' ribbing at the foot of each sleeve.
const glove = (u, v) => v > 0.8 && (u < 0.24 || u > 0.76);
const rightGlove = (u, v) => v > 0.84 && u < 0.24;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cuff = (u, v) => (u < 0.3 || u > 0.7) && !glove(u, v) ? smooth(0.755, 0.79, v) * (1 - smooth(0.835, 0.85, v)) : 0;
// Value noise (fixed seed): the grime's patches and specks.
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const noise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
const fbm = (x, y) => 0.55 * noise(x, y) + 0.3 * noise(x * 2.1 + 17, y * 2.1 + 5) + 0.15 * noise(x * 4.3 + 3, y * 4.3 + 29);
// Grime on a cuff: dust and skin grease worn into the ribbing, heaviest at the wrist's edge.
const grime = (u, v) => {
  const c = cuff(u, v);
  if (!c) return 0;
  const edge = 0.45 + 0.55 * smooth(0.79, 0.83, v), patches = smooth(0.38, 0.72, fbm(u * 38, v * 38)), specks = hash(Math.floor(u * 700), Math.floor(v * 700)) > 0.985 ? 0.6 : 0;
  return Math.min(1, c * edge * (patches * 0.85 + specks));
};
// The dried blood on the right glove: ExileGL's spray (alpha), cropped to a dense patch and laid over the hand's island.
let bloodMask = null;
async function bloodOnGlove(width, height) {
  if (bloodMask) return bloodMask;
  const file = join(OUT, 'blood', BLOOD.file.split('/').pop());
  const [x0, y0, x1, y1] = [Math.floor(0.011 * width), Math.floor(0.862 * height), Math.ceil(0.223 * width), Math.ceil(0.988 * height)];
  const { data, info } = await sharp(file).extract({ left: 520, top: 360, width: 560, height: 420 }).resize(x1 - x0, y1 - y0)
    .extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  // Most of it on the back of the hand and the knuckles (the island's right half), a little on the palm, in patches.
  bloodMask = (u, v) => {
    const x = Math.round(u * width) - x0, y = Math.round(v * height) - y0;
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return 0;
    const where = 0.3 + 0.7 * smooth(0.08, 0.13, u), patches = smooth(0.32, 0.56, fbm(u * 14 + 7, v * 14 + 3));
    return (data[y * info.width + x] / 255) * where * patches;
  };
  return bloodMask;
}
async function baseColour(name, dye, part) {
  const { data, info } = await sharp(tga(name)).resize(SIZE, SIZE).raw().toBuffer({ resolveWithObject: true });
  if (LOOK === 'masked') {
    // Near-black: the hoodie and hood, trousers, a balaclava under the mask (the head), black leather gloves (the hands).
    // The cloth keeps a trace of its weave (its own luminance); its sheen is cut in the roughness map's specular.
    const blood = part === 'body' ? await bloodOnGlove(info.width, info.height) : null;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const u = x / info.width, v = y / info.height, k = (y * info.width + x) * info.channels;
      const l = (0.3 * data[k] + 0.55 * data[k + 1] + 0.15 * data[k + 2]) / 255;
      const g = part === 'body' && glove(u, v);
      let rgb = [0.95, 0.97, 1].map(c => c * (g ? 0.035 + l * 0.05 : part === 'head' ? 0.02 + l * 0.03 : 0.016 + l * 0.078));
      if (part === 'body') {
        const dirt = grime(u, v);
        if (dirt) rgb = rgb.map((c, i) => c + ([0.2, 0.18, 0.15][i] - c) * dirt * 0.32);
        const b = rightGlove(u, v) ? blood(u, v) : 0;
        if (b) rgb = rgb.map((c, i) => c + ([0.15, 0.04, 0.032][i] - c) * Math.min(1, b * 1.15) * 0.85);
      }
      data[k] = 255 * rgb[0]; data[k + 1] = 255 * rgb[1]; data[k + 2] = 255 * rgb[2];
    }
    return sharp(data, { raw: info }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }
  if (dye) for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    // The hoodie: the brown cloth in the body sheet's middle column and the sleeves (not the hands below them).
    const u = x / info.width, v = y / info.height, k = (y * info.width + x) * info.channels;
    const cloth = (u > 0.31 && u < 0.69) || (v > 0.45 && v < 0.72);
    const [r, g, b] = [data[k], data[k + 1], data[k + 2]];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0;
    if (!cloth || r < g || g < b || sat < 0.18 || max > 150) continue;
    const l = 0.3 * r + 0.55 * g + 0.15 * b;
    data[k] = l * 0.62; data[k + 1] = l * 0.66; data[k + 2] = l * 0.7;     // a worn charcoal, a touch cold
  }
  return sharp(data, { raw: info }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}
const normal = (name) => sharp(tga(name)).resize(SIZE, SIZE).png({ compressionLevel: 9 }).toBuffer();
// Roughness (G) from the specular map; the masked look also writes the dielectric sheen's strength into alpha
// (KHR_materials_specular's specularTexture): matte cloth, satin leather, dried blood a little glossier.
async function roughness(name, part) {
  const { data, info } = await sharp(tga(name)).resize(SIZE / 2, SIZE / 2).greyscale().raw().toBuffer({ resolveWithObject: true });
  const masked = LOOK === 'masked', channels = masked ? 4 : 3, out = Buffer.alloc(info.width * info.height * channels);
  const blood = masked && part === 'body' ? await bloodOnGlove(info.width, info.height) : null;
  for (let i = 0; i < info.width * info.height; i++) {
    const spec = data[i * info.channels] / 255, u = (i % info.width) / info.width, v = Math.floor(i / info.width) / info.height;
    let r = Math.min(0.96, Math.max(0.38, 0.97 - spec * 0.75)), f = 1;
    if (masked) {
      const g = part === 'body' && glove(u, v), b = part === 'body' && rightGlove(u, v) ? Math.min(1, blood(u, v) * 1.15) : 0;
      r = g ? 0.55 : 0.92; f = g ? 0.6 : 0.15;
      if (b) { r += (0.5 - r) * b; f += (0.5 - f) * b; }
      if (part === 'body') { const dirt = grime(u, v); r += (1 - r) * dirt; }
    }
    out[i * channels] = 255; out[i * channels + 1] = Math.round(255 * r); out[i * channels + 2] = 0;
    if (masked) out[i * channels + 3] = Math.round(255 * f);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels } }).png({ compressionLevel: 9 }).toBuffer();
}
for (const t of root.listTextures()) t.dispose();
const specular = LOOK === 'masked' ? doc.createExtension(KHRMaterialsSpecular) : null;
for (const material of root.listMaterials()) {
  const part = /head/.test(material.getName()) ? 'head' : 'body';
  const tex = (image, mime, label) => doc.createTexture(`${part} ${label}`).setImage(image).setMimeType(mime);
  const rough = tex(await roughness(`${PREFIX}_${part}_specular`, part), 'image/png', 'roughness');
  material.setBaseColorTexture(tex(await baseColour(`${PREFIX}_${part}_color`, part === 'body', part), 'image/jpeg', 'colour'))
    .setNormalTexture(tex(await normal(`${PREFIX}_${part}_normal`), 'image/png', 'normal'))
    .setMetallicRoughnessTexture(rough)
    .setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1).setEmissiveFactor([0, 0, 0]).setAlphaMode('OPAQUE');
  // The sheen's strength: per texel on the body (cloth, leather, blood), one value on the balaclava.
  if (specular) material.setExtension('KHR_materials_specular', part === 'body' ? specular.createSpecular().setSpecularFactor(1).setSpecularTexture(rough)
    : specular.createSpecular().setSpecularFactor(0.15));
}

// Column-major 4x4 matrices (glTF's layout), just what the mask's fit needs.
const mat4 = {
  identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul: (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; },
  translation: ([x, y, z]) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  scaling: (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1],
  rotationX: (a) => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1],
  // A rigid transform's inverse (rotation and translation; the head bone has no scale).
  invertRigid: (m) => {
    const o = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
    for (let r = 0; r < 3; r++) o[12 + r] = -(o[r] * m[12] + o[4 + r] * m[13] + o[8 + r] * m[14]);
    return o;
  },
};

// The mask over the balaclava: a rigid child of the head bone, so every clip carries it.
const maskSpec = JSON.parse(readFileSync(new URL('./mask.json', import.meta.url), 'utf8'));
if (LOOK === 'masked') {
  const fit = { ...maskSpec.fit, ...fitOverride }, dir = maskDir(maskSpec);
  const mdoc = await io.read(join(dir, 'scene.gltf'));
  const mroot = mdoc.getRoot(), head = nodes.get('Bip01 Head');
  const meshNodes = mroot.listNodes().filter(n => n.getMesh());
  const faceNode = meshNodes.find(n => n.getMesh().listPrimitives().some(p => p.getMaterial()?.getBaseColorTexture()));
  const bloodNode = meshNodes.find(n => n !== faceNode);
  const face = faceNode.getMesh().listPrimitives()[0];
  // 1. Upright, its face to +Z (his forward at rest): the model's own transforms, then rotateX and tilt.
  const upright = mat4.rotationX((fit.rotateX + fit.tilt) * Math.PI / 180);
  for (const n of meshNodes) transformMesh(n.getMesh(), mat4.mul(upright, n.getWorldMatrix()));
  const points = (prim) => { const a = prim.getAttribute('POSITION'), v = []; return Array.from({ length: a.getCount() }, (_, i) => [...a.getElement(i, v)]); };
  // 2. Its eye holes: the boundary loops left and right of its middle (the longest loop is the rim; the mouth is central).
  const facePoints = points(face), width = Math.max(...facePoints.map(p => p[0])) - Math.min(...facePoints.map(p => p[0]));
  const eyes = boundaryLoops(facePoints, face.getIndices().getArray()).slice(1).filter(l => Math.abs(l.centre[0]) > 0.1 * width).slice(0, 2);
  if (eyes.length !== 2) throw new Error('mask: its eye holes were not found');
  const holes = eyes.map(l => l.centre), holeMid = holes[0].map((x, k) => (x + holes[1][k]) / 2), holeSpan = Math.hypot(...holes[0].map((x, k) => x - holes[1][k]));
  // 3. His eyes (the rest pose's eye bones): the holes onto them, scaled to their spacing, a little in front of his face.
  const at = (name) => nodes.get(name).getWorldMatrix().slice(12, 15);
  const eyeR = at('Bip01 REye'), eyeL = at('Bip01 LEye'), eyeMid = eyeR.map((x, k) => (x + eyeL[k]) / 2);
  const scale = fit.scale * Math.hypot(...eyeR.map((x, k) => x - eyeL[k])) / holeSpan;
  const place = [mat4.translation([eyeMid[0], eyeMid[1] + fit.lift, eyeMid[2] + fit.forward]), mat4.scaling(scale), mat4.translation(holeMid.map(x => -x))].reduce(mat4.mul);
  for (const n of meshNodes) transformMesh(n.getMesh(), place);
  // 4. How near his face (the balaclava) and his hood come to it, standing at rest (fit-check.mjs: every clip).
  const body = rig(doc);
  body.update();
  const skinned = root.listNodes().find(n => n.getSkin());
  const mask = new Surface(points(face), face.getIndices().getArray());
  const report = {};
  for (const prim of skinned.getMesh().listPrimitives()) {
    const part = /head/.test(prim.getMaterial().getName()) ? 'face' : 'hood';
    let nearest = Infinity, through = 0;
    for (const p of body.skin(skinned, prim)) {
      const q = against(mask, p, [0, 0, 1]);
      if (q?.behind !== undefined) nearest = Math.min(nearest, q.behind); else if (q) through++;
    }
    report[part] = { 'closest behind (mm)': +(nearest * 1000).toFixed(1), 'in front of it': through };
  }
  console.log('mask', { scale: +scale.toFixed(5), size: [0, 1, 2].map(k => +(scale * (Math.max(...facePoints.map(p => p[k])) - Math.min(...facePoints.map(p => p[k])))).toFixed(3)), ...report });
  // 5. The face's material: glossy glaze, not metal; the crackle a little rougher; textures cropped to the face's UV
  //    island; its occlusion kept. The spare UV sets and the vertex colours (a copy of the occlusion) go.
  const uv = face.getAttribute('TEXCOORD_0'), t = [], uvs = Array.from({ length: uv.getCount() }, (_, i) => [...uv.getElement(i, t)]);
  // A few rim vertices sit at UV (0, 0), outside the island: they take their nearest neighbour's.
  for (const [i, q] of uvs.entries()) if (q[0] === 0 && q[1] === 0) {
    let best = null, bestD = Infinity;
    for (const [j, r] of uvs.entries()) if (r[0] || r[1]) { const d = Math.hypot(...facePoints[i].map((x, k) => x - facePoints[j][k])); if (d < bestD) { bestD = d; best = r; } }
    q[0] = best[0]; q[1] = best[1];
  }
  const material = face.getMaterial(), colour = material.getBaseColorTexture(), normalMap = material.getNormalTexture(), orm = material.getMetallicRoughnessTexture();
  const { width: W, height: H } = await sharp(Buffer.from(colour.getImage())).metadata();
  const u0 = Math.min(...uvs.map(q => q[0])), u1 = Math.max(...uvs.map(q => q[0])), v0 = Math.min(...uvs.map(q => q[1])), v1 = Math.max(...uvs.map(q => q[1]));
  const crop = { left: Math.max(0, Math.floor(u0 * W) - 8), top: Math.max(0, Math.floor(v0 * H) - 8) };
  crop.width = Math.min(W, Math.ceil(u1 * W) + 8) - crop.left; crop.height = Math.min(H, Math.ceil(v1 * H) + 8) - crop.top;
  for (const [i, q] of uvs.entries()) uv.setElement(i, [(q[0] * W - crop.left) / crop.width, (q[1] * H - crop.top) / crop.height]);
  for (const semantic of face.listSemantics()) if (/^TEXCOORD_[1-9]|^COLOR_/.test(semantic)) face.setAttribute(semantic, null);
  const size = (px) => ({ width: px, height: Math.round(px * crop.height / crop.width) }), small = size(512);
  const cropped = (texture) => sharp(Buffer.from(texture.getImage())).extract(crop);
  // Occlusion (R) as the model has it; roughness (G): the glaze 0.14, up to 0.42 in the crackle (the colour's fine dark
  // lines: its luminance below a blur of itself); metal (B) none.
  const ao = await cropped(orm).resize(small).extractChannel(0).raw().toBuffer();
  const lum = await cropped(colour).resize(small).greyscale().raw().toBuffer();
  const blurred = await sharp(lum, { raw: { ...small, channels: 1 } }).blur(2.5).raw().toBuffer();
  colour.setImage(await cropped(colour).resize(size(1024)).jpeg({ quality: 92, mozjpeg: true }).toBuffer()).setMimeType('image/jpeg');
  normalMap.setImage(await cropped(normalMap).resize(size(1024)).png({ compressionLevel: 9 }).toBuffer()).setMimeType('image/png');
  const ormOut = Buffer.alloc(small.width * small.height * 3);
  for (let i = 0; i < small.width * small.height; i++) {
    const crackle = Math.min(1, Math.max(0, (blurred[i] - lum[i]) / 28));
    ormOut[i * 3] = ao[i]; ormOut[i * 3 + 1] = Math.round(255 * (0.14 + 0.28 * crackle)); ormOut[i * 3 + 2] = 0;
  }
  orm.setImage(await sharp(ormOut, { raw: { ...small, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer()).setMimeType('image/png');
  // Its ivory reaches pure white in the texture: held to 0.8 (glazed porcelain's albedo) so a torch held close still
  // shows the crackle instead of a blown-out white.
  material.setName('mask porcelain').setBaseColorFactor([0.8, 0.8, 0.8, 1]).setMetallicFactor(0).setRoughnessFactor(1).setOcclusionTexture(orm);
  colour.setName('mask colour'); normalMap.setName('mask normal'); orm.setName('mask occlusion roughness');
  faceNode.setName('mask face'); faceNode.getMesh().setName('mask face');
  // 6. The tear: welded and simplified (the model's is a 35k-triangle metaball), wet blood: dark red, glossy, no metal.
  if (bloodNode) {
    const blood = bloodNode.getMesh().listPrimitives()[0], before = blood.getIndices().getCount() / 3;
    weldPrimitive(blood);
    simplifyPrimitive(blood, { simplifier: MeshoptSimplifier, ratio: Math.min(1, fit.bloodTriangles / before), error: 0.002 });
    blood.getMaterial().setName('mask blood').setBaseColorFactor([0.14, 0.004, 0.006, 1]).setMetallicFactor(0).setRoughnessFactor(0.16);
    bloodNode.setName('mask blood'); bloodNode.getMesh().setName('mask blood');
    console.log('mask blood', before, '->', blood.getIndices().getCount() / 3, 'triangles');
  }
  // 7. Into the head bone's space, under the head bone.
  const toHead = mat4.invertRigid(head.getWorldMatrix());
  for (const n of meshNodes) { transformMesh(n.getMesh(), toHead); n.setMatrix(mat4.identity()); }
  const map = mergeDocuments(doc, mdoc);
  for (const n of meshNodes) {
    const node = map.get(n);
    for (const p of node.listParents()) if (p.propertyType === 'Node' || p.propertyType === 'Scene') p.removeChild(node);
    head.addChild(node);
  }
  const scene = root.listScenes()[0];
  for (const s of root.listScenes()) if (s !== scene) s.dispose();
  root.setDefaultScene(scene);
}

await doc.transform(unpartition(), resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), dedup());
root.getAsset().copyright = 'Copyright (c) 2020 Microsoft (Microsoft Rocketbox Avatar Library), MIT License';
const maskCredit = `"${maskSpec.title}" by ${maskSpec.author} (${maskSpec.authorUrl}), ${maskSpec.license.replace(/-/g, ' ').replace('CC BY 4 0', 'CC BY 4.0')}, ${maskSpec.source}, from the GitHub mirror ${maskSpec.mirror} (commit ${maskSpec.commit})`;
const bloodCredit = `"${BLOOD.title}" by ${BLOOD.author}, CC0 1.0, ${BLOOD.source}, from the GitHub mirror ${BLOOD.mirror} (commit ${BLOOD.commit})`;
root.getAsset().extras = {
  source: 'https://github.com/microsoft/Microsoft-Rocketbox', sourceCommit: COMMIT, avatar: AVATAR, license: 'MIT',
  licenseUrl: `https://github.com/microsoft/Microsoft-Rocketbox/blob/${COMMIT}/LICENSE.md`,
  modifications: `FBX converted to glTF; animations from the library retargeted by bone name (rotations and root translation); ${LOOK === 'masked'
    ? `clothes, head and hands dyed near-black with little sheen (hood, balaclava, leather gloves), grime on the cuffs, dried blood on the right glove (${bloodCredit}: its spray recoloured and laid over the glove); a mask added (${maskCredit}: fitted to the head, its eye holes on his eyes; the glaze made non-metallic with a rougher crackle; its blood tear simplified; textures cropped to the face and resized)`
    : 'hoodie dyed charcoal'}; textures resized to 1024 px; roughness derived from the specular map.`,
  clips,
};
await io.write(TARGET, doc);
if (!outOverride) writeFileSync(TARGET.replace('.glb', '.LICENSE.txt'), `The intruder: "${AVATAR}" and its animations from the Microsoft Rocketbox Avatar Library\n` +
  `https://github.com/microsoft/Microsoft-Rocketbox (commit ${COMMIT}).\nModified for this game: ${root.getAsset().extras.modifications}\n\n` +
  readFileSync(join(OUT, 'LICENSE.md'), 'utf8') +
  (LOOK === 'masked' ? `\n\n---\nThe mask: ${readFileSync(join(maskDir(maskSpec), 'license.txt'), 'utf8')}` +
    `\n\n---\nThe blood on the glove: ${bloodCredit}. Dedicated to the public domain (CC0 1.0): https://creativecommons.org/publicdomain/zero/1.0/\n` : ''));
console.log(TARGET, (readFileSync(TARGET).length / 1e6).toFixed(2), 'MB');
console.table(clips);

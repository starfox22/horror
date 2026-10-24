// Builds the intruder (public/assets/props/intruder.glb) from the Rocketbox sources fetched by fetch.mjs:
//  1. FBX -> glTF with FBX2glTF (npm 'fbx2gltf', BSD): the skinned avatar and each animation separately.
//  2. One GLB: the avatar's mesh and skin, every animation retargeted by bone name (rotations only, plus the root's
//     translation: the clips come from another body of the same Biped skeleton, so their bone offsets would change his
//     proportions), the face's bones left at rest, redundant keys removed.
//  3. Textures: the avatar's own 2048 px TGAs, base colour dyed for the look (below), normal map, and a roughness map
//     derived from its specular map; 1024 px.
//  4. The mask (tools/intruder/mask.json: "White Mask" by shedmon, CC BY 4.0, downloaded by fetch.mjs) fixed to the head
//     bone: its geometry baked into the bone's rest space (fit: tilt, scale, where its centre sits on the standing
//     avatar), textures 1024 px.
// Looks: 'masked' (Male_Adult_18, the game's intruder: hood up, everything dyed black, black leather gloves, the face
// under a mask) and 'plain' (Male_Adult_20 in a charcoal hoodie, the first draft; kept for later).
// Usage: node tools/intruder/fetch.mjs && node tools/intruder/build.mjs [masked|plain]   (needs ffmpeg for the TGAs)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup, mergeDocuments, transformMesh, unpartition } from '@gltf-transform/functions';
import { ANIMATIONS, AVATARS, COMMIT, OUT } from './fetch.mjs';

const FBX2GLTF = 'node_modules/fbx2gltf/bin/Linux/FBX2glTF';
const GLB = join(OUT, 'glb'), TEX = join(OUT, 'tex');
const LOOK = process.argv[2] || 'masked';
const AVATAR = LOOK === 'plain' ? 'Male_Adult_20' : 'Male_Adult_18', PREFIX = AVATARS[AVATAR];
const TARGET = LOOK === 'plain' ? 'assets-src/intruder/intruder-plain.glb' : 'public/assets/props/intruder.glb';
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
async function baseColour(name, dye, part) {
  const { data, info } = await sharp(tga(name)).resize(SIZE, SIZE).raw().toBuffer({ resolveWithObject: true });
  if (LOOK === 'masked') {
    // Everything black: the hoodie and hood, trousers, a balaclava under the mask (the head), black leather gloves (the
    // hands, bottom corners of the body sheet). The cloth keeps a trace of its weave; the gloves a faint sheen.
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const u = x / info.width, v = y / info.height, k = (y * info.width + x) * info.channels;
      const l = (0.3 * data[k] + 0.55 * data[k + 1] + 0.15 * data[k + 2]) / 255;
      const glove = part === 'body' && v > 0.8 && (u < 0.24 || u > 0.76);
      const out = glove ? 0.035 + l * 0.05 : part === 'head' ? 0.03 + l * 0.04 : 0.025 + l * 0.11;
      data[k] = 255 * out * 0.95; data[k + 1] = 255 * out * 0.97; data[k + 2] = 255 * out;
    }
    return sharp(data, { raw: info }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
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
async function roughness(name, part) {
  const { data, info } = await sharp(tga(name)).resize(SIZE / 2, SIZE / 2).greyscale().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const spec = data[i * info.channels] / 255, u = (i % info.width) / info.width, v = Math.floor(i / info.width) / info.height;
    let r = Math.min(0.96, Math.max(0.38, 0.97 - spec * 0.75));
    if (LOOK === 'masked') r = part === 'body' && v > 0.8 && (u < 0.24 || u > 0.76) ? 0.42 : 0.9;   // leather gloves; matte cloth
    out[i * 3] = 255; out[i * 3 + 1] = Math.round(255 * r); out[i * 3 + 2] = 0;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
}
for (const t of root.listTextures()) t.dispose();
for (const material of root.listMaterials()) {
  const part = /head/.test(material.getName()) ? 'head' : 'body';
  const tex = (image, mime, label) => doc.createTexture(`${part} ${label}`).setImage(image).setMimeType(mime);
  material.setBaseColorTexture(tex(await baseColour(`${PREFIX}_${part}_color`, part === 'body', part), 'image/jpeg', 'colour'))
    .setNormalTexture(tex(await normal(`${PREFIX}_${part}_normal`), 'image/png', 'normal'))
    .setMetallicRoughnessTexture(tex(await roughness(`${PREFIX}_${part}_specular`, part), 'image/png', 'roughness'))
    .setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1).setEmissiveFactor([0, 0, 0]).setAlphaMode('OPAQUE');
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
if (LOOK === 'masked') {
  const spec = JSON.parse(readFileSync(new URL('./mask.json', import.meta.url), 'utf8'));
  const mdoc = await io.read(join(OUT, 'mask', 'scene.gltf'));
  const mroot = mdoc.getRoot(), head = nodes.get('Bip01 Head');
  // fit: the model's own centre to the origin, tilted upright (rotateX), scaled to a face, moved onto the face.
  const meshNodes = mroot.listNodes().filter(n => n.getMesh());
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], v = [0, 0, 0];
  for (const n of meshNodes) {
    const w = n.getWorldMatrix();
    for (const prim of n.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        for (let k = 0; k < 3; k++) { const c = w[k] * v[0] + w[4 + k] * v[1] + w[8 + k] * v[2] + w[12 + k]; lo[k] = Math.min(lo[k], c); hi[k] = Math.max(hi[k], c); }
      }
    }
  }
  const fit = [mat4.translation(spec.fit.at), mat4.scaling(spec.fit.scale), mat4.rotationX(spec.fit.rotateX * Math.PI / 180),
    mat4.translation([0, 1, 2].map(k => -(lo[k] + hi[k]) / 2))].reduce(mat4.mul);
  const toHead = mat4.invertRigid(head.getWorldMatrix());
  for (const n of meshNodes) {
    transformMesh(n.getMesh(), mat4.mul(toHead, mat4.mul(fit, n.getWorldMatrix())));
    n.setMatrix(mat4.identity());
  }
  // Textures from 4096 px down to 1024 (colour, JPEG) and 512 (normal and roughness, PNG): a smooth face.
  for (const t of mroot.listTextures()) {
    const jpeg = t.getMimeType() === 'image/jpeg', size = jpeg ? 1024 : 512;
    const image = sharp(Buffer.from(t.getImage())).resize(size, size);
    t.setImage(await (jpeg ? image.jpeg({ quality: 90, mozjpeg: true }) : image.png({ compressionLevel: 9 })).toBuffer());
  }
  for (const material of mroot.listMaterials()) material.setName(`mask ${material.getName()}`);
  const map = mergeDocuments(doc, mdoc);
  for (const n of meshNodes) {
    const node = map.get(n);
    node.setName(`mask ${n.getName()}`);
    for (const p of node.listParents()) if (p.propertyType === 'Node' || p.propertyType === 'Scene') p.removeChild(node);
    head.addChild(node);
  }
  const scene = root.listScenes()[0];
  for (const s of root.listScenes()) if (s !== scene) s.dispose();
  root.setDefaultScene(scene);
}

await doc.transform(unpartition(), resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), dedup());
root.getAsset().copyright = 'Copyright (c) 2020 Microsoft (Microsoft Rocketbox Avatar Library), MIT License';
root.getAsset().extras = {
  source: 'https://github.com/microsoft/Microsoft-Rocketbox', sourceCommit: COMMIT, avatar: AVATAR, license: 'MIT',
  licenseUrl: `https://github.com/microsoft/Microsoft-Rocketbox/blob/${COMMIT}/LICENSE.md`,
  modifications: `FBX converted to glTF; animations from the library retargeted by bone name (rotations and root translation); ${LOOK === 'masked' ? 'clothes, head and hands dyed black (hood, balaclava, leather gloves); a mask added ("White Mask" by shedmon, CC BY 4.0, https://sketchfab.com/3d-models/white-mask-c0d85900a7be438c8d2400bb71649d31: fitted to the head, textures resized)' : 'hoodie dyed charcoal'}; textures resized to 1024 px; roughness derived from the specular map.`,
  clips,
};
await io.write(TARGET, doc);
writeFileSync(TARGET.replace('.glb', '.LICENSE.txt'), `The intruder: "${AVATAR}" and its animations from the Microsoft Rocketbox Avatar Library\n` +
  `https://github.com/microsoft/Microsoft-Rocketbox (commit ${COMMIT}).\nModified for this game: ${root.getAsset().extras.modifications}\n\n` +
  readFileSync(join(OUT, 'LICENSE.md'), 'utf8') +
  (LOOK === 'masked' ? `\n\n---\nThe mask: ${readFileSync(join(OUT, 'mask', 'license.txt'), 'utf8')}` : ''));
console.log(TARGET, (readFileSync(TARGET).length / 1e6).toFixed(2), 'MB');
console.table(clips);

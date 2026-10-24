// Builds the intruder (public/assets/props/intruder.glb) from the Rocketbox sources fetched by fetch.mjs:
//  1. FBX -> glTF with FBX2glTF (npm 'fbx2gltf', BSD): the skinned avatar and each animation separately.
//  2. One GLB: the avatar's mesh and skin, every animation retargeted by bone name (rotations only, plus the root's
//     translation: the clips come from another body of the same Biped skeleton, so their bone offsets would change his
//     proportions), the face's bones left at rest, redundant keys removed.
//  3. Textures: the avatar's own 2048 px TGAs, base colour (the brown hoodie dyed charcoal, so he reads as a dark shape at
//     night), normal map, and a roughness map derived from its specular map; 1024 px.
// Usage: node tools/intruder/fetch.mjs && node tools/intruder/build.mjs   (needs ffmpeg for the TGA files)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup } from '@gltf-transform/functions';
import { ANIMATIONS, COMMIT, OUT } from './fetch.mjs';

const FBX2GLTF = 'node_modules/fbx2gltf/bin/Linux/FBX2glTF';
const GLB = join(OUT, 'glb'), TEX = join(OUT, 'tex');
const TARGET = 'public/assets/props/intruder.glb';
mkdirSync(GLB, { recursive: true }); mkdirSync(TEX, { recursive: true });

const convert = (fbx, out) => {
  if (!existsSync(`${out}.glb`)) execFileSync(FBX2GLTF, ['-b', '--anim-framerate', 'bake30', '-i', fbx, '-o', out], { stdio: 'pipe' });
  return `${out}.glb`;
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(convert(join(OUT, 'Male_Adult_20.fbx'), join(GLB, 'avatar')));
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
async function baseColour(name, dye) {
  const { data, info } = await sharp(tga(name)).resize(SIZE, SIZE).raw().toBuffer({ resolveWithObject: true });
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
async function roughness(name) {
  const { data, info } = await sharp(tga(name)).resize(SIZE / 2, SIZE / 2).greyscale().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const spec = data[i * info.channels] / 255;
    out[i * 3] = 255; out[i * 3 + 1] = Math.round(255 * Math.min(0.96, Math.max(0.38, 0.97 - spec * 0.75))); out[i * 3 + 2] = 0;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
}
for (const t of root.listTextures()) t.dispose();
for (const material of root.listMaterials()) {
  const part = /head/.test(material.getName()) ? 'head' : 'body';
  const tex = (image, mime, label) => doc.createTexture(`${part} ${label}`).setImage(image).setMimeType(mime);
  material.setBaseColorTexture(tex(await baseColour(`m027_${part}_color`, part === 'body'), 'image/jpeg', 'colour'))
    .setNormalTexture(tex(await normal(`m027_${part}_normal`), 'image/png', 'normal'))
    .setMetallicRoughnessTexture(tex(await roughness(`m027_${part}_specular`), 'image/png', 'roughness'))
    .setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1).setEmissiveFactor([0, 0, 0]).setAlphaMode('OPAQUE');
}

await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), dedup());
root.getAsset().copyright = 'Copyright (c) 2020 Microsoft (Microsoft Rocketbox Avatar Library), MIT License';
root.getAsset().extras = {
  source: 'https://github.com/microsoft/Microsoft-Rocketbox', sourceCommit: COMMIT, avatar: 'Male_Adult_20', license: 'MIT',
  licenseUrl: `https://github.com/microsoft/Microsoft-Rocketbox/blob/${COMMIT}/LICENSE.md`,
  modifications: 'FBX converted to glTF; animations from the library retargeted by bone name (rotations and root translation); hoodie dyed charcoal; textures resized to 1024 px; roughness derived from the specular map.',
  clips,
};
await io.write(TARGET, doc);
writeFileSync(TARGET.replace('.glb', '.LICENSE.txt'), `The intruder: "Male_Adult_20" and its animations from the Microsoft Rocketbox Avatar Library\n` +
  `https://github.com/microsoft/Microsoft-Rocketbox (commit ${COMMIT}).\nModified for this game: ${root.getAsset().extras.modifications}\n\n` +
  readFileSync(join(OUT, 'LICENSE.md'), 'utf8'));
console.log(TARGET, (readFileSync(TARGET).length / 1e6).toFixed(2), 'MB');
console.table(clips);

// Turns the Vite build (dist/) into dist-artifact/ for publishing as a claude.ai artifact.
// - The host wraps the page in its own <html>/<head>/<body>, so index.html keeps only its title, links and scripts.
// - The host serves no .bin/.ktx2 files, so the apartment (scene.gltf + geometry-*.bin + textures/*.ktx2) is packed into
//   one GLB, split into ~10 MB base64 text parts (assets/apartment/apartment-N.txt) plus a manifest (apartment.json);
//   src/main.js downloads the parts, reassembles the GLB in memory and loads it from a blob URL.
// Prints the JSON list of supporting files for the Artifact tool's `files` (with `root: dist-artifact`).
// The host takes at most 64 MB per publish call: publish the list in slices to the same url.
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';

const SRC = 'dist', OUT = 'dist-artifact', APT = `${OUT}/assets/apartment`, PART = 10 * 1024 * 1024;
rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

const html = readFileSync(`${SRC}/index.html`, 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1].replace(/<meta[^>]*>\s*/g, '');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
writeFileSync(`${OUT}/index.html`, `${head.trim()}\n${body.trim()}\n`);

// --- pack the glTF into a GLB -----------------------------------------------------------------------------------
const gltf = JSON.parse(readFileSync(`${APT}/scene.gltf`, 'utf8'));
const chunks = [];
let size = 0;
const append = (bytes) => { const at = size; chunks.push(bytes); size += bytes.length; const pad = (4 - (size % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); size += pad; } return at; };
const bufferStart = gltf.buffers.map(b => append(readFileSync(`${APT}/${b.uri}`)));
for (const bv of gltf.bufferViews) { bv.byteOffset = (bv.byteOffset || 0) + bufferStart[bv.buffer]; bv.buffer = 0; }
for (const img of gltf.images || []) {
  const bytes = readFileSync(`${APT}/${img.uri}`);
  img.mimeType ??= img.uri.endsWith('.ktx2') ? 'image/ktx2' : img.uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
  img.bufferView = gltf.bufferViews.push({ buffer: 0, byteOffset: append(bytes), byteLength: bytes.length }) - 1;
  delete img.uri;
}
gltf.buffers = [{ byteLength: size }];
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const bin = Buffer.concat(chunks);
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([header, jh, json, bh, bin]);

for (const f of readdirSync(APT)) if (f !== 'collision.json') rmSync(`${APT}/${f}`, { recursive: true });
const parts = [];
for (let at = 0, n = 0; at < glb.length; at += PART, n++) {
  const file = `apartment-${n}.txt`;
  writeFileSync(`${APT}/${file}`, glb.subarray(at, at + PART).toString('base64'));
  parts.push({ file, bytes: Math.min(PART, glb.length - at) });
}
writeFileSync(`${APT}/apartment.json`, JSON.stringify({ bytes: glb.length, parts }));

const files = readdirSync(OUT, { recursive: true }).filter(f => f !== 'index.html' && statSync(`${OUT}/${f}`).isFile()).sort();
const total = files.reduce((n, f) => n + statSync(`${OUT}/${f}`).size, 0);
console.log(JSON.stringify(files.map(f => ({ path: f }))));
console.error(`GLB ${(glb.length / 1e6).toFixed(1)} MB in ${parts.length} parts; ${files.length} supporting files, ${(total / 1e6).toFixed(1)} MB`);

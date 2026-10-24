// Validate a GLB with the Khronos glTF-Validator (npm gltf-validator, installed under downloads/).
//   node work/arm/scripts/validate_glb.mjs FILE.glb
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../downloads/npm-gltf-validator/package.json'));
const validator = require('gltf-validator');
const file = process.argv[2];
const report = await validator.validateBytes(new Uint8Array(fs.readFileSync(file)), { maxIssues: 50 });
const i = report.issues;
console.log(`glTF-Validator ${report.validatorVersion}: errors ${i.numErrors}, warnings ${i.numWarnings}, infos ${i.numInfos}, hints ${i.numHints}`);
for (const m of i.messages) console.log(`  [${['error', 'warning', 'info', 'hint'][m.severity]}] ${m.code} ${m.pointer || ''}: ${m.message}`);
const info = report.info;
console.log('  info:', JSON.stringify({ totalVertexCount: info.totalVertexCount, totalTriangleCount: info.totalTriangleCount, maxInfluences: info.maxInfluences, maxUVs: info.maxUVs, materialCount: info.materialCount, animationCount: info.animationCount, hasSkins: info.hasSkins, resources: info.resources?.map(r => `${r.storage}:${r.mimeType || ''}:${r.byteLength}${r.image ? ` ${r.image.width}x${r.image.height}` : ''}`) }));

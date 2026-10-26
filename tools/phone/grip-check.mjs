// Offline phone/hand fit check. Uses the shipped GLBs, actual ArmRig IK and skin weights; no browser or image edits.
// node tools/phone/grip-check.mjs [--baseline] [--report /tmp/phone-grip.json]
// --baseline measures build 0.16 and intentionally exits nonzero: it is the regression demonstration.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Entity, Mat4, Quat, Vec3 } from 'playcanvas';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { HAND } from '../../src/phone-grip.js';
import { Phone } from '../../src/phone.js';
import { PhoneMotion } from '../../src/phone-motion.js';
import { ArmRig, frameRotation } from '../../src/arm-rig.js';
import { rig, Surface } from '../intruder/fit.mjs';

export const BASELINE_HAND = {
  palm: new Vec3(0.024, -0.058, -0.0068), fingers: new Vec3(-1, 0.12, 0), facing: new Vec3(0, 0, 1),
  grip: 0.5, shoulder: new Vec3(0.19, -0.25, 0.09),
};
const root = fileURLToPath(new URL('../..', import.meta.url));
const v3 = a => new Vec3(...a);
const round = n => +n.toFixed(3);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// Clip a projected skin triangle against the active screen. This also catches an edge crossing the display when no
// triangle vertex happens to land inside it; the halfspace first removes skin behind the screen's glass.
function clip(poly, coordinate, bound, sign) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = sign * (a[coordinate] - bound), db = sign * (b[coordinate] - bound);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const k = da / (da - db); out.push(a.map((x, c) => x + (b[c] - x) * k)); }
  }
  return out;
}
function screenArea(triangle, screen, eye) {
  let p = clip(triangle, 2, screen.z + 0.00001, 1);
  p = p.map(v => { const k = (screen.z - eye.z) / (v[2] - eye.z); return [eye.x + (v[0] - eye.x) * k, eye.y + (v[1] - eye.y) * k]; });
  for (const [c, b, s] of [[0, screen.lo[0], 1], [0, screen.hi[0], -1], [1, screen.lo[1], 1], [1, screen.hi[1], -1]]) p = clip(p, c, b, s);
  return Math.abs(p.reduce((s, v, i) => { const b = p[(i + 1) % p.length]; return s + v[0] * b[1] - b[0] * v[1]; }, 0)) / 2;
}

let assets;
async function readAssets() {
  if (assets) return assets;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const [arm, phone, data] = await Promise.all([
    io.read(resolve(root, 'public/assets/props/drinking-arm.glb')),
    io.read(resolve(root, 'public/assets/props/story/phone.glb')),
    readFile(resolve(root, 'public/assets/props/drinking-arm.json'), 'utf8').then(JSON.parse),
  ]);
  const positions = [], indices = [], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let screen;
  for (const node of phone.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() || []) {
    const matrix = new Mat4().set(node.getWorldMatrix()), p = primitive.getAttribute('POSITION'), start = positions.length;
    const sl = [Infinity, Infinity, Infinity], sh = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.getCount(); i++) {
      const point = matrix.transformPoint(v3(p.getElement(i, []))), xyz = [point.x, point.y, point.z]; positions.push(xyz);
      for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], xyz[c]); hi[c] = Math.max(hi[c], xyz[c]); sl[c] = Math.min(sl[c], xyz[c]); sh[c] = Math.max(sh[c], xyz[c]); }
    }
    indices.push(...Array.from(primitive.getIndices().getArray(), i => i + start));
    if (/^Lock_Screen/.test(primitive.getMaterial()?.getName())) screen = { lo: sl, hi: sh, z: sh[2] };
  }
  if (!screen) throw new Error('The downloaded phone has no Lock_Screen mesh');
  assets = { arm, data, lo, hi, screen, surface: new Surface(positions, indices, null, 0.008) };
  return assets;
}

export const GRIP_VIEWS = ['lock', 'video', 'turning'];
function holdingPose(hand, view) {
  if (hand === BASELINE_HAND) return { x: 0.045, y: -0.066, z: -0.225, pitch: 6, yaw: -8, roll: -3 };
  const motion = new PhoneMotion();
  const watch = view === 'video';
  let pose;
  for (let i = 0; i < 60; i++) pose = motion.update(1 / 60, { watch, yaw: 0, pitch: 0 });
  if (view === 'turning') for (let i = 0; i < 12; i++) pose = motion.update(1 / 60, { yaw: i * 4, pitch: i, speed: 1.35, phase: i / 2 });
  return pose;
}

export async function measurePhoneGrip(hand = HAND, view = 'lock') {
  if (!GRIP_VIEWS.includes(view)) throw new Error(`Unknown grip view: ${view}`);
  const { arm, data, lo, hi, screen, surface } = await readAssets();
  const skin = rig(arm), meshNode = arm.getRoot().listNodes().find(n => n.getSkin()), primitive = meshNode.getMesh().listPrimitives()[0];
  const bones = new Map(), entity = new Entity('offline phone hand');
  for (const joint of data.joints) {
    const bone = new Entity(joint.name); bone.setLocalPosition(...joint.restLocal.translation); bone.setLocalRotation(...joint.restLocal.rotation);
    (bones.get(joint.parent) || entity).addChild(bone); bones.set(joint.name, bone);
  }
  const armRig = new ArmRig(entity, data);
  // Use the motion controller's real reading/video/sway framing and Phone's actual joint application. The baseline
  // uses its original holding pose and generic grip. This catches a runtime override accidentally removed later.
  const pose = holdingPose(hand, view), holderEntity = new Entity('offline held phone');
  holderEntity.setLocalPosition(pose.x, pose.y, pose.z); holderEntity.setLocalEulerAngles(pose.pitch, pose.yaw, pose.roll);
  const holder = holderEntity.getWorldTransform().clone(), inverse = holder.clone().invert(), eye = inverse.transformPoint(Vec3.ZERO);
  const rotation = frameRotation(new Vec3(0, 1, 0), new Vec3(0, 0, -1), hand.fingers.clone().normalize(), hand.facing.clone().normalize());
  const wrist = rotation.transformVector(v3(data.wristToPalm)).mulScalar(-1).add(hand.palm);
  if (hand === HAND) {
    const holderFixture = { enabled: true, getLocalPosition: () => holderEntity.getLocalPosition(), getLocalRotation: () => holderEntity.getLocalRotation() };
    Phone.prototype.poseHand.call({ rig: armRig, holder: holderFixture, handCarrier: { enabled: false }, handLocal: rotation, handPalm: v3(data.wristToPalm) });
  } else {
    armRig.pose(hand.shoulder, holder.transformPoint(wrist), new Quat().mul2(holderEntity.getLocalRotation(), rotation), { grip: hand.grip });
    for (const [name, q] of Object.entries(hand.joints || {})) bones.get(name).setLocalRotation(...q);
  }
  for (const [name, bone] of bones) { skin.nodes.get(name).t.copy(bone.getLocalPosition()); skin.nodes.get(name).r.copy(bone.getLocalRotation()); }
  skin.update();
  const vertices = skin.skin(meshNode, primitive).map(p => { const v = inverse.transformPoint(v3(p)); return [v.x, v.y, v.z]; }), J = primitive.getAttribute('JOINTS_0'), W = primitive.getAttribute('WEIGHTS_0'), rest = primitive.getAttribute('POSITION');
  const names = meshNode.getSkin().listJoints().map(n => n.getName());
  const handVertices = [], tipVertices = Object.fromEntries(['thumb', 'index', 'middle', 'ring', 'pinky'].map(f => [f, []]));
  const kept = new Set();
  for (let i = 0; i < vertices.length; i++) {
    const j = J.getElement(i, []), w = W.getElement(i, []), handWeight = w.reduce((s, value, k) => s + (j[k] >= 2 ? value : 0), 0);
    if (handWeight >= 0.8) { handVertices.push(vertices[i]); kept.add(i); }
    for (const f of Object.keys(tipVertices)) {
      const weight = w.reduce((s, value, k) => s + (names[j[k]] === `${f}_03_r` ? value : 0), 0);
      if (weight > 0.55) tipVertices[f].push(i);
    }
  }
  const centre = lo.map((x, c) => (x + hi[c]) / 2), half = lo.map((x, c) => (hi[c] - x) / 2);
  const boxDistance = p => { const d = p.map((x, c) => Math.abs(x - centre[c]) - half[c]); return Math.hypot(...d.map(x => Math.max(x, 0))) + Math.min(Math.max(...d), 0); };
  const compression = Math.max(0, ...handVertices.map(p => -boxDistance(p))) * 1000;
  const front = handVertices.filter(p => p[2] > screen.z && p[0] > screen.lo[0] && p[0] < screen.hi[0] && p[1] > screen.lo[1] && p[1] < screen.hi[1]).length;
  let trianglesOverScreen = 0, projectedArea = 0;
  const ids = primitive.getIndices().getArray();
  for (let i = 0; i < ids.length; i += 3) {
    const tri = [ids[i], ids[i + 1], ids[i + 2]];
    if (!tri.some(v => kept.has(v))) continue;
    const area = screenArea(tri.map(v => vertices[v]), screen, eye);
    if (area > 1e-10) { trianglesOverScreen++; projectedArea += area; }
  }
  const contacts = {};
  for (const [f, candidates] of Object.entries(tipVertices)) {
    const joint = data.joints.find(j => j.name === `${f}_03_r`), previous = data.joints.find(j => j.name === `${f}_02_r`);
    const direction = v3(joint.restPosition).sub(v3(previous.restPosition)).normalize();
    const dots = candidates.map(i => dot(rest.getElement(i, []), [direction.x, direction.y, direction.z])).sort((a, b) => a - b);
    const threshold = dots[Math.floor((dots.length - 1) * 0.65)];
    const tip = candidates.filter(i => dot(rest.getElement(i, []), [direction.x, direction.y, direction.z]) >= threshold);
    contacts[f] = round(Math.min(...tip.map(i => surface.nearest(vertices[i], 0.05)?.distance ?? Infinity)) * 1000);
  }
  const failures = [];
  if (trianglesOverScreen) failures.push(`${trianglesOverScreen} skin triangles obscure the active screen`);
  if (compression > 1) failures.push(`Hand compression exceeds 1 mm (${round(compression)} mm)`);
  for (const [f, gap] of Object.entries(contacts)) if (!Number.isFinite(gap) || gap > 3) failures.push(`${f} fingertip floats ${gap} mm from the phone`);
  return { pass: failures.length === 0, failures, view, handVertices: handVertices.length, screenFrontVertices: front, trianglesOverScreen,
    projectedTriangleAreaMm2: round(projectedArea * 1e6), maxEnvelopeCompressionMm: round(compression), fingertipGapMm: contacts,
    phoneDimensionsMm: lo.map((x, c) => round((hi[c] - x) * 1000)), screen: { min: screen.lo, max: screen.hi } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), reportIndex = args.indexOf('--report');
  if (args.some((x, i) => x !== '--baseline' && x !== '--report' && i !== reportIndex + 1) || (reportIndex >= 0 && !args[reportIndex + 1])) throw new Error('Usage: node tools/phone/grip-check.mjs [--baseline] [--report file]');
  const reports = [];
  for (const view of GRIP_VIEWS) reports.push(await measurePhoneGrip(args.includes('--baseline') ? BASELINE_HAND : HAND, view));
  const report = { pass: reports.every(r => r.pass), reports };
  if (reportIndex >= 0) await writeFile(args[reportIndex + 1], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

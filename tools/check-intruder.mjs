// The intruder's body without a browser (src/intruder.js on the skeleton of public/assets/props/intruder.glb, posed
// by its own clips): the knife hangs point down in his fist through his walks, run and idles; knifePose lifts it by his
// head pointing forward and down and stabs it forward and down without the blade ever turning up on the way; his
// phone light rides in his left hand; cameraOnly keeps his body out of every view but the home camera's; the porcelain
// mask stays clear of his face and hood (tools/intruder/fit-check.mjs runs every clip). node --test tools/check-intruder.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { GraphNode, Quat, Vec3 } from 'playcanvas';
import { Intruder, GRIP } from '../src/intruder.js';
import { against, rig, Surface } from './intruder/fit.mjs';

const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(new URL('../public/assets/props/intruder.glb', import.meta.url).pathname);
const body = rig(doc);

// His skeleton as scene-graph nodes (what intruder.js poses), driven from the clip sampler.
function man() {
  const build = (n, parent) => {
    const g = new GraphNode(n.getName()); g.setLocalPosition(...n.getTranslation()); g.setLocalRotation(new Quat(...n.getRotation()));
    parent.addChild(g);
    for (const c of n.listChildren()) build(c, g);
  };
  const root = new GraphNode('intruder');
  for (const n of doc.getRoot().listScenes()[0].listChildren()) build(n, root);
  const m = Object.create(Intruder.prototype);
  Object.assign(m, { root: { enabled: true }, yaw: 0, raise: 0, strike: 0, bones: new Map() });
  root.forEach(e => { if (e.name?.startsWith('Bip01')) m.bones.set(e.name, e); });
  m.hand = m.bones.get('Bip01 R Hand'); m.leftHand = m.bones.get('Bip01 L Hand'); m.head = m.bones.get('Bip01 Head');
  m.knife = new GraphNode('intruder knife'); m.hand.addChild(m.knife); m.setGrip(GRIP);
  m.arm = ['Bip01 R Clavicle', 'Bip01 R UpperArm', 'Bip01 R Forearm', 'Bip01 R Hand'].map(name => ({ node: m.bones.get(name), base: new Quat(), written: null }));
  m.upperLength = m.bones.get('Bip01 R Forearm').getLocalPosition().length(); m.foreLength = m.hand.getLocalPosition().length();
  m.pose = (clip, time) => {
    body.pose(clip, time);
    for (const [name, g] of body.nodes) { const b = m.bones.get(name); if (b) { b.setLocalPosition(g.t); b.setLocalRotation(g.r); } }
  };
  return m;
}
// The knife in his frame (he faces +Z: right is -X): its point's direction and where its tip is.
const knife = (m) => {
  const w = m.knife.getWorldTransform(), heel = w.transformPoint(new Vec3()), tip = w.transformPoint(new Vec3(0, -0.21, 0));
  const dir = new Vec3().sub2(tip, heel).normalize(), shoulder = m.bones.get('Bip01 R UpperArm').getPosition();
  return { up: dir.y, forward: dir.z, tip, shoulder, wrist: m.hand.getPosition().clone() };
};

test('the knife hangs point down in his fist through his walks, run and idles', () => {
  const m = man();
  for (const clip of ['idle_breathe_01', 'idle_look_around_01', 'walk_slow_01', 'walk_neutral_01', 'run_neutral_01', 'crouch_idle']) {
    for (let t = 0; t <= body.duration(clip); t += 0.2) {
      m.pose(clip, t); m.poseArm();
      const k = knife(m);
      assert.ok(k.up < -0.85, `${clip} ${t.toFixed(1)} s: the blade points down (${k.up.toFixed(2)})`);
    }
  }
});

test('knifePose: up by his head pointing forward and down, then a stab forward and down; never point up', () => {
  const m = man();
  const at = (raise, strike) => { m.pose('idle_breathe_01', 1.2); m.knifePose(raise, strike); m.poseArm(); return knife(m); };
  const up = at(1, 0), head = m.head.getPosition();
  assert.ok(up.wrist.y > up.shoulder.y + 0.25 && up.wrist.y > head.y, 'the fist is up by his head');
  assert.ok(up.up < -0.6 && up.forward > 0.4, `the raised blade points forward and down (${up.forward.toFixed(2)}, ${up.up.toFixed(2)})`);
  const down = at(1, 1);
  assert.ok(down.tip.z - down.shoulder.z > 0.6 && down.tip.y < down.shoulder.y - 0.3, 'the stab ends low and well in front of him');
  let last = Infinity;
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const r = at(k, 0), s = at(1, k);
    assert.ok(r.up < -0.5, `raise ${k.toFixed(2)}: the blade never turns up (${r.up.toFixed(2)})`);
    assert.ok(s.up < -0.5 && s.forward > 0.4, `strike ${k.toFixed(2)}: driven forward and down (${s.forward.toFixed(2)}, ${s.up.toFixed(2)})`);
    assert.ok(s.wrist.y <= last + 1e-3, `strike ${k.toFixed(2)}: the fist only comes down`);
    last = s.wrist.y;
  }
  // Applied again in the same frame (death.js calls it after the body's update), the pose is the same.
  m.pose('walk_slow_01', 0.4); m.knifePose(0.7, 0.2); m.poseArm(); const once = knife(m).tip.clone(); m.poseArm();
  assert.ok(knife(m).tip.distance(once) < 1e-5, 'posing twice in a frame changes nothing');
});

test('his phone light rides in his left hand; cameraOnly shows him to the home camera alone', () => {
  const m = man();
  const torch = new GraphNode('intruder phone light');
  Object.assign(m, { torch, torchOn: true, torchUnder: false, torchYaw: null, torchPitch: -14, headPitch: 0, fingers: [], knife: m.knife });
  m.pose('walk_slow_01', 0.3);
  m.update();
  const hand = m.leftHand.getPosition();
  assert.ok(torch.getPosition().distance(new Vec3(hand.x, Math.max(0.9, hand.y), hand.z)) < 1e-6, 'the light is at his left hand');
  const player = { node: { name: 'camera' } }, homeCam = { node: { name: 'security camera' } }, probe = { node: { name: 'probe-main' } };
  // Shadow cameras: the player's torch beam's (flashlight.js tags them) and any other light's.
  const torchShadow = { node: { name: 'pcShadowCamera' }, torchShadow: true }, lampShadow = { node: { name: 'pcShadowCamera' } };
  m.isPlayerCamera = cam => cam === player || cam.node?.name === 'security camera';
  m.cameraOnly = false;
  assert.deepEqual([m.seenBy(player), m.seenBy(homeCam), m.seenBy(probe), m.seenBy(torchShadow), m.seenBy(lampShadow)], [true, true, false, true, false]);
  m.cameraOnly = true;
  assert.deepEqual([m.seenBy(player), m.seenBy(homeCam), m.seenBy(probe), m.seenBy(torchShadow), m.seenBy(lampShadow)], [false, true, false, false, false]);
});

test('the mask stays clear of his face and hood', () => {
  const root = doc.getRoot(), skinned = root.listNodes().find(n => n.getSkin()), face = root.listNodes().find(n => n.getName() === 'mask face').getMesh().listPrimitives()[0];
  const pos = face.getAttribute('POSITION'), v = [];
  const mask = new Surface(Array.from({ length: pos.getCount() }, (_, i) => [...pos.getElement(i, v)]), face.getIndices().getArray());
  body.update();
  const head = body.nodes.get('Bip01 Head'), f = head.world.clone().invert().transformVector(new Vec3(0, 0, 1)).normalize(), forward = [f.x, f.y, f.z];
  for (const clip of ['idle_look_around_01', 'run_neutral_01']) for (let t = 0; t <= body.duration(clip); t += 0.3) {
    body.pose(clip, t);
    const toHead = head.world.clone().invert(), p = new Vec3();
    for (const prim of skinned.getMesh().listPrimitives()) {
      const isFace = /head/.test(prim.getMaterial().getName());
      const where = body.skin(skinned, prim).map(q => (toHead.transformPoint(p.set(...q), p), against(mask, [p.x, p.y, p.z], forward)));
      if (isFace) assert.ok(!where.some(w => w?.through !== undefined), `${clip} ${t.toFixed(1)} s: his face pokes through the mask`);
      else {
        const idx = prim.getIndices().getArray();
        for (let k = 0; k < idx.length; k += 3) {
          const tri = [where[idx[k]], where[idx[k + 1]], where[idx[k + 2]]];
          assert.ok(!(tri.some(w => w?.through !== undefined) && tri.some(w => w?.behind !== undefined)), `${clip} ${t.toFixed(1)} s: the hood cuts the mask`);
        }
      }
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { Entity, Vec3 } from 'playcanvas';
import { Fridge } from '../src/fridge.js';
import { FRIDGE, fridgeLocal, fridgeWorld, classifyFridgeTriangle, fridgeDoorSegment } from '../src/fridge-geometry.js';
import { makeWaterGeometry, WATER_LEVEL } from '../src/fridge-water.js';
import { intersectTriangle } from '../src/switch-surfaces.js';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(new URL('../public/assets/apartment/scene.gltf', import.meta.url).pathname);
const source = [];
for (const node of doc.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
  if (!/^Refrigator\.001_/.test(node.getName()) && primitive.getMaterial()?.getName() !== 'Black@main') continue;
  const a = primitive.getAttribute('POSITION'), ids = primitive.getIndices(), m = node.getWorldMatrix();
  const vertices = Array.from({ length: a.getCount() }, (_, index) => {
    const v = a.getElement(index, []); return [0, 1, 2].map(k => m[k] * v[0] + m[k + 4] * v[1] + m[k + 8] * v[2] + m[k + 12]);
  });
  for (let index = 0; index < ids.getCount(); index += 3) {
    const triangle = [0, 1, 2].map(k => vertices[ids.getScalar(index + k)]);
    source.push({ triangle, node: node.getName(), material: primitive.getMaterial().getName(), kind: classifyFridgeTriangle(triangle, node.getName(), primitive.getMaterial().getName()) });
  }
}
function nearest(triangles, origin, direction) {
  let nearest = null;
  for (const triangle of triangles) { const hit = intersectTriangle(origin, direction, ...triangle); if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit; }
  return nearest;
}

test('only the authored upper leaf and its gasket move; lower freezer and surrounding kitchen remain', () => {
  const moving = source.filter(t => t.kind === 'door'), caps = source.filter(t => t.kind === 'cap');
  assert.ok(moving.length > 1000 && moving.length < 8000, `${moving.length} upper-door triangles`);
  assert.ok(caps.length > 0 && caps.length < 50, `${caps.length} original front-cap triangles`);
  assert.ok(moving.every(t => t.triangle.every(p => fridgeLocal(p)[1] > 0.934)));
  const freezer = source.filter(t => /^Refrigator/.test(t.node) && t.triangle.every(p => p[1] < 0.93));
  assert.ok(freezer.length > 5000); assert.ok(freezer.every(t => t.kind === 'keep'));
  const unrelated = source.filter(t => !/^Refrigator/.test(t.node) && !t.triangle.every(p => {const q=fridgeLocal(p);return q[0]>-.34&&q[0]<.332&&q[1]>.934&&q[1]<2.03&&q[2]>.245&&q[2]<.302;}));
  assert.ok(unrelated.length > 10000); assert.ok(unrelated.every(t => t.kind === 'keep'));
});

test('opening removes the source cabinet cap so the view reaches its real back wall', () => {
  const origin = [1.55, 1.4, 0.8], direction = [0, 0, -1];
  const closed = nearest(source.map(t => t.triangle), origin, direction);
  const open = nearest(source.filter(t => t.kind === 'keep').map(t => t.triangle), origin, direction);
  assert.ok(closed.point[2] > -0.34, `closed front ${closed.point}`);
  assert.ok(open.point[2] < -0.98 && open.point[2] > -1.02, `open cavity ${open.point}`);
  assert.equal(classifyFridgeTriangle([[1.5, 1.5, -.38], [1.6, 1.5, -.38], [1.5, 1.6, -.38]], 'Unrelated countertop', 'BrushedMetalSeamless.001@main'), 'keep');
});

test('the door rotates into the room with a rigid hinge and constant width', () => {
  const fixed = fridgeDoorSegment(0);
  for (const angle of [0, 25, 60, FRIDGE.opening]) {
    const s = fridgeDoorSegment(angle); assert.deepEqual(s.slice(0, 2), fixed.slice(0, 2));
    assert.ok(Math.abs(Math.hypot(s[2] - s[0], s[3] - s[1]) - FRIDGE.width) < 1e-8);
  }
  assert.ok(fridgeDoorSegment(90)[3] > fixed[3] + 0.6);
  const local = [-.12, 1.5, .13], roundTrip = fridgeLocal(fridgeWorld(local));
  local.forEach((v, i) => assert.ok(Math.abs(v - roundTrip[i]) < 1e-10));
});

const jar = JSON.parse(readFileSync(new URL('../public/assets/props/water-jar.json', import.meta.url)));
const jarVertices = Array.from({ length: jar.positions.length / 3 }, (_, i) => jar.positions.slice(i * 3, i * 3 + 3));
const jarTriangles = Array.from({ length: jar.indices.length / 3 }, (_, i) => jar.indices.slice(i * 3, i * 3 + 3).map(index => jarVertices[index]));
test('the downloaded authored jar is hollow, and the water fits inside its actual walls and floor', () => {
  assert.equal(jar.license, 'CC-BY-4.0'); assert.ok(jarVertices.length > 5000);
  const height = Math.max(...jarVertices.map(p => p[1])); assert.ok(height > 0.28 && height < 0.29);
  const innerFloor = nearest(jarTriangles, [0, .1, 0], [0, -1, 0]); assert.ok(innerFloor.point[1] > .009 && innerFloor.point[1] < .01);
  const water = makeWaterGeometry(); assert.equal(water.positions.length, water.normals.length);
  for (let index = 0; index < water.positions.length; index += 3) {
    const [x,y,z] = water.positions.slice(index,index+3), radius = Math.hypot(x,z);
    assert.ok(y > innerFloor.point[1]); assert.ok(y <= WATER_LEVEL && y < height - .07);
    if (radius < 1e-8) continue;
    const boundary = nearest(jarTriangles, [0,y,0], [x/radius,0,z/radius]);
    assert.ok(boundary && boundary.distance > radius + .0001, `water penetrates jar at ${x},${y},${z} / ${boundary?.distance}`);
  }
  assert.ok(FRIDGE.jar[1] - 1.333 > .0004 && FRIDGE.jar[1] - 1.333 < .001, 'jar rests within 1 mm of its actual shelf surface');
  assert.ok(FRIDGE.jar[2] + .072 < .15, 'jar clears the closed door bins and main shelf edge');
  assert.ok(FRIDGE.jar[1] + height < 1.738 - .02, 'jar clears the shelf above it');
});

function fakeFridge() {
  const f = Object.create(Fridge.prototype); Object.assign(f, { angle: 0, target: 0, velocity: 0, openRequested: false, moving: false, handle: new Vec3(), door: new Entity(), app:{root:{findComponents:()=>[]}}, light:{getPosition:()=>new Vec3(),light:{}}, glow:{emissiveIntensity:0,update(){}},baseIntensity:.24,recaptures:0, recapture(){this.recaptures++;}, player:{pos:new Vec3(0,0,2)} });
  f.updateHandle(); return f;
}
function settle(f) { for (let i=0;i<240&&f.moving;i++) f.update(1/60); }
test('native toggle can reverse while moving and the interior light follows the physical seal', () => {
  const f=fakeFridge();f.applyLighting();assert.equal(f.light.light.enabled,false);
  f.toggle();for(let i=0;i<15;i++)f.update(1/60);assert.ok(f.angle>10);assert.ok(f.light.light.intensity>.2);
  f.toggle();settle(f);assert.equal(f.angle,0);assert.equal(f.light.light.enabled,false);assert.equal(f.glow.emissiveIntensity,0);
  f.toggle();settle(f);assert.equal(f.angle,FRIDGE.opening);assert.equal(f.light.light.intensity,.24);assert.equal(f.recaptures,2);
});
test('a player blocks the swinging door and the next press reverses its requested direction', () => {
  const f=fakeFridge();f.toggle();for(let i=0;i<20;i++)f.update(1/60);
  const old=f.angle,s=fridgeDoorSegment(old);f.player.pos.set((s[0]+s[2])/2,0,(s[1]+s[3])/2);f.update(1/60);
  assert.equal(f.angle,old);assert.equal(f.moving,false);assert.equal(f.blocked,true);assert.equal(f.openRequested,true);
  f.player.pos.set(0,0,2);f.toggle();settle(f);assert.equal(f.angle,0);assert.equal(f.openRequested,false);
});

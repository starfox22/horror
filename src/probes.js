// Reflection and bounce-light probes. The asset pipeline cuts every surface at the walls and gives each room's part its
// own material copy ('<material>@<room>', tools/build-assets.mjs ZONE_CUTS).
// Reflections: each room has a cubemap probe captured from inside it (whatever lamps are on there), turned into an
// environment atlas; the room's materials take their reflections from it, box-projected onto the room's walls (so a
// glossy floor or a black window mirrors the room in the right place).
// Bounce light (ambient): eight probes (the four room probes and four more across the open-plan room and down the
// corridor), each filtered to diffuse light in one slot of a small shared atlas. A room with its lights off stays dark,
// but where a lit room opens onto another, the light fades out gradually: surfaces blend the probes along their area
// by position (BOUNCE chains below), so the corridor is brighter by a lit doorway and dims away from it, instead of one
// flat level per room that drops to black at the next probe.
// The open-plan room and the corridor have no wall between them: the two chains blend across the corridor's mouth and
// the office opening (envBlendWeight below) so no seam shows.
import { ShaderChunks, BoundingBox, CUBEPROJ_BOX, EnvLighting, Texture, Vec3, Vec4, reprojectTexture, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA8, TEXTUREPROJECTION_EQUIRECT,
  ADDRESS_CLAMP_TO_EDGE, FILTER_LINEAR } from 'playcanvas';
import { captureCube, rerenderShadows } from './lighting.js';

// box: the room's inner walls (min, max); at: where its probe is captured (away from lamps and bright table tops).
export const ZONES = {
  main: { box: [[-6.47, 0.15, -1.42], [6.34, 2.76, 4.42]], at: [-1.2, 1.55, 0.6] },
  hall: { box: [[1.55, 0.15, 2.72], [13.95, 2.76, 4.42]], at: [7.6, 1.5, 3.55] },
  bath: { box: [[6.45, 0.15, -1.42], [9.15, 2.76, 2.41]], at: [7.7, 1.5, 0.45] },
  bed: { box: [[9.26, 0.15, -1.42], [14.25, 2.76, 2.41]], at: [11.2, 1.5, 0.5] },
};
const zoneOf = (x, z) => (z > 2.57 ? (x < 1.55 ? 'main' : 'hall') : x < 6.40 ? 'main' : x < 9.20 ? 'bath' : 'bed');

// Bounce-light probes, one atlas slot each (in this order): a room probe (zone) or a probe of its own (at, captured
// smaller: it only feeds diffuse light). Placed at chest height in open floor, clear of lamps.
const BOUNCE = [
  { id: 'living', at: [-4.6, 1.4, 1.5] },
  { id: 'main', zone: 'main' },
  { id: 'office', at: [4.2, 1.4, 0.8] },
  { id: 'hallW', at: [2.6, 1.4, 3.55] },
  { id: 'hall', zone: 'hall' },
  { id: 'hallE', at: [11.6, 1.4, 3.55] },
  { id: 'bath', zone: 'bath' },
  { id: 'bed', zone: 'bed' },
];
const SLOT = Object.fromEntries(BOUNCE.map((b, i) => [b.id, i]));
const SLOT_W = 64, SLOT_H = 32, ATLAS_W = SLOT_W * 8;
// Chains: three slots and the x where each is at full weight (linear in between, held beyond the ends). The open-plan
// room runs living -> dining/kitchen -> office; the corridor from its mouth past the office opening to the bedroom door.
const CHAIN = {
  main: [[SLOT.living, SLOT.main, SLOT.office], [-4.6, -1.2, 4.2]],
  hall: [[SLOT.hallW, SLOT.hall, SLOT.hallE], [2.6, 7.6, 11.6]],
  bath: [[SLOT.bath, SLOT.bath, SLOT.bath], [0, 1, 2]],
  bed: [[SLOT.bed, SLOT.bed, SLOT.bed], [0, 1, 2]],
};

// Bounce-light blend between the open-plan room (chain A) and the corridor (chain B), by world position: along the
// corridor from x 0.5 to 4.5, fading in across the hall wall line only where the office opens onto the corridor.
const BLEND_GLSL = `
float envBlendWeight(vec3 p) {
  float sx = smoothstep(0.5, 4.5, p.x);
  float sz = smoothstep(2.2, 3.0, p.z);
  return sx * mix(sz, 1.0, smoothstep(5.6, 7.0, p.x));
}`;
const BLEND_WGSL = `
fn envBlendWeight(p: vec3f) -> f32 {
  let sx: f32 = smoothstep(0.5, 4.5, p.x);
  let sz: f32 = smoothstep(2.2, 3.0, p.z);
  return sx * mix(sz, 1.0, smoothstep(5.6, 7.0, p.x));
}`;

// Ambient: chain A (bounceSlotsA at x bounceKnotsA), mixed towards chain B by envBlendWeight where bounceMix.y = 1, or
// by which way the surface faces where bounceMix.z = 1 (the bathroom door's leaf: A is the bathroom, B the bedroom; the
// closed door's bedroom side faces +x, open both sides face along z, into the bathroom); scaled by bounceMix.x, and by
// bounceLive, a per-camera value (1 for the player's view, 0 while a probe captures: see the constructor).
// Slots are picked arithmetically and sampled at level 0, so every texture read stays in uniform control flow.
const AMBIENT_GLSL = `
#if LIT_AMBIENT_SOURCE == ENVALATLAS
  #include "envAtlasPS"
  uniform sampler2D bounceAtlas;
  uniform vec4 bounceSlotsA;
  uniform vec4 bounceKnotsA;
  uniform vec4 bounceSlotsB;
  uniform vec4 bounceKnotsB;
  uniform vec4 bounceMix;
  #ifndef BOUNCE_LIVE
  #define BOUNCE_LIVE
  uniform float bounceLive;
  #endif
  ${BLEND_GLSL}
  vec3 bounceSlot(vec2 uv, float slot) {
    vec2 st = vec2((slot * ${SLOT_W}.0 + 1.0 + uv.x * ${SLOT_W - 2}.0) / ${ATLAS_W}.0, (1.0 + uv.y * ${SLOT_H - 2}.0) / ${SLOT_H}.0);
    return {ambientDecode}(textureLod(bounceAtlas, st, 0.0));
  }
  vec3 bounceChain(vec2 uv, vec4 slots, vec4 knots, float x) {
    float hi = step(knots.y, x);
    float a = mix(knots.x, knots.y, hi), b = mix(knots.y, knots.z, hi);
    float t = clamp((x - a) / max(b - a, 0.001), 0.0, 1.0);
    return mix(bounceSlot(uv, mix(slots.x, slots.y, hi)), bounceSlot(uv, mix(slots.y, slots.z, hi)), t);
  }
#endif
void addAmbient(vec3 worldNormal) {
  #if LIT_AMBIENT_SOURCE == ENVALATLAS
    vec3 dir = normalize(cubeMapRotate(worldNormal) * vec3(-1.0, 1.0, 1.0));
    vec2 uv = toSphericalUv(dir);
    vec3 a = bounceChain(uv, bounceSlotsA, bounceKnotsA, vPositionW.x);
    vec3 b = bounceChain(uv, bounceSlotsB, bounceKnotsB, vPositionW.x);
    float w = bounceMix.y * envBlendWeight(vPositionW) + bounceMix.z * smoothstep(0.0, 0.5, worldNormal.x);
    dDiffuseLight += mix(a, b, w) * bounceMix.x * bounceLive;
  #else
    dDiffuseLight += light_globalAmbient;
  #endif
}
`;
const AMBIENT_WGSL = `
#if LIT_AMBIENT_SOURCE == ENVALATLAS
  #include "envAtlasPS"
  var bounceAtlas: texture_2d<f32>;
  var bounceAtlasSampler: sampler;
  uniform bounceSlotsA: vec4f;
  uniform bounceKnotsA: vec4f;
  uniform bounceSlotsB: vec4f;
  uniform bounceKnotsB: vec4f;
  uniform bounceMix: vec4f;
  #ifndef BOUNCE_LIVE
  #define BOUNCE_LIVE
  uniform bounceLive: f32;
  #endif
  ${BLEND_WGSL}
  fn bounceSlot(uv: vec2f, slot: f32) -> vec3f {
    let st: vec2f = vec2f((slot * ${SLOT_W}.0 + 1.0 + uv.x * ${SLOT_W - 2}.0) / ${ATLAS_W}.0, (1.0 + uv.y * ${SLOT_H - 2}.0) / ${SLOT_H}.0);
    return {ambientDecode}(textureSampleLevel(bounceAtlas, bounceAtlasSampler, st, 0.0));
  }
  fn bounceChain(uv: vec2f, slots: vec4f, knots: vec4f, x: f32) -> vec3f {
    let hi: f32 = step(knots.y, x);
    let a: f32 = mix(knots.x, knots.y, hi);
    let b: f32 = mix(knots.y, knots.z, hi);
    let t: f32 = clamp((x - a) / max(b - a, 0.001), 0.0, 1.0);
    return mix(bounceSlot(uv, mix(slots.x, slots.y, hi)), bounceSlot(uv, mix(slots.y, slots.z, hi)), vec3f(t));
  }
#endif
fn addAmbient(worldNormal: vec3f) {
  #if LIT_AMBIENT_SOURCE == ENVALATLAS
    let dir: vec3f = normalize(cubeMapRotate(worldNormal) * vec3f(-1.0, 1.0, 1.0));
    let uv: vec2f = toSphericalUv(dir);
    let a: vec3f = bounceChain(uv, uniform.bounceSlotsA, uniform.bounceKnotsA, vPositionW.x);
    let b: vec3f = bounceChain(uv, uniform.bounceSlotsB, uniform.bounceKnotsB, vPositionW.x);
    let w: f32 = uniform.bounceMix.y * envBlendWeight(vPositionW) + uniform.bounceMix.z * smoothstep(0.0, 0.5, worldNormal.x);
    dDiffuseLight += mix(a, b, vec3f(w)) * uniform.bounceMix.x * uniform.bounceLive;
  #else
    dDiffuseLight += uniform.light_globalAmbient;
  #endif
}
`;
// Box projection relative to where the probe was captured (the engine assumes the box's centre).
const PROJECT_GLSL = `
#if LIT_CUBEMAP_PROJECTION == BOX
  uniform vec3 envBoxMin;
  uniform vec3 envBoxMax;
  uniform vec3 envProbePos;
#endif
vec3 cubeMapProject(vec3 nrdir) {
  #if LIT_CUBEMAP_PROJECTION == BOX
    nrdir = cubeMapRotate(nrdir);
    vec3 rbmax = (envBoxMax - vPositionW) / nrdir;
    vec3 rbmin = (envBoxMin - vPositionW) / nrdir;
    vec3 rbminmax = mix(rbmin, rbmax, vec3(greaterThan(nrdir, vec3(0.0))));
    float fa = min(min(rbminmax.x, rbminmax.y), rbminmax.z);
    vec3 posonbox = vPositionW + nrdir * max(fa, 0.0);
    return normalize(posonbox - envProbePos);
  #else
    return cubeMapRotate(nrdir);
  #endif
}
`;
const PROJECT_WGSL = `
#if LIT_CUBEMAP_PROJECTION == BOX
  uniform envBoxMin: vec3f;
  uniform envBoxMax: vec3f;
  uniform envProbePos: vec3f;
#endif
fn cubeMapProject(nrdir: vec3f) -> vec3f {
  #if LIT_CUBEMAP_PROJECTION == BOX
    let d: vec3f = cubeMapRotate(nrdir);
    let rbmax: vec3f = (uniform.envBoxMax - vPositionW) / d;
    let rbmin: vec3f = (uniform.envBoxMin - vPositionW) / d;
    let rbminmax: vec3f = select(rbmin, rbmax, d > vec3f(0.0));
    let fa: f32 = min(min(rbminmax.x, rbminmax.y), rbminmax.z);
    let posonbox: vec3f = vPositionW + d * max(fa, 0.0);
    return normalize(posonbox - uniform.envProbePos);
  #else
    return cubeMapRotate(nrdir);
  #endif
}
`;

export const baseName = (name) => name.replace(/@(main|hall|bath|bed)$/, '');

export class Probes {
  // ambient: strength of the bounce light (1 = what the probes saw)
  constructor(app, camera, apartment, { ambient = 0.9 } = {}) {
    this.app = app;
    this.camera = camera;
    this.ambient = ambient;
    const device = app.graphicsDevice;
    const format = device.textureHalfFloatRenderable ? PIXELFORMAT_RGBA16F : PIXELFORMAT_RGBA8;
    const equirect = (name, width, height) => new Texture(device, { name, width, height, format, mipmaps: false, minFilter: FILTER_LINEAR,
      magFilter: FILTER_LINEAR, projection: TEXTUREPROJECTION_EQUIRECT, addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE });
    for (const [id, z] of Object.entries(ZONES)) {
      z.id = id;
      z.atlas = equirect(`probe-${id}`, 512, 512);
      const [lo, hi] = z.box;
      z.bounds = new BoundingBox(new Vec3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2),
        new Vec3((hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2));
    }
    this.bounce = equirect('bounce-light', ATLAS_W, SLOT_H);
    // Probes capture direct light only (their cameras are named 'probe-<face>', lighting.js captureCube): no bounce light
    // and no reflections, which both come from earlier captures (a room switched off would keep a trace of its light).
    // The engine's reflection chunks are patched to scale by bounceLive.
    this.reflection = {};
    for (const lang of ['glsl', 'wgsl']) {
      const chunks = ShaderChunks.get(device, lang), out = this.reflection[lang] = {};
      const decl = lang === 'glsl' ? 'uniform float bounceLive;' : 'uniform bounceLive: f32;';
      for (const name of ['reflectionEnvPS', 'reflectionEnvHQPS']) {
        const code = chunks.get(name);
        const patched = code?.replace(/calcReflection\(reflDir, gloss\)/, lang === 'glsl' ? 'calcReflection(reflDir, gloss) * bounceLive' : 'calcReflection(reflDir, gloss) * uniform.bounceLive');
        if (patched && patched !== code) out[name] = `#ifndef BOUNCE_LIVE\n#define BOUNCE_LIVE\n${decl}\n#endif\n${patched}`;
        else console.warn(`probes: ${lang} ${name} not patched`);
      }
    }
    const live = device.scope.resolve('bounceLive');
    live.setValue(1);
    app.scene.on('prerender', (cam) => live.setValue(cam.entity.name.startsWith('probe-') ? 0 : 1));
    // Every apartment material: its room from the '@room' suffix, else from where its meshes are.
    this.materials = [];
    const seen = new Set();
    for (const r of apartment.findComponents('render')) for (const mi of r.meshInstances) {
      const m = mi.material;
      if (seen.has(m)) continue;
      seen.add(m);
      const tag = /@(main|hall|bath|bed)$/.exec(m.name);
      const c = mi.aabb.center;
      this.assign(m, tag ? tag[1] : zoneOf(c.x, c.z));
    }
  }

  assign(m, zone) {
    const z = ZONES[zone];
    m.envAtlas = z.atlas;
    m.cubeMapProjection = CUBEPROJ_BOX;
    m.cubeMapProjectionBox = z.bounds;
    m.getShaderChunks('glsl').set('ambientPS', AMBIENT_GLSL);
    m.getShaderChunks('wgsl').set('ambientPS', AMBIENT_WGSL);
    m.getShaderChunks('glsl').set('cubeMapProjectPS', PROJECT_GLSL);
    m.getShaderChunks('wgsl').set('cubeMapProjectPS', PROJECT_WGSL);
    for (const [lang, name] of [['glsl', 'reflectionEnvPS'], ['glsl', 'reflectionEnvHQPS'], ['wgsl', 'reflectionEnvPS'], ['wgsl', 'reflectionEnvHQPS']]) {
      const code = this.reflection[lang]?.[name];
      if (code) m.getShaderChunks(lang).set(name, code);
    }
    m.shaderChunksVersion = '2.23';
    const open = zone === 'main' || zone === 'hall', door = m.name.endsWith('.bathdoor');
    const [a, b] = open ? [CHAIN.main, CHAIN.hall] : door ? [CHAIN.bath, CHAIN.bed] : [CHAIN[zone], CHAIN[zone]];
    m.setParameter('bounceAtlas', this.bounce);
    m.setParameter('bounceSlotsA', [...a[0], 0]);
    m.setParameter('bounceKnotsA', [...a[1], 0]);
    m.setParameter('bounceSlotsB', [...b[0], 0]);
    m.setParameter('bounceKnotsB', [...b[1], 0]);
    m.setParameter('bounceMix', [this.ambient, open ? 1 : 0, door ? 1 : 0, 0]);
    m.setParameter('envProbePos', z.at);
    m.update();
    if (!this.materials.includes(m)) this.materials.push(m);
  }

  // How bright the bounce light around a point on the floor plan is (the mean luminance of the probes its surfaces
  // blend, as the shader does), for the eye adaptation (post.js). Probe levels are read back after each capture.
  levelAt(x, z) {
    if (!this.levels) return null;
    const chain = ([slots, knots]) => {
      const hi = x >= knots[1], a = hi ? knots[1] : knots[0], b = hi ? knots[2] : knots[1];
      const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 0.001)));
      return this.levels[hi ? slots[1] : slots[0]] * (1 - t) + this.levels[hi ? slots[2] : slots[1]] * t;
    };
    const zone = zoneOf(x, z);
    if (zone !== 'main' && zone !== 'hall') return chain(CHAIN[zone]);
    const sz = smooth(2.2, 3.0, z), w = smooth(0.5, 4.5, x) * (sz + (1 - sz) * smooth(5.6, 7.0, x));
    return chain(CHAIN.main) * (1 - w) + chain(CHAIN.hall) * w;
  }

  // A read can come back empty (all zero, alpha included: seen on WebGPU); every written texel has alpha 1, so such a
  // read is retried on the next frames, and the last good levels are kept if it never succeeds.
  async readLevels() {
    const t = this.bounce;
    let data = null;
    for (let tries = 0; tries < 4 && !data; tries++) {
      if (tries) await new Promise(r => this.app.once('frameend', r));
      const d = await t.read(0, 0, t.width, t.height, { immediate: true }).catch(() => null);
      if (d && d[3] !== 0) data = d;
    }
    if (!data) return this.levels;
    const value = data instanceof Uint16Array ? halfToFloat : data instanceof Uint8Array ? (v) => v / 255 : (v) => v;
    this.levels = BOUNCE.map((b, slot) => {
      let sum = 0, n = 0;
      for (let y = 1; y < SLOT_H - 1; y++) for (let x = slot * SLOT_W + 1; x < (slot + 1) * SLOT_W - 1; x++) {
        const k = (y * t.width + x) * 4;
        sum += 0.2126 * value(data[k]) + 0.7152 * value(data[k + 1]) + 0.0722 * value(data[k + 2]); n++;
      }
      return sum / n;
    });
    return this.levels;
  }

  setAmbient(k) {
    this.ambient = k;
    for (const m of this.materials) { const p = m.getParameter('bounceMix').data; m.setParameter('bounceMix', [k, p[1], p[2], 0]); }
  }

  // Capture every probe, all in one frame (the flashlight is held out of them for just that frame). The probes see the
  // lamps' direct light only (bounceLive is 0 for the probe cameras), so a capture depends only on which lights are on,
  // never on earlier captures: switching a room off and on again gives back exactly the same light. The light that
  // would bounce on further is folded into AMBIENT. Room probes become reflection atlases; every bounce probe is filtered
  // to diffuse light into its slot.
  async captureAll() {
    const shots = BOUNCE.map((b, slot) => (b.zone ? { slot, zone: ZONES[b.zone], at: ZONES[b.zone].at, size: 256 } : { slot, at: b.at, size: 64 }));
    const rect = new Vec4();
    {
      rerenderShadows(this.app);      // fresh shadows for this frame's atlas layout (lighting.js)
      const cubes = await Promise.all(shots.map(s => captureCube(this.app, this.camera, s.at, s.size)));
      shots.forEach((s, i) => {
        const source = EnvLighting.generateLightingSource(cubes[i], { size: s.zone ? 128 : 64 });
        if (s.zone) EnvLighting.generateAtlas(source, { target: s.zone.atlas });
        reprojectTexture(source, this.bounce, { numSamples: 1024, distribution: 'lambert', rect: rect.set(s.slot * SLOT_W, 0, SLOT_W, SLOT_H), seamPixels: 1 });
        source.destroy();
        cubes[i].destroy();
      });
    }
    await this.readLevels().catch(() => {});
  }
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function halfToFloat(h) {
  const e = (h >> 10) & 0x1f, f = h & 0x3ff, v = e === 0 ? f * 2 ** -24 : e === 31 ? 65504 : (1 + f / 1024) * 2 ** (e - 15);
  return h & 0x8000 ? -v : v;
}

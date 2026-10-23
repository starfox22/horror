// Per-room reflection probes. The asset pipeline cuts every surface at the walls and gives each room's part its own
// material copy ('<material>@<room>', tools/build-assets.mjs ZONE_CUTS). Each room has a cubemap probe captured from
// inside it (whatever lamps are on there), turned into an environment atlas: the room's materials take their
// reflections from it, box-projected onto the room's walls (so a glossy floor or a black window mirrors the room in the
// right place), and their bounce light (ambient) from it, so a room whose lights are off really is dark.
// The open-plan room and the corridor have no wall between them: their bounce light is blended across the corridor's
// mouth and the office opening (blendWeight below, mirrored in the shader chunks) so no seam shows.
import { BoundingBox, CUBEPROJ_BOX, EnvLighting, Texture, Vec3, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA8, TEXTUREPROJECTION_EQUIRECT, ADDRESS_CLAMP_TO_EDGE } from 'playcanvas';
import { captureCube } from './lighting.js';

// box: the room's inner walls (min, max); at: where its probe is captured (away from lamps and bright table tops).
export const ZONES = {
  main: { box: [[-6.47, 0.15, -1.42], [6.34, 2.76, 4.42]], at: [-1.2, 1.55, 0.6] },
  hall: { box: [[1.55, 0.15, 2.72], [13.95, 2.76, 4.42]], at: [7.6, 1.5, 3.55] },
  bath: { box: [[6.45, 0.15, -1.42], [9.15, 2.76, 2.41]], at: [7.7, 1.5, 0.45] },
  bed: { box: [[9.26, 0.15, -1.42], [14.25, 2.76, 2.41]], at: [11.2, 1.5, 0.5] },
};
const zoneOf = (x, z) => (z > 2.57 ? (x < 1.55 ? 'main' : 'hall') : x < 6.40 ? 'main' : x < 9.20 ? 'bath' : 'bed');

// Bounce-light blend between the open-plan room (A) and the corridor (B), by world position: along the corridor from
// x 0.5 to 4.5, fading in across the hall wall line only where the office opens onto the corridor.
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

// Ambient from the room's atlas (A), or blended with the corridor's (B) where envBlend.y = 1; scaled by envBlend.x.
const AMBIENT_GLSL = `
#if LIT_AMBIENT_SOURCE == ENVALATLAS
  #include "envAtlasPS"
  uniform sampler2D envBlendA;
  uniform sampler2D envBlendB;
  uniform vec4 envBlend;
  ${BLEND_GLSL}
#endif
void addAmbient(vec3 worldNormal) {
  #if LIT_AMBIENT_SOURCE == ENVALATLAS
    vec3 dir = normalize(cubeMapRotate(worldNormal) * vec3(-1.0, 1.0, 1.0));
    vec2 uv = mapUv(toSphericalUv(dir), vec4(128.0, 256.0 + 128.0, 64.0, 32.0) / atlasSize);
    vec3 a = {ambientDecode}(texture2D(envBlendA, uv));
    vec3 b = {ambientDecode}(texture2D(envBlendB, uv));
    float w = envBlend.y * envBlendWeight(vPositionW);
    dDiffuseLight += mix(a, b, w) * envBlend.x;
  #else
    dDiffuseLight += light_globalAmbient;
  #endif
}
`;
const AMBIENT_WGSL = `
#if LIT_AMBIENT_SOURCE == ENVALATLAS
  #include "envAtlasPS"
  var envBlendA: texture_2d<f32>;
  var envBlendASampler: sampler;
  var envBlendB: texture_2d<f32>;
  var envBlendBSampler: sampler;
  uniform envBlend: vec4f;
  ${BLEND_WGSL}
#endif
fn addAmbient(worldNormal: vec3f) {
  #if LIT_AMBIENT_SOURCE == ENVALATLAS
    let dir: vec3f = normalize(cubeMapRotate(worldNormal) * vec3f(-1.0, 1.0, 1.0));
    let uv: vec2f = mapUv(toSphericalUv(dir), vec4f(128.0, 256.0 + 128.0, 64.0, 32.0) / atlasSize);
    let a: vec3f = {ambientDecode}(textureSample(envBlendA, envBlendASampler, uv));
    let b: vec3f = {ambientDecode}(textureSample(envBlendB, envBlendBSampler, uv));
    let w: f32 = uniform.envBlend.y * envBlendWeight(vPositionW);
    dDiffuseLight += mix(a, b, vec3f(w)) * uniform.envBlend.x;
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
  // ambient: strength of the bounce light (1 = what the probe saw)
  constructor(app, camera, apartment, { ambient = 0.3 } = {}) {
    this.app = app;
    this.camera = camera;
    this.ambient = ambient;
    const device = app.graphicsDevice;
    const format = device.textureHalfFloatRenderable ? PIXELFORMAT_RGBA16F : PIXELFORMAT_RGBA8;
    for (const [id, z] of Object.entries(ZONES)) {
      z.id = id;
      z.atlas = new Texture(device, { name: `probe-${id}`, width: 512, height: 512, format, mipmaps: false,
        projection: TEXTUREPROJECTION_EQUIRECT, addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE });
      const [lo, hi] = z.box;
      z.bounds = new BoundingBox(new Vec3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2),
        new Vec3((hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2));
    }
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
    m.shaderChunksVersion = '2.23';
    const open = zone === 'main' || zone === 'hall';
    m.setParameter('envBlendA', open ? ZONES.main.atlas : z.atlas);
    m.setParameter('envBlendB', open ? ZONES.hall.atlas : z.atlas);
    m.setParameter('envBlend', [this.ambient, open ? 1 : 0, 0, 0]);
    m.setParameter('envProbePos', z.at);
    m.update();
    this.materials.push(m);
  }

  setAmbient(k) {
    this.ambient = k;
    for (const m of this.materials) { const p = m.getParameter('envBlend').data; m.setParameter('envBlend', [k, p[1], 0, 0]); }
  }

  // Capture every room's probe, all in one frame (the flashlight is held out of them for just that frame). Twice at
  // start-up, so each room's probe already holds the bounce light of the others.
  async captureAll(passes = 1) {
    const zones = Object.values(ZONES);
    for (let p = 0; p < passes; p++) {
      const cubes = await Promise.all(zones.map(z => captureCube(this.app, this.camera, z.at)));
      zones.forEach((z, i) => {
        const source = EnvLighting.generateLightingSource(cubes[i]);
        EnvLighting.generateAtlas(source, { target: z.atlas });
        source.destroy();
        cubes[i].destroy();
      });
    }
  }
}

// Night lighting for the apartment: moonlight through the windows, the apartment's own lamps (positions measured
// from the model, see docs/areas/lighting.md), a night-sky cubemap outside the windows, and a reflection probe
// captured from inside the lit room so ambient light and reflections carry the room's own colours.
import {
  Color, Entity, Quat, Vec3, Texture, RenderTarget, EnvLighting,
  LIGHTFALLOFF_INVERSESQUARED, SHADOW_PCF3_32F, SHADOWUPDATE_THISFRAME, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA8,
  FILTER_LINEAR, FILTER_LINEAR_MIPMAP_LINEAR, RENDERTARGET_ORIGIN_TOP, TONEMAP_LINEAR, GAMMA_NONE,
} from 'playcanvas';

const WARM = new Color(1.0, 0.80, 0.60);      // ~2900 K warm-white LED / incandescent
const NEUTRAL = new Color(1.0, 0.92, 0.82);
const SCREEN = new Color(0.55, 0.70, 1.0);

// [name, type, position, colour, intensity, range, shadows, extra]
// Spot lights point straight down unless `dir` is given. Positions are world metres (see tools/inspect-model.mjs).
export const LAMPS = [
  ['arc lamp', 'spot', [-4.95, 1.58, 2.76], WARM, 5.0, 6.5, true, { inner: 25, outer: 62 }],
  ['arc lamp shade', 'omni', [-4.95, 1.66, 2.76], WARM, 0.35, 2.2, false],
  // Stand-in for the bounce off the lit sofa and rug, which the probe (placed in the darker middle) under-reports.
  ['living bounce', 'omni', [-3.6, 1.3, 2.2], WARM, 0.45, 6.5, false],
  ['dining pendant L', 'spot', [-0.44, 1.74, 1.52], WARM, 3.2, 5.5, true, { inner: 30, outer: 70 }],
  ['dining pendant R', 'spot', [0.77, 1.74, 1.52], WARM, 3.2, 5.5, true, { inner: 30, outer: 70 }],
  ['cooker hood', 'spot', [-0.93, 1.50, -1.10], NEUTRAL, 1.6, 3.0, true, { inner: 35, outer: 75 }],
  ['bathroom mirror', 'omni', [6.95, 1.75, 1.25], NEUTRAL, 0.7, 3.2, true],
  ['bedside strip', 'omni', [13.55, 0.95, 0.45], WARM, 0.9, 3.4, true],
  // LED inside the bedroom's open shoe closet (where the flashlight lies), on the bedroom switch.
  ['closet light', 'omni', [9.62, 1.08, 1.75], WARM, 0.3, 1.2, false],
  ['desk lamp', 'omni', [4.11, 1.36, -0.85], WARM, 0.55, 2.4, true],
  ['iMac glow', 'omni', [5.24, 1.10, -0.90], SCREEN, 0.35, 2.2, false],
  ['laptop glow', 'omni', [-4.30, 0.70, 2.40], SCREEN, 0.18, 1.5, false],
  ['hall night light', 'omni', [12.70, 2.30, 3.75], WARM, 0.75, 5.5, true],
];

// Moonlight enters through the north (z = -1.5) and west (x = -6.5) windows, heading south-east and down.
const MOON_DIR = new Vec3(0.45, -0.62, 0.64).normalize();

export function setupLighting(app) {
  const s = app.scene;
  const L = s.lighting;
  L.shadowsEnabled = true;
  L.shadowAtlasResolution = 4096;
  L.shadowType = SHADOW_PCF3_32F;
  L.maxLightsPerCell = 12;
  L.cells = new Vec3(16, 4, 8);
  L.cookiesEnabled = true;          // flashlight beam pattern, rain on the windows (street lamps)
  L.cookieAtlasResolution = 1024;
  s.ambientLight = new Color(0.006, 0.007, 0.010);

  const lights = [];
  for (const [name, type, p, color, intensity, range, shadows, extra = {}] of LAMPS) {
    const e = new Entity(name);
    e.addComponent('light', {
      type, color, intensity, range, castShadows: shadows, falloffMode: LIGHTFALLOFF_INVERSESQUARED,
      innerConeAngle: extra.inner ?? 30, outerConeAngle: extra.outer ?? 60,
      shadowResolution: 512, shadowBias: 0.25, normalOffsetBias: 0.04, volumetricScattering: type === 'spot' ? 1 : 0.4,
    });
    e.setPosition(p[0], p[1], p[2]);
    // The rooms do not move: render each lamp's shadow once (the engine re-renders it when the light changes).
    e.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
    app.root.addChild(e);
    lights.push(e);
  }

  const moon = new Entity('moon');
  moon.addComponent('light', {
    type: 'directional', color: new Color(0.52, 0.62, 1.0), intensity: 1.3, castShadows: true,
    shadowResolution: 2048, shadowDistance: 24, numCascades: 1, shadowBias: 0.3, normalOffsetBias: 0.05,
  });
  moon.setRotation(rotationBetween(Vec3.DOWN, MOON_DIR));
  moon.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
  app.root.addChild(moon);

  s.skybox = nightSky(app.graphicsDevice);
  s.skyboxIntensity = 1;
  return { lights, moon };
}

// Quaternion turning vector a onto vector b (both unit length).
function rotationBetween(a, b) {
  const axis = new Vec3().cross(a, b);
  const angle = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
  return axis.length() < 1e-6 ? new Quat() : new Quat().setFromAxisAngle(axis.normalize(), angle * 180 / Math.PI);
}

// Dark blue night sky with a faint sodium glow of the city at the horizon, as an 8-bit cubemap.
function nightSky(device) {
  const N = 64;
  const faces = [];
  for (let f = 0; f < 6; f++) {
    const px = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const t = (j + 0.5) / N * 2 - 1;
      // y component of the direction for each cube face (GL convention): sides look down as t grows.
      const y = f === 2 ? 1 : f === 3 ? -1 : -t / Math.hypot(1, t, (i + 0.5) / N * 2 - 1);
      const up = Math.max(0, y), glow = Math.exp(-Math.abs(y) * 9);
      const r = 0.012 + 0.07 * glow + 0.004 * up, g = 0.016 + 0.045 * glow + 0.008 * up, b = 0.035 + 0.025 * glow + 0.03 * up;
      const k = (j * N + i) * 4;
      px[k] = 255 * Math.pow(r, 1 / 2.2); px[k + 1] = 255 * Math.pow(g, 1 / 2.2); px[k + 2] = 255 * Math.pow(b, 1 / 2.2); px[k + 3] = 255;
    }
    faces.push(px);
  }
  return new Texture(device, {
    name: 'night-sky', width: N, height: N, cubemap: true, format: PIXELFORMAT_RGBA8, mipmaps: false,
    minFilter: FILTER_LINEAR, magFilter: FILTER_LINEAR, levels: [faces],
  });
}

// Renders the lit room into a cubemap from `pos` (one frame), then turns it into the scene's environment atlas:
// diffuse ambient and glossy reflections now come from the apartment itself instead of a generic sky.
export function captureProbe(app, camera, pos, { size = 256, intensity = 1 } = {}) {
  return new Promise((resolve) => {
    const device = app.graphicsDevice;
    const cube = new Texture(device, {
      name: 'room-probe', width: size, height: size, cubemap: true, mipmaps: true,
      format: device.textureHalfFloatRenderable ? PIXELFORMAT_RGBA16F : PIXELFORMAT_RGBA8,
      minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR,
    });
    const rotations = [[0, 90, 0], [0, -90, 0], [-90, 0, 180], [90, 0, 180], [0, 180, 0], [0, 0, 0]];
    const rig = new Entity('probe');
    rig.setPosition(pos[0], pos[1], pos[2]);
    const cams = rotations.map((r, face) => {
      const e = new Entity(`probe-${face}`);
      e.addComponent('camera', {
        aspectRatio: 1, fov: 90, nearClip: 0.05, farClip: 60, layers: camera.camera.layers, priority: -10,
        clearColor: new Color(0, 0, 0, 1), toneMapping: TONEMAP_LINEAR, gammaCorrection: GAMMA_NONE,
        renderTarget: new RenderTarget({ name: `probe-face-${face}`, colorBuffer: cube, depth: true, face, origin: RENDERTARGET_ORIGIN_TOP }),
      });
      e.setLocalEulerAngles(r[0], r[1], r[2]);
      rig.addChild(e);
      return e.camera;
    });
    app.root.addChild(rig);
    const off = app.on('frameend', () => {
      off.off();
      cams.forEach(c => { c.enabled = false; });
      const lighting = EnvLighting.generateLightingSource(cube);
      const atlas = EnvLighting.generateAtlas(lighting);
      lighting.destroy();
      // skyboxIntensity scales both the environment lighting and the sky seen through the windows.
      app.scene.envAtlas = atlas;
      app.scene.skyboxIntensity = intensity;
      rig.destroy();
      cube.destroy();
      resolve(atlas);
    });
  });
}

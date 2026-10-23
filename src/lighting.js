// Night lighting for the apartment: moonlight through the windows, the apartment's own lamps (positions measured
// from the model, see docs/areas/lighting.md), a night-sky cubemap outside the windows, and a reflection probe
// captured from inside the lit room so ambient light and reflections carry the room's own colours.
import {
  Color, Entity, Quat, Vec3, Texture, RenderTarget, EnvLighting, StandardMaterial,
  LIGHTFALLOFF_INVERSESQUARED, SHADOW_PCF3_32F, SHADOWUPDATE_THISFRAME, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA8,
  FILTER_LINEAR, FILTER_LINEAR_MIPMAP_LINEAR, RENDERTARGET_ORIGIN_TOP, TONEMAP_LINEAR, GAMMA_NONE,
} from 'playcanvas';

const WARM = new Color(1.0, 0.80, 0.60);      // ~2900 K warm-white LED / incandescent
const NEUTRAL = new Color(1.0, 0.92, 0.82);
const SCREEN = new Color(0.55, 0.70, 1.0);

// [name, type, position, colour, intensity, range, shadows, extra]
// Spot lights point straight down unless `dir` is given. Positions are world metres (see tools/inspect-model.mjs).
export const LAMPS = [
  ['arc lamp', 'spot', [-4.95, 1.58, 2.76], WARM, 3.2, 6.0, true, { inner: 20, outer: 68 }],
  ['arc lamp shade', 'omni', [-4.95, 1.66, 2.76], WARM, 0.22, 2.2, false],
  // Stand-in for the bounce off the lit sofa and rug, which the probe (placed in the darker middle) under-reports.
  ['living bounce', 'omni', [-3.6, 1.3, 2.2], WARM, 0.25, 6.0, false],
  ['dining pendant L', 'spot', [-0.44, 1.74, 1.52], WARM, 2.0, 5.0, true, { inner: 24, outer: 72 }],
  ['dining pendant R', 'spot', [0.77, 1.74, 1.52], WARM, 2.0, 5.0, true, { inner: 24, outer: 72 }],
  ['cooker hood', 'spot', [-0.93, 1.50, -1.10], NEUTRAL, 1.1, 3.0, true, { inner: 30, outer: 78 }],
  ['bathroom mirror', 'omni', [6.95, 1.75, 1.25], NEUTRAL, 0.45, 3.0, true],
  // The bedside reading lamps are in devices.js (each has its own switch).
  // LED inside the bedroom's open shoe closet (where the flashlight lies), on the bedroom switch.
  ['closet light', 'omni', [9.62, 1.08, 1.75], WARM, 0.3, 1.2, false],
  ['desk lamp', 'omni', [4.11, 1.36, -0.85], WARM, 0.4, 2.4, true],
  ['iMac glow', 'omni', [5.24, 1.10, -0.90], SCREEN, 0.35, 2.2, false],
  ['laptop glow', 'omni', [-4.30, 0.70, 2.40], SCREEN, 0.18, 1.5, false],
  ['hall night light', 'omni', [12.70, 2.30, 3.75], WARM, 0.22, 3.5, true],
];

// Recessed ceiling downlights (2700 K, dimmed), the main light of each area as in a real flat. [room, x, z]
// Soft and warm rather than bright: with everything on the flat reads as lived-in evening light, not an office.
export const DOWNLIGHTS = [
  ['hall', 2.6, 3.65], ['hall', 4.6, 3.65], ['hall', 6.6, 3.65], ['hall', 8.6, 3.65], ['hall', 10.6, 3.65], ['hall', 12.6, 3.65],
  ['living', -5.4, 1.2], ['living', -3.2, 1.2], ['living', -5.4, 3.4], ['living', -3.2, 3.4],
  ['kitchen', -3.0, 0.15], ['kitchen', -1.2, 0.15], ['kitchen', 0.6, 0.15], ['kitchen', 0.2, 2.9],
  ['office', 3.6, -0.2], ['office', 5.2, 0.9], ['office', 3.4, 1.9],
  ['bathroom', 7.3, -0.6], ['bathroom', 7.9, 1.0],
  ['bedroom', 10.8, -0.5], ['bedroom', 12.8, -0.5], ['bedroom', 10.8, 1.6], ['bedroom', 12.8, 1.6],
];
const DOWN = new Color(1.0, 0.85, 0.70);
export const DOWNLIGHT = { intensity: 1.35, glow: 2.2 };

// Each downlight: a shadowed spot pointing down plus a small glowing disc in a bezel, flush with the ceiling.
// Returns { [room]: [{ light, glow }] } for the switches.
export function addDownlights(app, grid) {
  const bezel = new StandardMaterial();
  bezel.diffuse = new Color(0.85, 0.85, 0.85); bezel.useMetalness = true; bezel.metalness = 0.6; bezel.gloss = 0.7; bezel.update();
  const rooms = {};
  for (const [room, x, z] of DOWNLIGHTS) {
    const y = (grid.ceilingAt(x, z) ?? 2.76) - 0.004;
    const e = new Entity(`downlight ${room}`);
    e.addComponent('light', {
      type: 'spot', color: DOWN, intensity: DOWNLIGHT.intensity, range: 4.2, innerConeAngle: 14, outerConeAngle: 74, castShadows: true,
      falloffMode: LIGHTFALLOFF_INVERSESQUARED, shadowResolution: 512, shadowBias: 0.25, normalOffsetBias: 0.04, volumetricScattering: 0.25,
    });
    e.setPosition(x, y - 0.01, z);
    e.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
    app.root.addChild(e);
    const glow = new StandardMaterial();
    glow.diffuse = Color.BLACK; glow.emissive = new Color(1, 0.86, 0.7); glow.emissiveIntensity = DOWNLIGHT.glow; glow.update();
    const ring = new Entity('downlight bezel');
    ring.addComponent('render', { type: 'cylinder', material: bezel, castShadows: false });
    ring.setLocalScale(0.11, 0.008, 0.11); ring.setPosition(x, y, z);
    const disc = new Entity('downlight lens');
    disc.addComponent('render', { type: 'cylinder', material: glow, castShadows: false });
    disc.setLocalScale(0.085, 0.004, 0.085); disc.setPosition(x, y - 0.004, z);
    app.root.addChild(ring); app.root.addChild(disc);
    (rooms[room] ||= []).push({ light: e, glow });
  }
  return rooms;
}

// Moonlight enters through the north (z = -1.5) and west (x = -6.5) windows, heading south-east and down.
const MOON_DIR = new Vec3(0.45, -0.62, 0.64).normalize();

export function setupLighting(app) {
  const s = app.scene;
  const L = s.lighting;
  L.shadowsEnabled = true;
  L.shadowAtlasResolution = 4096;
  L.shadowType = SHADOW_PCF3_32F;
  // ~45 lights in 21 x 6 m: fine cells and a generous per-cell budget so no lamp is dropped where many overlap.
  L.maxLightsPerCell = 32;
  L.cells = new Vec3(28, 3, 10);
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
    type: 'directional', color: new Color(0.52, 0.62, 1.0), intensity: 0.45, castShadows: true,
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

// Lamps render their shadows once (static rooms). Something that moves (a door, the laptop lid) asks the shadowed lamps
// within `radius` of `pos` to render theirs again this frame.
export function refreshShadows(app, pos, radius) {
  const list = refreshShadows.list ||= app.root.findComponents('light').filter(l => l.castShadows && l.shadowUpdateMode !== undefined && l.entity.name !== 'flashlight beam');
  for (const l of list) {
    if (!l.enabled || l.type === 'directional') continue;
    if (l.entity.getPosition().distance(pos) < radius + l.range * 0.5) l.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
  }
}

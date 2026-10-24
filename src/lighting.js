// Night lighting for the apartment: the apartment's own lamps (at their fixtures, measured from the model) and
// recessed ceiling downlights, all with soft static shadows; a night-sky cubemap outside the windows. There is no
// moonlight (outside is pitch black, as in P.T.): the 'moon' light is dark except in a lightning flash (rain.js), which
// throws the window frames' shadows across the floor for an instant. Bounce light and reflections: probes.js.
import {
  Color, Entity, Layer, Quat, Vec3, Texture, RenderTarget, StandardMaterial,
  LIGHTFALLOFF_INVERSESQUARED, SHADOW_PCF3_32F, SHADOWUPDATE_THISFRAME, SHADOWUPDATE_REALTIME, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA8,
  FILTER_LINEAR, FILTER_LINEAR_MIPMAP_LINEAR, RENDERTARGET_ORIGIN_TOP, LAYERID_WORLD, TONEMAP_LINEAR, GAMMA_NONE, ADDRESS_CLAMP_TO_EDGE,
} from 'playcanvas';
import { ARC_LAMP, arcLampProfile } from './lamp-profiles.js';

const WARM = new Color(1.0, 0.80, 0.60);      // ~2900 K warm-white LED / incandescent
const NEUTRAL = new Color(1.0, 0.92, 0.82);
const SCREEN = new Color(0.55, 0.70, 1.0);

// [name, type, position, colour, intensity, range, shadows, extra]
// Spot lights point straight down. Every lamp sits where its fixture's bulb is in the model (measured from the source
// meshes: shade and glass bounds), so shadows fall away from the fixture you see; see-through parts (glass) cast none.
// No stand-in lights: bounce light comes from the room probes (probes.js).
export const LAMPS = [
  // Recessed inside the actual open shade, below its opaque top. See lamp-profiles.js.
  ['arc lamp', 'spot', ARC_LAMP.position, WARM, 1.6, 8.0, true,
    { inner: ARC_LAMP.inner, outer: ARC_LAMP.outer, profile: arcLampProfile, shadowBias: 0.15, normalOffsetBias: 0.025 }],
  // at the bulbs inside the pendants' opal globes (y 1.76-2.11): light all round, the globes glow and cast no shadow
  ['dining pendant L', 'omni', [-0.44, 1.94, 1.523], WARM, 0.4, 6.5, true],
  ['dining pendant R', 'omni', [0.777, 1.94, 1.523], WARM, 0.4, 6.5, true],
  ['cooker hood', 'spot', [-0.94, 1.53, -1.13], NEUTRAL, 0.44, 2.8, true, { inner: 30, outer: 72 }],
  // in front of the vertical LED strips beside the bathroom mirror (x 6.46-6.54, y 1.04-2.32)
  ['bathroom mirror', 'omni', [6.62, 1.65, 1.25], NEUTRAL, 0.12, 3.2, true],
  // The bedside reading lamps are in devices.js (each has its own switch).
  // LED inside the bedroom's open shoe closet, with its own switch (devices.js). Shadowed like every light here: an
  // unshadowed light shines straight through walls (this one lit the bathroom and the corridor).
  ['closet light', 'omni', [9.62, 1.08, 1.75], WARM, 0.25, 1.8, true],
  // at the desk lamp's bulb, inside its shade (the shade shadows all but its opening)
  ['desk lamp', 'omni', [4.105, 1.375, -0.93], WARM, 0.3, 3.6, true],
  // Screens: a soft glow from each panel, out of its face only (a spot aimed along the screen's normal), shadowed.
  ['iMac glow', 'spot', [5.24, 1.12, -0.93], SCREEN, 0.3, 3.2, true, { aim: [5.24, 1.0, 0.5], inner: 20, outer: 72 }],
  ['laptop glow', 'spot', [-4.285, 0.66, 2.455], SCREEN, 0.15, 2.2, true, { aim: [-5.15, 0.45, 3.53], inner: 20, outer: 72 }],
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
// Ceiling LEDs are a little more neutral than the practical lamps. This preserves
// warm pools around lamps without giving white walls and every material one amber cast.
const DOWN = new Color(1.0, 0.90, 0.80);
export const DOWNLIGHT = { intensity: 0.92, glow: 2.2, range: 7.0 };
// Beam of a recessed LED downlight (like a photometric profile): full in a ~60 deg beam, falling off to a dim wide field.
// Walls near a downlight get the familiar bright arch ("scallop") instead of an even wash. As a function of the angle
// from straight down; drawn into a cookie, whose radius is tan(angle) / tan(outer cone angle).
const DOWN_OUTER = 72;
const downProfile = (deg) => 0.34 + 0.66 * Math.exp(-((deg / 38) ** 4));

// Each downlight: a shadowed spot pointing down plus a small glowing disc in a bezel, flush with the ceiling.
// Returns { [room]: [{ light, glow }] } for the switches.
export function addDownlights(app, grid) {
  const cookie = profileCookie(app.graphicsDevice, downProfile, DOWN_OUTER);
  const bezel = new StandardMaterial();
  bezel.diffuse = new Color(0.85, 0.85, 0.85); bezel.useMetalness = true; bezel.metalness = 0.6; bezel.gloss = 0.7; bezel.update();
  const rooms = {};
  for (const [room, x, z] of DOWNLIGHTS) {
    const y = (grid.ceilingAt(x, z) ?? 2.76) - 0.004;
    const e = new Entity(`downlight ${room}`);
    e.addComponent('light', {
      type: 'spot', color: DOWN, intensity: DOWNLIGHT.intensity, range: DOWNLIGHT.range, innerConeAngle: 12, outerConeAngle: DOWN_OUTER, castShadows: true,
      cookie, cookieIntensity: 1,
      falloffMode: LIGHTFALLOFF_INVERSESQUARED, shadowResolution: 512, shadowBias: 0.15, normalOffsetBias: 0.025, volumetricScattering: 0.18,
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

function profileCookie(device, profile, outer) {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), t = Math.tan(outer * Math.PI / 180);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const r = Math.hypot((i + 0.5) / N * 2 - 1, (j + 0.5) / N * 2 - 1);
    const v = r >= 1 ? 0 : profile(Math.atan(r * t) * 180 / Math.PI), k = (j * N + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * Math.min(1, v)); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new Texture(device, { width: N, height: N, format: PIXELFORMAT_RGBA8, mipmaps: true, name: 'lamp-profile',
    addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE });
  tex.setSource(c);
  return tex;
}

// Moonlight enters through the north (z = -1.5) and west (x = -6.5) windows, heading south-east and down.
const MOON_DIR = new Vec3(0.45, -0.62, 0.64).normalize();

export function setupLighting(app) {
  const s = app.scene;
  const L = s.lighting;
  L.shadowsEnabled = true;
  L.shadowAtlasResolution = 4096;
  L.shadowType = SHADOW_PCF3_32F;      // filtered soft edges; the same at every preset (scene-quality.js)
  // ~45 lights in 21 x 6 m: fine cells and a generous per-cell budget so no lamp is dropped where many overlap.
  L.maxLightsPerCell = 32;
  L.cells = new Vec3(28, 3, 10);
  L.cookiesEnabled = true;          // flashlight beam pattern, rain on the windows (street lamps)
  L.cookieAtlasResolution = 2048;     // ~25 cookies: the downlights' beam profile and the flashlight's pattern
  s.ambientLight = new Color(0, 0, 0);     // no light from nowhere: with every lamp off the flat is black

  const lights = [];
  for (const [name, type, p, color, intensity, range, shadows, extra = {}] of LAMPS) {
    const e = new Entity(name);
    e.addComponent('light', {
      type, color, intensity, range, castShadows: shadows, falloffMode: LIGHTFALLOFF_INVERSESQUARED,
      innerConeAngle: extra.inner ?? 30, outerConeAngle: extra.outer ?? 60,
      ...(extra.profile ? { cookie: profileCookie(app.graphicsDevice, extra.profile, extra.outer), cookieIntensity: 1 } : {}),
      shadowResolution: 512, shadowBias: extra.shadowBias ?? 0.25, normalOffsetBias: extra.normalOffsetBias ?? 0.04,
      volumetricScattering: type === 'spot' ? 1 : 0.4,
    });
    e.setPosition(p[0], p[1], p[2]);
    if (extra.aim) { e.lookAt(new Vec3(...extra.aim)); e.rotateLocal(90, 0, 0); }     // spots shine along their local -Y
    // The rooms do not move: render each lamp's shadow once (the engine re-renders it when the light changes).
    e.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
    app.root.addChild(e);
    lights.push(e);
  }

  const moon = new Entity('moon');
  moon.addComponent('light', {
    type: 'directional', color: new Color(0.52, 0.62, 1.0), intensity: 0, enabled: true, castShadows: true,
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

// The night outside the windows: almost black (a trace of blue and of the city's glow at the horizon); only a lightning
// flash shows anything out there (rain.js). An 8-bit cubemap.
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
      const r = 0.0006 + 0.004 * glow, g = 0.0008 + 0.003 * glow + 0.0004 * up, b = 0.0016 + 0.002 * glow + 0.0014 * up;
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

// The probes' capture cameras (probes.js): six cameras, one per cube face, made once and enabled only on the frames
// they capture (their names start 'probe-', which probes.js uses to give them direct light only), and one reusable
// cubemap per capture size. capture() renders the given faces from `pos` this frame and resolves when it has drawn.
export class ProbeRig {
  constructor(app, camera) {
    this.app = app;
    this.cubes = new Map();
    this.targets = new Map();
    const rotations = [[0, 90, 0], [0, -90, 0], [-90, 0, 180], [90, 0, 180], [0, 180, 0], [0, 0, 0]];
    this.root = new Entity('probe');
    this.cams = rotations.map((r, face) => {
      const e = new Entity(`probe-${face}`);
      e.addComponent('camera', {
        aspectRatio: 1, fov: 90, nearClip: 0.05, farClip: 60, layers: camera.camera.layers, priority: -10,
        clearColor: new Color(0, 0, 0, 1), toneMapping: TONEMAP_LINEAR, gammaCorrection: GAMMA_NONE,
      });
      e.setLocalEulerAngles(r[0], r[1], r[2]);
      e.camera.enabled = false;
      this.root.addChild(e);
      return e.camera;
    });
    app.root.addChild(this.root);
  }

  cube(size) {
    let cube = this.cubes.get(size);
    if (!cube) {
      const device = this.app.graphicsDevice;
      cube = new Texture(device, {
        name: `room-probe-${size}`, width: size, height: size, cubemap: true, mipmaps: true,
        format: device.textureHalfFloatRenderable ? PIXELFORMAT_RGBA16F : PIXELFORMAT_RGBA8,
        minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR,
      });
      this.cubes.set(size, cube);
      this.targets.set(size, [0, 1, 2, 3, 4, 5].map(face => new RenderTarget({ name: `probe-face-${size}-${face}`, colorBuffer: cube, depth: true, face, origin: RENDERTARGET_ORIGIN_TOP })));
    }
    return cube;
  }

  frame() { return new Promise(resolve => this.app.once('frameend', resolve)); }

  capture(pos, size, faces) {
    this.cube(size);
    const targets = this.targets.get(size);
    this.root.setPosition(pos[0], pos[1], pos[2]);
    for (const face of faces) { const c = this.cams[face]; c.renderTarget = targets[face]; c.enabled = true; }
    return this.frame().then(() => { for (const c of this.cams) c.enabled = false; });
  }
}

// Particle effects (rain outside, coffee steam) draw on their own layer, after the world's transparent things, seen by the
// player's camera only: the probes must not capture steam, and a probe camera drawing particles builds another particle
// shader mid-game. Create it after the probes (their cameras copy the player camera's layers when they are made).
export function effectsLayer(app, camera) {
  const layers = app.scene.layers;
  let layer = layers.getLayerByName('Effects');
  if (!layer) {
    layer = new Layer({ name: 'Effects' });
    layers.insertTransparent(layer, layers.getTransparentIndex(layers.getLayerByName('World')) + 1);
  }
  if (camera && !camera.camera.layers.includes(layer.id)) camera.camera.layers = [...camera.camera.layers, layer.id];
  return layer.id;
}
export const effectsLayers = (app) => { const layer = app.scene?.layers?.getLayerByName('Effects'); return [layer ? layer.id : LAYERID_WORLD]; };

// The shared shadow (and cookie) atlas is cut into one grid cell per shadowed or cookie light in the flat, fixed for good.
// Left to itself the engine sizes the grid by how many such lights are on and in view this frame, and every change of
// grid (turning round, walking into another room, a probe capture, a switch) re-renders every visible lamp's shadow in
// one frame: dozens of passes over the whole flat, the game's worst freeze. Call once every light exists.
export function fixShadowAtlas(app) {
  const n = app.root.findComponents('light').filter(l => l.type !== 'directional' && (l.castShadows || l.cookie)).length;
  app.scene.lighting.atlasSplit = [Math.max(1, Math.ceil(Math.sqrt(n)))];
  return n;
}

// All lamp shadows rendered again (after the shadow atlas is reallocated, e.g. a quality change).
export function rerenderShadows(app) {
  for (const l of app.root.findComponents('light')) {
    // Dynamic lights already render every frame. Turning their mode into a
    // one-shot here would freeze the flashlight's return after a probe capture.
    if (l.castShadows && l.type !== 'directional' && l.shadowUpdateMode !== SHADOWUPDATE_REALTIME) l.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
  }
}

// Lamps render their shadows once (static rooms). Something that moves (a door, the laptop lid) asks the shadowed lamps
// that can see it to render theirs again this frame: `pos` and `radius` bound the moving part. A lamp counts if the part
// is within the reach where its light still shows (60% of its range) and, for a spot, inside its cone; re-rendering
// every shadow near a swinging door cost a dozen extra passes over the flat each frame.
const _toPart = new Vec3();
export function refreshShadows(app, pos, radius) {
  // Discover lights per application: a process-global cache misses lamps created
  // later and can retain destroyed lights when a second scene is initialized.
  for (const l of app.root.findComponents('light')) {
    if (!l.castShadows || l.shadowUpdateMode === undefined || l.shadowUpdateMode === SHADOWUPDATE_REALTIME) continue;
    if (!l.enabled || l.type === 'directional') continue;
    _toPart.sub2(pos, l.entity.getPosition());
    const d = _toPart.length();
    if (d > l.range * 0.6 + radius) continue;
    const up = l.type === 'spot' ? l.entity.up : null;
    if (up && d > radius) {
      // Spots shine along their local -Y: skip when the part lies wholly outside the cone.
      const angle = Math.acos(Math.max(-1, Math.min(1, -_toPart.dot(up) / d))) * 180 / Math.PI;
      if (angle - Math.asin(Math.min(1, radius / d)) * 180 / Math.PI > l.outerConeAngle) continue;
    }
    l.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
  }
}

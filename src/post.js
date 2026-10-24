// Camera look: HDR with neutral (hue-preserving) tone mapping, TAA, ambient occlusion, bloom, light volumetric haze (glow
// around lamps, the torch's beam), a cool night grade, a soft vignette, and eye adaptation (EyeAdaptation below).
// Quality keys 1-3 trade these for speed.
import { CameraFrame, TONEMAP_NEUTRAL, SSAOTYPE_LIGHTING } from 'playcanvas';

export function setupPost(app, camera, options = qualityOptions(3)) {
  const frame = new CameraFrame(app, camera.camera);
  const r = frame.rendering;
  r.toneMapping = TONEMAP_NEUTRAL;
  r.sharpness = 0.25;
  frame.taa.enabled = true;
  frame.taa.jitter = 1;

  frame.ssao.type = SSAOTYPE_LIGHTING;
  // Contact-scale occlusion grounds furniture without painting metre-wide dark halos.
  frame.ssao.intensity = 0.65;
  frame.ssao.radius = 0.35;         // world units: this scene is in metres
  frame.ssao.samples = 24;
  frame.ssao.power = 1.8;
  frame.ssao.blurEnabled = true;
  frame.ssao.scale = 0.75;

  frame.bloom.intensity = 0.028;     // restrained halation around emissive fixtures
  frame.bloom.blurLevel = 7;

  frame.grading.enabled = true;
  frame.grading.saturation = 0.94;
  // No contrast: the engine applies it to linear light before tone mapping, around 0.5, so any value > 1 clips the darkest
  // quarter of the image to pure black (1.12 did: shadows went pitch black instead of fading out).
  frame.grading.contrast = 1.0;
  frame.grading.brightness = 1.0;
  frame.grading.tint.set(1.0, 0.99, 0.98);

  frame.vignette.intensity = 0.22;
  frame.vignette.inner = 0.5;
  frame.vignette.outer = 1.25;
  frame.vignette.curvature = 0.6;

  frame.fringing.intensity = 0.35;

  const moon = app.root.findByName('moon');
  const fog = frame.volumetricFog;
  fog.enabled = true;
  fog.light = moon?.light ?? null;
  fog.density = 0.006;
  fog.heightBase = 3;
  fog.heightFalloff = 0;
  fog.anisotropy = 0.55;
  fog.intensity = 2.4;
  fog.ambientColor.set(0.35, 0.42, 0.6);
  fog.ambientIntensity = 0;          // the haze shows only light that is really there
  fog.maxDistance = 12;          // short: haze in the rooms, but the city outside stays clear
  fog.steps = 20;
  fog.scale = 0.5;
  fog.localSpotLights = true;
  fog.localOmniLights = false;
  fog.localIntensity = 0.35;
  fog.localSteps = 10;
  fog.extinction = 0.6;

  applyGraphicsOptions(frame, options);
  return frame;
}

// High retains all effects; Medium scales back resolution and AO; Low keeps temporal edge smoothing and a cheap AO
// while removing the other full-screen effects. Ambient occlusion stays on at every preset: it is part of every lit
// shader (SSAOTYPE_LIGHTING), so switching it off recompiles the whole flat, a freeze when Auto steps down.
export function setQuality(frame, q) {
  applyGraphicsOptions(frame, qualityOptions(q));
}

export function qualityOptions(q) {
  const quality = [1, 2, 3].includes(Number(q)) ? Number(q) : 3;
  return { quality, resolutionScale: quality === 1 ? 0.75 : quality === 2 ? 0.85 : 1,
    ambientOcclusion: true, volumetricFog: quality === 3,
    bloom: quality > 1, taa: true, filmGrain: quality > 1 };
}

export function applyGraphicsOptions(frame, options) {
  frame.rendering.renderTargetScale = options.resolutionScale;
  frame.volumetricFog.enabled = options.volumetricFog;
  frame.ssao.type = options.ambientOcclusion ? SSAOTYPE_LIGHTING : 'none';
  frame.ssao.scale = options.quality === 3 ? 0.75 : 0.5;
  frame.ssao.samples = options.quality === 3 ? 20 : options.quality === 2 ? 10 : 6;
  frame.volumetricFog.steps = options.quality === 3 ? 16 : 8;
  frame.volumetricFog.localSteps = options.quality === 3 ? 8 : 4;
  frame.bloom.blurLevel = options.quality === 3 ? 7 : 5;
  frame.rendering.sharpness = options.resolutionScale < 1 ? 0.35 : 0.25;
  frame.bloom.intensity = options.bloom ? 0.028 : 0;
  frame.taa.enabled = options.taa;
  frame.update();
}

// Eye adaptation: the view brightens a little in dim places and dims where everything is lit, as eyes (and a game
// camera's auto exposure) do. Applied as the player camera's grading brightness (before tone mapping, like exposure),
// never as scene.exposure: that would also scale the probe captures, which would then feed back into the adaptation. It follows how bright the bounce light around the eye is (Probes.levelAt), only part of
// the way (level ^ -0.35), within limits; it adapts faster to light than to darkness, and at once after a teleport.
// ref: the level of a room lit by its own lamps (exposure 1 there).
const ADAPT = { ref: 0.17, power: 0.35, min: 0.65, max: 1.35, toLight: 0.7, toDark: 2.4 };
export class EyeAdaptation {
  // fixed: a set exposure (#ev, for tuning) instead of adapting.
  constructor(app, camera, frame, probes, flashlight, fixed = null) {
    Object.assign(this, { app, camera, frame, probes, flashlight, fixed, enabled: fixed === null, value: fixed ?? 1 });
    this.last = camera.getPosition().clone();
    app.on('update', (dt) => this.update(dt));
  }

  update(dt) {
    const p = this.camera.getPosition();
    let level = this.enabled ? this.probes.levelAt(p.x, p.z) : null;
    if (level !== null && this.flashlight?.held && this.flashlight.on) level += 0.035;   // its beam lights what you look at
    const target = this.fixed ?? (level === null ? 1 : Math.min(ADAPT.max, Math.max(ADAPT.min, (ADAPT.ref / Math.max(level, 1e-4)) ** ADAPT.power)));
    if (p.distance(this.last) > 1.5) this.value = target;
    else this.value += (target - this.value) * (1 - Math.exp(-Math.min(dt, 0.1) / (target < this.value ? ADAPT.toLight : ADAPT.toDark)));
    this.last.copy(p);
    // The player's brightness setting (menu.js calibration) scales the adapted exposure.
    const b = this.value * (this.brightness ?? 1);
    this.frame.grading.brightness = b;
    const compose = this.frame.renderPassCamera?.composePass;
    if (compose) compose.gradingBrightness = b;
  }
}

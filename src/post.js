// Camera look: HDR with neutral (hue-preserving) tone mapping, TAA, ambient occlusion, bloom, light volumetric haze (glow
// around lamps, the torch's beam), a cool night grade, a soft vignette, and eye adaptation (EyeAdaptation below).
// Quality keys 1-3 trade these for speed.
import { CameraFrame, TONEMAP_NEUTRAL, SSAOTYPE_LIGHTING } from 'playcanvas';

export function setupPost(app, camera) {
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

  frame.update();
  setQuality(frame, 3);
  return frame;
}

// 3 = full, 2 = no fog, half-res AO, 1 = no AO/fog, lower resolution.
export function setQuality(frame, q) {
  frame.rendering.renderTargetScale = q === 1 ? 0.75 : 1;
  frame.volumetricFog.enabled = q === 3;
  frame.ssao.type = q === 1 ? 'none' : SSAOTYPE_LIGHTING;
  frame.ssao.scale = q === 3 ? 1 : 0.5;
  frame.ssao.samples = q === 3 ? 24 : 12;
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
    this.frame.grading.brightness = this.value;
    const compose = this.frame.renderPassCamera?.composePass;
    if (compose) compose.gradingBrightness = this.value;
  }
}

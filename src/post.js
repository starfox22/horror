// Camera look: HDR with neutral (hue-preserving) tone mapping, TAA, ambient occlusion, bloom, light volumetric haze (moonbeams through the
// windows, glow around lamps), a cool night grade and a soft vignette. Quality keys 1-3 trade these for speed.
import { CameraFrame, TONEMAP_NEUTRAL, SSAOTYPE_LIGHTING } from 'playcanvas';

export function setupPost(app, camera) {
  const frame = new CameraFrame(app, camera.camera);
  const r = frame.rendering;
  r.toneMapping = TONEMAP_NEUTRAL;
  r.sharpness = 0.35;
  frame.taa.enabled = true;
  frame.taa.jitter = 1;

  frame.ssao.type = SSAOTYPE_LIGHTING;
  frame.ssao.intensity = 0.65;
  frame.ssao.radius = 1.2;          // world units: this scene is in metres
  frame.ssao.samples = 16;
  frame.ssao.power = 5;
  frame.ssao.blurEnabled = true;
  frame.ssao.scale = 0.75;

  frame.bloom.intensity = 0.018;
  frame.bloom.blurLevel = 14;

  frame.grading.enabled = true;
  frame.grading.saturation = 0.82;
  frame.grading.contrast = 1.12;
  frame.grading.brightness = 1.0;
  frame.grading.tint.set(0.94, 0.97, 1.04);

  frame.vignette.intensity = 0.55;
  frame.vignette.inner = 0.35;
  frame.vignette.outer = 1.25;
  frame.vignette.curvature = 0.6;

  frame.fringing.intensity = 2;

  const moon = app.root.findByName('moon');
  const fog = frame.volumetricFog;
  fog.enabled = true;
  fog.light = moon?.light ?? null;
  fog.density = 0.014;
  fog.heightBase = 3;
  fog.heightFalloff = 0;
  fog.anisotropy = 0.55;
  fog.intensity = 2.4;
  fog.ambientColor.set(0.35, 0.42, 0.6);
  fog.ambientIntensity = 0.004;
  fog.maxDistance = 12;          // short: haze in the rooms, but the city outside stays clear
  fog.steps = 20;
  fog.scale = 0.5;
  fog.localSpotLights = true;
  fog.localOmniLights = false;
  fog.localIntensity = 0.6;
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
  frame.ssao.scale = q === 3 ? 0.75 : 0.5;
  frame.update();
}

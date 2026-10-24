// The same light still casts the same occlusion at every preset. Presets differ only in what can change without a
// hitch: the backing buffer, texture anisotropy, rain cadence and (post.js) the full-screen effects. Everything that is
// part of a lit shader or of the shadow atlas stays the same at every level: a different shadow filter would recompile
// every material in the flat, and a different atlas size would re-render every lamp's shadow, each a freeze of up to a
// second just when Auto steps down to keep the frame rate. (Clustered shadows draw into one shared atlas, so the
// per-light resolutions below only matter for lights outside it.)
import { SHADOW_PCF3_32F, SHADOWUPDATE_REALTIME, SHADOWUPDATE_THISFRAME } from 'playcanvas';

export const SHADOW_ATLAS = 4096;
export function sceneQualityOptions(quality) {
  const q = [1, 2, 3].includes(quality) ? quality : 3;
  return { shadowAtlas: SHADOW_ATLAS, cookieAtlas: 2048, shadowType: SHADOW_PCF3_32F,
    maxPixelRatio: q === 3 ? 1.5 : 1,
    maxPixels: [1280 * 720, 1920 * 1080, 2560 * 1440][q - 1],
    anisotropy: [2, 4, 8][q - 1], rainHz: [10, 15, 20][q - 1] };
}

// Limits high-DPI / 4K fill cost before the user's resolution percentage is
// applied. CSS canvas/HUD size stays unchanged. Returns a device pixel ratio.
export function backingPixelRatio(options, width, height, deviceRatio = 1) {
  const area = Math.max(1, width * height);
  return Math.min(deviceRatio || 1, options.maxPixelRatio, Math.sqrt(options.maxPixels / area));
}

export class SceneQuality {
  constructor(app, { rain = null, window: ownerWindow = globalThis.window } = {}) {
    Object.assign(this, { app, rain, ownerWindow });
    this.resize = () => this.applyResolution();
    ownerWindow?.addEventListener('resize', this.resize);
    app.once('destroy', () => ownerWindow?.removeEventListener('resize', this.resize));
  }

  apply(options) {
    const q = options.quality;
    if (q === this.quality) return;
    this.quality = q;
    const detail = this.detail = sceneQualityOptions(q), lighting = this.app.scene.lighting;
    if (lighting.shadowAtlasResolution !== detail.shadowAtlas || lighting.shadowType !== detail.shadowType) {
      lighting.shadowAtlasResolution = detail.shadowAtlas;
      lighting.shadowType = detail.shadowType;
      for (const light of this.app.root.findComponents('light')) {
        if (!light.castShadows) continue;
        light.shadowType = detail.shadowType;
        // A new atlas holds no shadows yet: one refresh for the static lamps (the flashlight is realtime anyway).
        if (light.shadowUpdateMode !== SHADOWUPDATE_REALTIME) light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
      }
    }
    lighting.cookieAtlasResolution = detail.cookieAtlas;
    const textures = new Set();
    for (const render of this.app.root.findComponents('render')) for (const instance of render.meshInstances) {
      for (const name of ['diffuseMap', 'normalMap', 'metalnessMap', 'glossMap', 'aoMap', 'emissiveMap', 'opacityMap']) {
        const texture = instance.material[name];
        if (texture && !textures.has(texture)) {
          textures.add(texture);
          texture.anisotropy = Math.min(detail.anisotropy, this.app.graphicsDevice.maxAnisotropy || 1);
        }
      }
    }
    this.rain?.setQuality?.(q);
    this.applyResolution();
  }

  applyResolution() {
    if (!this.detail) return;
    const device = this.app.graphicsDevice, canvas = device.canvas;
    const ratio = backingPixelRatio(this.detail, canvas.clientWidth || this.ownerWindow?.innerWidth || 1,
      canvas.clientHeight || this.ownerWindow?.innerHeight || 1, this.ownerWindow?.devicePixelRatio || 1);
    if (Math.abs(device.maxPixelRatio - ratio) < 0.001) return;
    device.maxPixelRatio = ratio;
    this.app.resizeCanvas();
  }
}

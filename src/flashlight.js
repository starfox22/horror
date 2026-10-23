// The flashlight: lies on a shelf of the bedroom's open shoe closet until picked up (E), then is held in the right
// hand (viewmodel) and toggled with F. A shadow-casting spot light with a cookie (hot spot, soft rings, lens smudges)
// scatters in the room haze, so the beam is visible. The hand trails the view slightly and sways with each step.
// The body is built from primitives as a placeholder until a downloaded model can replace it (docs/HANDOFF.md).
import { Color, Entity, Quat, StandardMaterial, Texture, Vec3, PIXELFORMAT_RGBA8, ADDRESS_CLAMP_TO_EDGE } from 'playcanvas';

const SHELF = new Vec3(9.56, 0.848, 1.56);     // bedroom shoe closet, middle shelf, next to the shoes
const HOLD = new Vec3(0.16, -0.19, -0.34);    // hand position relative to the eye

export class Flashlight {
  constructor(app, camera, interactions, sounds, hud) {
    this.app = app;
    this.camera = camera;
    this.sounds = sounds;
    this.hud = hud;
    this.held = false;
    this.on = false;
    this.rot = new Quat();
    this.model = this.build();
    this.model.setPosition(SHELF);
    this.model.setEulerAngles(0, 20, 90);   // lying on its side, roughly along the shelf
    app.root.addChild(this.model);
    this.item = interactions.add({ pos: SHELF.clone(), size: 0.14, label: () => 'E · Take the flashlight', use: () => this.pickUp() });
    this.interactions = interactions;
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat && this.held) this.toggle(); });
    app.on('update', (dt) => this.update(dt));
  }

  build() {
    const mat = (r, g, b, gloss, metal, emissive) => {
      const m = new StandardMaterial();
      m.diffuse = new Color(r, g, b); m.gloss = gloss; m.useMetalness = true; m.metalness = metal;
      if (emissive) { m.emissive = emissive; m.emissiveIntensity = 0; }
      m.update(); return m;
    };
    const body = mat(0.05, 0.05, 0.055, 0.55, 0.8), grip = mat(0.02, 0.02, 0.02, 0.2, 0), chrome = mat(0.8, 0.8, 0.82, 0.9, 1);
    this.lensMat = mat(0.9, 0.92, 0.95, 0.95, 0, new Color(1, 0.95, 0.85));
    const root = new Entity('flashlight');
    // PlayCanvas cylinders/cones stand along +Y; the model points its beam along -Z, so parts are tipped by -90 deg X.
    const part = (type, mat, sx, sy, sz, z) => {
      const e = new Entity(); e.addComponent('render', { type, material: mat, castShadows: true });
      e.setLocalScale(sx, sy, sz); e.setLocalEulerAngles(-90, 0, 0); e.setLocalPosition(0, 0, z); root.addChild(e); return e;
    };
    part('cylinder', body, 0.032, 0.15, 0.032, 0.06);       // barrel
    part('cylinder', grip, 0.034, 0.06, 0.034, 0.07);       // rubber grip
    part('cone', body, 0.05, 0.045, 0.05, -0.035);          // flared head
    part('cylinder', chrome, 0.052, 0.012, 0.052, -0.058);  // bezel
    part('cylinder', this.lensMat, 0.046, 0.004, 0.046, -0.063);
    const button = new Entity(); button.addComponent('render', { type: 'box', material: grip });
    button.setLocalScale(0.01, 0.006, 0.016); button.setLocalPosition(0, 0.017, 0.02); root.addChild(button);

    this.beam = new Entity('flashlight beam');
    this.beam.addComponent('light', {
      type: 'spot', color: new Color(1, 0.95, 0.86), intensity: 0, range: 16, innerConeAngle: 9, outerConeAngle: 30,
      castShadows: true, shadowResolution: 1024, shadowBias: 0.2, normalOffsetBias: 0.03, volumetricScattering: 1.3,
      cookie: this.cookie(), cookieIntensity: 1, enabled: false,
    });
    this.beam.setLocalEulerAngles(90, 0, 0);   // spot lights shine along -Y: turn that to -Z
    this.beam.setLocalPosition(0, 0, -0.07);
    root.addChild(this.beam);
    return root;
  }

  // Beam pattern: bright centre, a dimmer ring, falloff and a few lens smudges, like a cheap LED torch.
  cookie() {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1, r = Math.hypot(x, y);
      let v = 0.55 * Math.exp(-r * r * 9) + 0.32 * Math.exp(-((r - 0.55) ** 2) * 60) + 0.22 * Math.max(0, 1 - r);
      v *= 0.9 + 0.1 * Math.sin(Math.atan2(y, x) * 7 + r * 20);           // reflector facets
      v *= 1 - 0.25 * Math.exp(-((x - 0.2) ** 2 + (y + 0.15) ** 2) * 50);   // smudge
      v = Math.min(1, v * 1.6) * (r < 1 ? 1 : 0);
      const k = (j * N + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v * 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new Texture(this.app.graphicsDevice, { width: N, height: N, format: PIXELFORMAT_RGBA8, mipmaps: false,
      addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, name: 'flashlight-cookie' });
    tex.setSource(c);
    return tex;
  }

  pickUp() {
    this.held = true;
    this.interactions.remove(this.item);
    this.model.reparent(this.app.root);
    this.model.findComponents('render').forEach(r => { r.castShadows = false; });
    this.rot.copy(this.camera.getRotation());
    this.sounds?.pickUp();
    this.hud?.('F · Flashlight on / off');
    this.toggle();
  }

  toggle() {
    this.on = !this.on;
    this.sounds?.flashlightClick(this.on);
    this.beam.light.enabled = this.on;
    this.beam.light.intensity = this.on ? 7 : 0;
    this.lensMat.emissiveIntensity = this.on ? 8 : 0;
    this.lensMat.update();
  }

  // Disable the beam briefly (the room probe must not capture it).
  suspend(off) { if (this.on) this.beam.light.enabled = !off; }

  update(dt) {
    if (!this.held) return;
    // The hand lags the view a little (heavier feel) and keeps up within ~80 ms.
    const target = this.camera.getRotation();
    this.rot.slerp(this.rot, target, 1 - Math.exp(-14 * dt));
    const p = this.camera.getPosition();
    const off = new Vec3();
    this.rot.transformVector(HOLD, off);
    this.model.setPosition(p.x + off.x, p.y + off.y, p.z + off.z);
    this.model.setRotation(this.rot);
    this.model.rotateLocal(1.5, 3, 0);  // tip slightly up and inwards, so the beam meets the centre of view ~3 m ahead
  }
}

// The flashlight: lies on the shelf behind the bedroom wardrobe's left door until picked up (E), then is held in the
// right hand (viewmodel) and toggled with F. A shadow-casting spot light with a cookie (hot spot, soft rings, lens smudges)
// scatters in the room haze, so the beam is visible. The hand trails the view slightly and sways with each step.
import { Color, Entity, Quat, Texture, Vec3, PIXELFORMAT_RGBA8, ADDRESS_CLAMP_TO_EDGE } from 'playcanvas';

const HOLD = new Vec3(0.17, -0.21, -0.38);    // hand position relative to the eye (the lantern hangs from its handle)

export class Flashlight {
  // spot: { x, z, shelf (height of the shelf top), yaw }
  constructor(app, camera, apartment, interactions, sounds, hud, spot) {
    this.app = app;
    this.camera = camera;
    this.sounds = sounds;
    this.hud = hud;
    this.held = false;
    this.on = false;
    this.rot = new Quat();
    this.halfHeight = 0.07;
    this.model = this.build(apartment);
    const rest = new Vec3(spot.x, spot.shelf + this.halfHeight, spot.z);
    this.model.setPosition(rest);
    this.model.setEulerAngles(0, spot.yaw, 0);
    app.root.addChild(this.model);
    this.item = interactions.add({ pos: rest, size: 0.16, label: () => 'E · Take the flashlight', use: () => this.pickUp() });
    this.interactions = interactions;
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat && this.held) this.toggle(); });
    app.on('update', (dt) => this.update(dt));
  }

  // The model is Poly Haven's "Vintage Flashlight" (CC0), merged into the apartment file by the asset pipeline
  // (materials 'Prop_flashlight.*'); its lens faces the model's +Z, turned here so the beam runs along -Z.
  build(apartment) {
    const root = new Entity('flashlight');
    const r = apartment.findComponents('render').find(c => c.meshInstances.some(mi => mi.material.name.startsWith('Prop_flashlight.')));
    if (r) {
      const e = r.entity;
      e.reparent(root);
      e.setLocalPosition(0, 0, 0); e.setLocalEulerAngles(0, 180, 0);
      // Centre the body on the root, so the root is the point it is held by and rests on.
      const box = r.meshInstances[0].aabb.clone();
      for (const mi of r.meshInstances.slice(1)) box.add(mi.aabb);
      e.setLocalPosition(-box.center.x, -box.center.y, -box.center.z);
      this.halfHeight = box.halfExtents.y;
      this.lensMat = r.meshInstances.map(mi => mi.material).find(m => /glass/i.test(m.name));
    }
    if (this.lensMat) { this.lensMat.emissive = new Color(1, 0.93, 0.8); this.lensMat.emissiveIntensity = 0; this.lensMat.update(); }

    this.beam = new Entity('flashlight beam');
    this.beam.addComponent('light', {
      type: 'spot', color: new Color(1, 0.93, 0.82), intensity: 0, range: 16, innerConeAngle: 9, outerConeAngle: 30,
      castShadows: true, shadowResolution: 1024, shadowBias: 0.2, normalOffsetBias: 0.03, volumetricScattering: 1.3,
      cookie: this.cookie(), cookieIntensity: 1, enabled: false,
    });
    this.beam.setLocalEulerAngles(90, 0, 0);   // spot lights shine along -Y: turn that to -Z
    this.beam.setLocalPosition(0, 0.035, -0.17);   // just in front of the lens
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
    this.model.findComponents('render').forEach(r => { r.castShadows = false; });   // its own beam must not hit it
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
    if (this.lensMat) { this.lensMat.emissiveIntensity = this.on ? 6 : 0; this.lensMat.update(); }
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

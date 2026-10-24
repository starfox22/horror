// The first-person right arm (public/assets/props/drinking-arm.glb, Microsoft Rocketbox, MIT) posed in the player's
// camera space: a two-bone IK from a shoulder just behind and below the eye to the wrist, the hand turned exactly as the
// caller asks (it holds the glass), and the fingers blended between the asset's fitted poses (drinking-arm.json).
// The rig's rest pose is a straight arm along +Y with identity joint rotations, wrist at the origin, palm -Z, thumb -X.
import { Mat4, Quat, Vec3 } from 'playcanvas';

const Y = new Vec3(0, 1, 0);
const _m = new Mat4(), _qa = new Quat(), _qb = new Quat(), _x = new Vec3(), _y = new Vec3(), _z = new Vec3();

// Rotation taking the rest frame (restA, restB) onto (a, b): a exactly, b as close as a frame allows (a and restA are
// the primary axes; the secondaries are made perpendicular to them).
export function frameRotation(restA, restB, a, b, out = new Quat()) {
  const quatOf = (p, s, q) => {
    _y.copy(p).normalize();
    _x.copy(s).sub(_z.copy(_y).mulScalar(s.dot(_y))).normalize();
    _z.cross(_x, _y);
    _m.set([_x.x, _x.y, _x.z, 0, _y.x, _y.y, _y.z, 0, _z.x, _z.y, _z.z, 0, 0, 0, 0, 1]);
    return q.setFromMat4(_m);
  };
  quatOf(restA, restB, _qa); quatOf(a, b, _qb);
  return out.mul2(_qb, _qa.invert());
}

// Two-bone IK: the elbow for shoulder s, wrist w, bone lengths l1, l2, bending towards `pole`. The wrist must be within
// reach (callers move the shoulder when it is not, see ArmRig.pose).
export function solveElbow(s, w, l1, l2, pole, out = new Vec3()) {
  const dir = new Vec3().sub2(w, s);
  const d = Math.min(l1 + l2 - 1e-5, Math.max(Math.abs(l1 - l2) + 1e-5, dir.length()));
  dir.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = new Vec3().copy(pole).sub(new Vec3().copy(dir).mulScalar(pole.dot(dir)));
  if (p.lengthSq() < 1e-10) p.set(1, 0, 0).sub(new Vec3().copy(dir).mulScalar(dir.x));
  p.normalize();
  return out.copy(s).add(dir.mulScalar(a)).add(p.mulScalar(h));
}

export class ArmRig {
  // root: the instantiated arm (its joints are found by name); data: drinking-arm.json.
  constructor(root, data) {
    this.root = root;
    this.data = data;
    const bone = name => { const node = root.findByName(name); if (!node) throw new Error(`Drinking arm: joint ${name} missing`); return node; };
    this.upper = bone('upperarm_r'); this.fore = bone('forearm_r'); this.hand = bone('hand_r');
    this.l1 = data.boneLengths.upperArm; this.l2 = data.boneLengths.forearm;
    this.bend = new Vec3(...data.elbowBendAxis).normalize();
    this.fingers = Object.keys(data.poses.grip).map(name => ({
      node: bone(name),
      rest: new Quat(...data.poses.rest[name]), relaxed: new Quat(...data.poses.relaxed[name]), grip: new Quat(...data.poses.grip[name]),
      open: new Quat().slerp(new Quat(...data.poses.relaxed[name]), new Quat(...data.poses.rest[name]), 0.75), q: new Quat(),
    }));
    this.elbow = new Vec3(); this.shoulder = new Vec3();
    this.qUpper = new Quat(); this.qFore = new Quat(); this.local = new Quat(); this.inverse = new Quat();
    this._u = new Vec3(); this._f = new Vec3(); this._n = new Vec3(); this._r = new Vec3(); this._d = new Vec3();
  }

  get reach() { return this.l1 + this.l2; }

  // shoulder, wrist: Vec3 in the arm's parent space (the camera); handRotation: Quat, the hand's rotation there.
  // fingers: { open, grip } weights (0..1): relaxed -> open -> gripping. pole: where the elbow points.
  pose(shoulder, wrist, handRotation, { open = 0, grip = 0 } = {}, pole = ArmRig.POLE) {
    // Out of reach: the shoulder follows (it is behind the eye, never seen), as a body leans after its hand.
    const s = this.shoulder.copy(shoulder), toWrist = this._d.sub2(wrist, s), far = toWrist.length() - (this.reach - 0.004);
    if (far > 0) s.add(toWrist.normalize().mulScalar(far));
    const e = solveElbow(s, wrist, this.l1, this.l2, pole, this.elbow);
    const u = this._u.sub2(e, s).normalize(), f = this._f.sub2(wrist, e).normalize();
    // The elbow hinge: the axis that turns the upper arm's direction into the forearm's.
    const n = this._n.cross(u, f);
    if (n.lengthSq() < 1e-8) n.cross(pole, u);
    n.normalize();
    frameRotation(Y, this.bend, u, n, this.qUpper);
    // The forearm turns with the hand (pronation along the sleeve) so the wrist only bends, never twists.
    const r = handRotation.transformVector(this.bend, this._r);
    frameRotation(Y, this.bend, f, r, this.qFore);
    this.upper.setLocalPosition(s); this.upper.setLocalRotation(this.qUpper);
    this.inverse.copy(this.qUpper).invert(); this.fore.setLocalRotation(this.local.mul2(this.inverse, this.qFore));
    this.inverse.copy(this.qFore).invert(); this.hand.setLocalRotation(this.local.mul2(this.inverse, handRotation));
    const g = Math.min(1, Math.max(0, grip)), o = Math.min(1, Math.max(0, open)) * (1 - g);
    for (const finger of this.fingers) {
      finger.q.slerp(finger.relaxed, finger.open, o);
      if (g > 0) finger.q.slerp(finger.q, finger.grip, g);
      finger.node.setLocalRotation(finger.q);
    }
  }
}
// How the hand holds the glass, in the glass's own frame (origin at the middle of its base, +Y up): the hand's rotation
// and the wrist's position there. The asset's grip (drinking-arm.json `grip.cylinder`: the glass axis and a point on it in
// the hand frame) is centred on a glass of `height`; `side` is where the palm is, seen from the glass's axis.
export function gripInGlass(data, height, side = GRIP_SIDE) {
  const { centre, axis } = data.grip.cylinder, palm = data.wristToPalm;
  const a = new Vec3(...axis).normalize(), c = new Vec3(...centre);
  const toPalm = new Vec3(palm[0] - c.x, palm[1] - c.y, palm[2] - c.z);
  const rotation = frameRotation(a, toPalm, Y, side);
  // The glass's base centre in the hand frame, then the wrist (the hand frame's origin) in the glass frame.
  const base = c.clone().sub(a.clone().mulScalar(height / 2));
  const position = rotation.transformVector(base).mulScalar(-1);
  return { rotation, position };
}
// The palm on the right of the glass and a little towards the eye, as a right hand holds a glass in front of the face.
export const GRIP_SIDE = new Vec3(0.85, 0, 0.5).normalize();

// Down, out to the right and a little back: where a right elbow goes when the hand comes up in front of the face.
ArmRig.POLE = new Vec3(0.55, -0.8, 0.25).normalize();

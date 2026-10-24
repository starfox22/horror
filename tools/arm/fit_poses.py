#!/usr/bin/env python3
"""Fit the drinking arm's finger poses and write arm-data.json.

    python3 -I fit_poses.py BUILD_DIR      (reads BUILD_DIR/drinking-arm.glb, build-facts.json, textures/)

Everything is measured on the GLB as shipped (its vertices, weights and joints), in the hand frame:
origin the wrist joint, +Y toward the fingers, +X toward the little finger (thumb -X), +Z the back of
the hand, metres. Rest local rotations are identity, so a pose is a set of local rotations that the
game can slerp from identity.

relaxed  each finger flexed a little at every joint (a cascade, little finger most), the thumb eased
         toward the palm.
grip     a 72 mm glass held upright in the palm: the cylinder is laid against the palm (touching it),
         its axis across the palm (tilted so it runs from the heel of the hand on the little-finger
         side toward the index knuckle), then every finger closes joint by joint (knuckle, middle,
         end) until that segment touches the glass; the thumb searches its base rotation for the
         widest opposing wrap that still touches without entering the glass, then closes its two
         outer joints the same way. The result is checked on every skinned vertex.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import armlib  # noqa: E402

FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky']
R_GLASS = 0.036
H_GLASS = 0.120
CONTACT = 0.0004      # a segment "touches" when its deepest vertex is within 0.4 mm of the surface
TOL_IN = 0.0010       # allowed penetration while closing (skin squashes a little)


def chain(name):
    return ['%s_%02d_r' % (name, k) for k in (1, 2, 3)]


class Fit:
    def __init__(self, build):
        self.arm = armlib.SkinnedArm(os.path.join(build, 'drinking-arm.glb'))
        self.facts = json.load(open(os.path.join(build, 'build-facts.json')))
        a = self.arm
        self.G0 = a.globals()
        self.J = self.G0[:, :3, 3]
        rm = np.asarray(Image.open(os.path.join(build, 'textures', 'arm_metalrough.jpg')).convert('RGB'), np.float64) / 255
        H, W = rm.shape[:2]
        x = np.clip((a.UV[:, 0] * W).astype(int), 0, W - 1)
        y = np.clip((a.UV[:, 1] * H).astype(int), 0, H - 1)
        self.vrough = rm[y, x, 1]
        self.tips, self.nails, self.axes = {}, {}, {}
        for f in FINGERS:
            js = [a.index[n] for n in chain(f)]
            last = js[2]
            d3 = armlib.unit(self.J[last] - self.J[js[1]])
            m = a.dense[:, last] > 0.5
            proj = (a.P[m] - self.J[last]) @ d3
            tip = self.J[last] + d3 * proj.max()
            self.tips[f] = tip
        # Joint axes from the source rig (3ds Max Biped finger bones: x along the bone, z the bend axis,
        # y toward the pad): positive rotation about z curls a segment toward its pad side.
        src = self.facts['source_axes']
        for f in FINGERS:
            for j in chain(f):
                self.axes[j] = armlib.unit(src[j][2])
            self.nails[f] = armlib.unit(-np.array(src[chain(f)[2]][1]))
        self.src = {n: np.array(v) for n, v in src.items()}

    # ------------------------------------------------------------------------------------------
    def skin(self, pose, subset=None):
        return self.arm.skin(pose, subset)[0]

    def cyl_dist(self, p, cyl):
        """Signed distance outside the side of the cylinder (negative = inside), and axial coordinate."""
        c, ax = cyl['centre'], cyl['axis']
        rel = p - c
        s = rel @ ax
        radial = np.linalg.norm(rel - np.outer(s, ax), axis=1)
        return radial - R_GLASS, s

    def pen(self, p, cyl):
        d, s = self.cyl_dist(p, cyl)
        inside = np.abs(s) <= H_GLASS / 2
        return -d[inside].min() if inside.any() else -1.0, d, s

    # ------------------------------------------------------------------------------------------
    def place_cylinder(self, y_c, tilt_deg):
        """Glass axis across the palm, tilted; slid toward the palm until it touches the palm."""
        a = self.arm
        g = np.radians(tilt_deg)
        ax = armlib.unit([-np.cos(g), np.sin(g), 0.0])     # glass 'up': toward the thumb/index side
        palm = (a.dense[:, a.index['hand_r']] > 0.6) & (a.P[:, 2] < 0)
        P = a.P[palm]
        lo, hi = -0.10, 0.0
        for _ in range(60):
            z = (lo + hi) / 2
            cyl = {'centre': np.array([0.0, y_c, z]), 'axis': ax}
            d, s = self.cyl_dist(P, cyl)
            if d.min() < -TOL_IN:   # too close: move away (more negative z)
                hi = z
            else:
                lo = z
        return {'centre': np.array([0.0, y_c, lo]), 'axis': ax}

    def close_joint(self, pose, joint, cyl, lo, hi, verts):
        """Largest flexion in [lo, hi] (deg) before the segment's vertices touch the glass."""
        axis = self.axes[joint]

        def pen_at(deg):
            p = dict(pose)
            p[joint] = armlib.quat_from_matrix(armlib.axis_angle(axis, np.radians(deg)))
            pp = self.skin(p, verts)
            return self.pen(pp, cyl)[0]

        if pen_at(lo) > TOL_IN:
            return lo, pen_at(lo)
        step = 1.0
        prev = lo
        deg = lo
        while deg < hi:
            deg = min(hi, deg + step)
            if pen_at(deg) > -CONTACT:
                a_, b_ = prev, deg
                for _ in range(20):
                    m = (a_ + b_) / 2
                    if pen_at(m) > -CONTACT:
                        b_ = m
                    else:
                        a_ = m
                return a_, pen_at(a_)
            prev = deg
        return hi, pen_at(hi)

    def seg_verts(self, joint, w=0.45):
        return np.where(self.arm.dense[:, self.arm.index[joint]] > w)[0]

    def chain_verts(self, joints, w=0.45):
        return np.where(self.arm.dense[:, [self.arm.index[j] for j in joints]].sum(1) > w)[0]

    def wrap_chain(self, pose, joints, cyl, limits):
        """Wrap a chain round the glass like a hinge chain: joint k closes (from its most open limit) until
        segment k itself touches; the segments beyond it are ignored at that step and closed next, so each
        segment lies against the glass in turn (the knuckle segment, then the middle, then the end)."""
        out = {}
        for k, j in enumerate(joints):
            for kk in range(k + 1, len(joints)):
                pose[joints[kk]] = np.array([0.0, 0.0, 0.0, 1.0])
            deg, pn = self.close_joint(pose, j, cyl, limits[k][0], limits[k][1], self.seg_verts(j))
            pose[j] = armlib.quat_from_matrix(armlib.axis_angle(self.axes[j], np.radians(deg)))
            out[j] = (deg, pn)
        return out

    def finger_grip(self, pose, f, cyl, limits=((-20, 95), (-30, 110), (-40, 85))):
        return self.wrap_chain(pose, chain(f), cyl, limits)

    def thumb_base(self, a, b, c):
        """Thumb base (CMC) rotation about the source bone's own axes (deg): a = roll about the bone (x),
        b = swing about y (away from / toward the palm plane), c = flexion about z (across the palm)."""
        x, y, z = self.src['thumb_01_r']
        R = armlib.axis_angle(z, np.radians(c)) @ armlib.axis_angle(y, np.radians(b)) @ armlib.axis_angle(x, np.radians(a))
        return armlib.quat_from_matrix(R)

    def cyl_angle(self, p, cyl, e1, e2):
        rel = p - cyl['centre']
        rel = rel - np.outer(rel @ cyl['axis'], cyl['axis'])
        return np.degrees(np.arctan2(rel @ e2, rel @ e1))


def contact_report(fit, pose, cyl):
    a = fit.arm
    p = fit.skin(pose)
    d, s = fit.cyl_dist(p, cyl)
    inside = np.abs(s) <= H_GLASS / 2
    rep = {'maxPenetrationMm': round(float(max(0.0, -d[inside].min())) * 1000, 2)}
    tips = {}
    for f in FINGERS:
        j = a.index[chain(f)[2]]
        m = a.dense[:, j] > 0.5
        tips[f] = round(float(d[m].min()) * 1000, 2)
    rep['endSegmentGapMm'] = tips
    return rep, p


def main():
    build = sys.argv[1]
    fit = Fit(build)
    a = fit.arm
    J = fit.J
    names = a.names
    # ------------------------------------------------------------------ relaxed
    relaxed = {}
    cascade = {'index': (10, 16, 8), 'middle': (14, 20, 10), 'ring': (18, 24, 12), 'pinky': (22, 28, 14)}
    for f, angs in cascade.items():
        for j, deg in zip(chain(f), angs):
            relaxed[j] = armlib.quat_from_matrix(armlib.axis_angle(fit.axes[j], np.radians(deg)))
    relaxed['thumb_01_r'] = fit.thumb_base(0, 0, 8)
    relaxed['thumb_02_r'] = armlib.quat_from_matrix(armlib.axis_angle(fit.axes['thumb_02_r'], np.radians(8)))
    relaxed['thumb_03_r'] = armlib.quat_from_matrix(armlib.axis_angle(fit.axes['thumb_03_r'], np.radians(10)))

    # ------------------------------------------------------------------ grip
    import grip_search as gs
    fingers4 = ('index', 'middle', 'ring', 'pinky')
    chains = {f: gs.Chain(fit, chain(f)) for f in FINGERS}

    def q_of(j, deg):
        return armlib.quat_from_matrix(armlib.axis_angle(fit.axes[j], np.radians(deg)))

    best = None

    def tip_wrap(cyl, res):
        # How far round the glass the fingertips reach, from the back of the hand's side (deg, mean of 4).
        e1 = armlib.unit(np.array([0, 0, 1.0]) - cyl['axis'] * cyl['axis'][2])
        e2 = np.cross(cyl['axis'], e1)
        p = {}
        for f in fingers4:
            for j, deg in zip(chain(f), res[f][1]):
                p[j] = armlib.quat_from_matrix(armlib.axis_angle(fit.axes[j], np.radians(deg)))
        G = a.globals(p)
        out = []
        for f in fingers4:
            g3 = G[a.index[chain(f)[2]]]
            tip = g3[:3, :3] @ (fit.tips[f] - J[a.index[chain(f)[2]]]) + g3[:3, 3]
            rel = tip - cyl['centre']
            out.append(np.degrees(np.arctan2(rel @ e2, rel @ e1)))
        out = np.array(out)
        return float(np.mean(np.abs(out)))

    for y_c in (0.074, 0.080, 0.086, 0.092):
        for tilt in (5.0, 12.0, 19.0):
            cyl = fit.place_cylinder(y_c, tilt)
            res = {f: gs.fit_finger(chains[f], cyl, R_GLASS, 1.0, TOL_IN) for f in fingers4}
            cost = sum(r[0] for r in res.values())
            wrap = tip_wrap(cyl, res)
            print('cylinder y %.3f tilt %4.1f: cost %7.2f, tips round the glass %5.0f deg, %s' % (y_c, tilt, cost, wrap, '  '.join(
                '%s %s' % (f[:2], '/'.join('%.0f' % v for v in res[f][1])) for f in fingers4)))
            key = cost - wrap / 20.0
            if best is None or key < best[0]:
                best = (key, y_c, tilt, cyl, res)
    _, y_c, tilt, cyl, res = best
    print('chosen: y %.3f tilt %.1f' % (y_c, tilt))
    pose = {}
    report = {}
    for f in fingers4:
        for j, deg, g in zip(chain(f), res[f][1], res[f][2]):
            pose[j] = q_of(j, deg)
            report[j] = (deg, g)
            print('   %-11s %6.1f deg   segment gap %.2f mm' % (j, deg, g * 1000))
    # Thumb: search its base rotation; for each, every MCP/IP pair at once.
    e1 = armlib.unit(np.array([0, 0, 1.0]) - cyl['axis'] * cyl['axis'][2])   # from the axis toward the back of the hand
    e2 = np.cross(cyl['axis'], e1)
    idx_v = np.where(a.dense[:, [a.index[n] for n in chain('index')]].sum(1) > 0.5)[0]
    idx_p = fit.skin(pose, idx_v)
    _, idx_s = fit.cyl_dist(idx_p, cyl)
    idx_height = float(np.median(idx_s))
    fing_sign = np.sign(np.median(fit.cyl_angle(fit.skin(pose, fit.seg_verts('index_03_r', 0.5)), cyl, e1, e2)))
    idx_sub = idx_p[::2]
    th_ch = chains['thumb']
    tip_local = fit.tips['thumb']

    def thumb_eval(ta, tb, tc, g2, g3):
        R1 = armlib.matrix_from_quat(fit.thumb_base(ta, tb, tc))
        P, RR3, pos3 = th_ch.positions(R1, gs.rodrigues(th_ch.axes[1], g2), gs.rodrigues(th_ch.axes[2], g3))
        d, inside = gs.cyl_eval(P, cyl, R_GLASS, 1.0)
        pen = np.where(inside, -d, -np.inf).max(-1)
        gp2 = np.where(th_ch.seg[1], d, np.inf).min(-1)
        gp3 = np.where(th_ch.seg[2], d, np.inf).min(-1)
        tipP = th_ch.point3(RR3, pos3, tip_local)
        rel = tipP - cyl['centre']
        ang = np.degrees(np.arctan2(rel @ e2, rel @ e1))
        wrap = -fing_sign * ang
        height = rel @ cyl['axis'] - idx_height
        clear = np.linalg.norm(tipP[:, :, None, :] - idx_sub[None, None], axis=-1).min(-1)
        T2, T3 = np.meshgrid(g2, g3, indexing='ij')
        cost = (np.clip(gp3, 0, 0.02) / 0.001) ** 2 + 0.3 * (np.clip(gp2, 0, 0.02) / 0.001) ** 2 \
            - np.clip(wrap, -180, 100) / 30.0 + ((height - 0.008) / 0.012) ** 2 \
            + np.where(clear < 0.008, (0.008 - clear) * 2000, 0) + 0.0004 * (ta * ta + tb * tb + tc * tc) \
            + 0.0004 * (T2 ** 2 + T3 ** 2) + np.where(pen > TOL_IN, 1e9, 0)
        i = np.unravel_index(np.argmin(cost), cost.shape)
        return float(cost[i]), dict(base=(ta, tb, tc), mcp=float(g2[i[0]]), ip=float(g3[i[1]]), gap2=float(gp2[i]),
                                    gap3=float(gp3[i]), wrap=float(wrap[i]), height=float(height[i]), clear=float(clear[i]),
                                    pen=float(pen[i]))

    g2c, g3c = np.arange(-20, 71, 6.0), np.arange(-30, 86, 6.0)
    cands = []
    for ta in range(-40, 41, 10):
        for tb in range(-70, 41, 10):
            for tc in range(-70, 41, 10):
                cands.append(thumb_eval(float(ta), float(tb), float(tc), g2c, g3c))
    cands.sort(key=lambda r: r[0])
    c0 = cands[0][1]
    print('thumb coarse: cost %.2f %s' % (cands[0][0], {k: (round(v, 4) if isinstance(v, float) else v) for k, v in c0.items()}))
    fine = []
    g2f = np.arange(max(-20, c0['mcp'] - 8), min(70, c0['mcp'] + 8) + 0.1, 2.0)
    g3f = np.arange(max(-30, c0['ip'] - 8), min(85, c0['ip'] + 8) + 0.1, 2.0)
    for ta in np.arange(c0['base'][0] - 8, c0['base'][0] + 8.1, 4):
        for tb in np.arange(c0['base'][1] - 8, c0['base'][1] + 8.1, 4):
            for tc in np.arange(c0['base'][2] - 8, c0['base'][2] + 8.1, 4):
                fine.append(thumb_eval(float(ta), float(tb), float(tc), g2f, g3f))
    fine.sort(key=lambda r: r[0])
    th = fine[0][1]
    print('thumb: base (roll, swing, flex) %s, MCP %.0f, IP %.0f, wrap %.0f deg, gaps %.1f/%.1f mm, height vs index %.1f mm, '
          'clearance to index %.1f mm, penetration %.2f mm' % (
              tuple(round(v, 1) for v in th['base']), th['mcp'], th['ip'], th['wrap'], th['gap2'] * 1000, th['gap3'] * 1000,
              th['height'] * 1000, th['clear'] * 1000, th['pen'] * 1000))
    grip = dict(pose)
    grip['thumb_01_r'] = fit.thumb_base(*th['base'])
    grip['thumb_02_r'] = q_of('thumb_02_r', th['mcp'])
    grip['thumb_03_r'] = q_of('thumb_03_r', th['ip'])
    th['joints'] = {'thumb_02_r': th['mcp'], 'thumb_03_r': th['ip']}
    # Glass height: put the rim 25 mm above the index finger's band.
    centre = cyl['centre'] + cyl['axis'] * (idx_height + 0.025 - H_GLASS / 2)
    cylF = {'centre': centre, 'axis': cyl['axis']}
    rep, gp = contact_report(fit, grip, cylF)
    print('grip check (every vertex, finite 72 x 120 mm glass): max penetration %.2f mm, end-segment gaps %s' % (
        rep['maxPenetrationMm'], rep['endSegmentGapMm']))

    # ------------------------------------------------------------------ points
    def raycast(o, d, P, T):
        v0, v1, v2 = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
        e1_, e2_ = v1 - v0, v2 - v0
        pv = np.cross(d, e2_)
        det = (e1_ * pv).sum(1)
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1.0 / np.where(ok, det, 1), 0)
        tv = o - v0
        u = (tv * pv).sum(1) * inv
        qv = np.cross(tv, e1_)
        v = (qv * d).sum(1) * inv
        t = (e2_ * qv).sum(1) * inv
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
        if not hit.any():
            return None
        i = np.where(hit)[0][np.argmin(t[hit])]
        n = armlib.unit(np.cross(e1_[i], e2_[i]))
        return o + d * t[i], n

    mcp_mid = (J[a.index['index_01_r']] + J[a.index['pinky_01_r']]) / 2
    o = np.array([mcp_mid[0] * 0.5, 0.55 * J[a.index['middle_01_r']][1], 0.0])
    palm_pt, palm_n = raycast(o, np.array([0, 0, -1.0]), a.P, a.I)
    shoulder, elbow = J[a.index['upperarm_r']], J[a.index['forearm_r']]
    elbow_axis = np.array(fit.facts['elbow_axis'])
    # Check: flexing the forearm about elbowBendAxis by the source's own bend reproduces its bend side.
    fl = {'forearm_r': armlib.quat_from_matrix(armlib.axis_angle(elbow_axis, np.radians(30)))}
    wrist_flexed = a.globals(fl)[a.index['hand_r']][:3, 3]
    flex_dir = armlib.unit(wrist_flexed - J[a.index['hand_r']])
    r6 = lambda v: [round(float(x), 6) for x in v]  # noqa: E731
    r5 = lambda v: [round(float(x), 5) for x in v]  # noqa: E731
    joints = []
    for i, n in enumerate(names):
        node = a.gltf['nodes'][a.joint_nodes[i]]
        joints.append({'name': n, 'parent': names[a.parent[i]] if a.parent[i] >= 0 else None,
                       'biped': node.get('extras', {}).get('biped'),
                       'restLocal': {'translation': r6(a.t_local[i]), 'rotation': [0.0, 0.0, 0.0, 1.0]},
                       'restPosition': r6(J[i])})
    lengths = {'upperArm': round(float(np.linalg.norm(elbow - shoulder)), 5),
               'forearm': round(float(np.linalg.norm(J[a.index['hand_r']] - elbow)), 5),
               'hand': round(float(np.linalg.norm(J[a.index['middle_01_r']])), 5),
               'upperArmKept': round(float(np.linalg.norm(elbow - shoulder) - fit.facts['cut_cm'] / 100), 5)}
    for f in FINGERS:
        js = [a.index[n] for n in chain(f)]
        pts = [J[j] for j in js] + [fit.tips[f]]
        lengths[f] = [round(float(np.linalg.norm(pts[k + 1] - pts[k])), 5) for k in range(3)]
    quat = lambda q: r6(q)  # noqa: E731
    finger_joints = [n for f in FINGERS for n in chain(f)]
    out = {
        'asset': 'drinking-arm.glb',
        'source': 'Microsoft Rocketbox %s (MIT), https://github.com/microsoft/Microsoft-Rocketbox' % fit.facts['avatar'],
        'units': 'metres',
        'frame': {
            'origin': 'wrist joint (hand_r)',
            '+Y': 'wrist -> middle-finger knuckle (fingers point +Y); forearm and upper arm extend along -Y',
            '+X': 'toward the little finger (the thumb is on -X): a RIGHT hand',
            '+Z': 'back of the hand (the palm faces -Z)',
            'restRotations': 'every joint has an identity rest rotation, so local axes = these axes at rest; '
                             'poses are local rotations [x, y, z, w] relative to the parent, slerp from identity',
        },
        'joints': joints,
        'points': {
            'shoulder': r5(shoulder), 'elbow': r5(elbow), 'wrist': [0.0, 0.0, 0.0],
            'palmCentre': r5(palm_pt), 'palmNormal': r5(palm_n),
            'fingertips': {f: r5(fit.tips[f]) for f in FINGERS},
            'knuckles': {f: r5(J[a.index[chain(f)[0]]]) for f in FINGERS},
            'cutEnd': r5([0.0, shoulder[1] + fit.facts['cut_cm'] / 100, 0.0]),
        },
        'wristToPalm': r5(palm_pt),
        'boneLengths': lengths,
        'elbowBendAxis': r6(elbow_axis),
        'elbowBendNote': 'rotate forearm_r about elbowBendAxis (in its parent frame; at rest = the hand frame) by a '
                         'POSITIVE angle to flex the elbow; the wrist then moves toward %s at first. The axis is '
                         'the source avatar\'s own bind-pose elbow bend (%.1f deg), carried into the straight pose.' % (
                             r5(flex_dir), fit.facts['bind_elbow_deg']),
        'elbowFlexDirection': r5(flex_dir),
        'fingerFlexAxes': {n: r6(fit.axes[n]) for n in finger_joints},
        'jointAxes': {n: {'x': r6(fit.src[n][0]), 'y': r6(fit.src[n][1]), 'z': r6(fit.src[n][2])} for n in names},
        'jointAxesNote': 'the source 3ds Max Biped bind-pose bone axes, in the hand frame: x along the bone, y toward '
                         'the palm/pad side, z the bend axis (positive rotation about z flexes). Rest rotations in the '
                         'GLB are identity, so these are plain vectors to rotate about (in the parent frame).',
        'fingerFlexNote': 'positive rotation about these axes curls a segment toward the palm (fingers) / across '
                          'the palm (thumb outer joints); the thumb base (thumb_01_r) takes a general rotation',
        'nailDirections': {f: r5(fit.nails[f]) for f in FINGERS},
        'poses': {
            'rest': {n: [0.0, 0.0, 0.0, 1.0] for n in finger_joints},
            'relaxed': {n: quat(relaxed.get(n, [0, 0, 0, 1])) for n in finger_joints},
            'grip': {n: quat(grip.get(n, [0, 0, 0, 1])) for n in finger_joints},
        },
        'grip': {
            'cylinder': {'centre': r5(centre), 'axis': r6(cyl['axis']), 'radius': R_GLASS, 'outerDiameter': 2 * R_GLASS,
                         'height': H_GLASS,
                         'note': 'hand frame, hand_r at rest (only finger joints are posed by the grip). axis = the '
                                 'glass\'s UP direction (toward the thumb/index side); centre = mid-height of the '
                                 '120 mm glass the previews use (rim 25 mm above the index finger). Any point on '
                                 'the axis line is a valid centre for a taller/shorter glass.'},
            'axisPoint': r5(cyl['centre']),
            'placement': {'axisAcrossPalmTiltDeg': tilt, 'axisCrossesYAt': y_c},
            'joints': {k: round(float(v[0]), 2) for k, v in report.items()},
            'thumbBase': {'rollDeg': round(float(th['base'][0]), 1), 'swingDeg': round(float(th['base'][1]), 1),
                          'flexDeg': round(float(th['base'][2]), 1),
                          'note': 'thumb_01_r grip rotation = Rz(flex) * Ry(swing) * Rx(roll) about the source bone axes '
                                  'jointAxes.thumb_01_r (x along the bone, y toward the pad, z bend axis)'},
            'thumbJointsDeg': {k: round(float(v), 1) for k, v in th['joints'].items()},
            'thumbWrapDeg': round(th['wrap'], 1),
            'check': rep,
            'howToUse': 'pose the fingers with poses.grip, then orient hand_r so that grip.cylinder.axis points '
                        'world-up (glass upright) and put the glass centre at grip.cylinder.centre (hand frame); '
                        'or keep the hand where it is and place the glass there.',
        },
    }
    with open(os.path.join(build, 'arm-data.json'), 'w') as fh:
        json.dump(out, fh, indent=1)
    print('palm centre %s normal %s; elbow axis %s flex dir %s' % (r5(palm_pt), r5(palm_n), r6(elbow_axis), r5(flex_dir)))
    print('tips', {f: r5(v) for f, v in fit.tips.items()})
    print('lengths', lengths)
    print('wrote', os.path.join(build, 'arm-data.json'))


if __name__ == '__main__':
    main()

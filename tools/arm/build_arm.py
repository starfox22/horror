#!/usr/bin/env python3
"""Build drinking-arm.glb: the right arm of a Microsoft Rocketbox avatar (MIT) for a first-person view.

    python3 -I build_arm.py SRC_DIR OUT_DIR [--cut 7] [--tess 3] [--ring]

SRC_DIR holds the avatar's Export FBX (Male_Adult_13.fbx) and its body maps
(m010_body_color.tga, m010_body_normal.tga, m010_body_specular.tga), straight from
github.com/microsoft/Microsoft-Rocketbox Assets/Avatars/Adults/Male_Adult_13.

What it does (all numbers are reported on stdout):
  1. cut: keeps the body-material triangles of the right arm whose centre lies more than --cut cm
     down the upper arm from the shoulder joint (and within the arm's radius), largest connected
     piece only (the avatar's finger ring is dropped unless --ring).
  2. skeleton: upper arm, forearm, hand and the 3 joints of each finger (Biped Finger0 = thumb ..
     Finger4 = little finger); every other bone's weight goes to the upper arm (the nearest kept
     bone: clavicle, spine, neck); 4 strongest influences, renormalised.
  3. straightening: the bind pose's elbow (~20 deg) and wrist (~10 deg) bends are taken out by
     linear-blend skinning the mesh to a pose where upper arm and forearm lie on the hand's axis
     (wrist -> middle-finger knuckle); the hand and fingers are not moved.
  4. normalised frame (metres): origin the wrist joint, +Y wrist -> middle knuckle (fingers),
     +X toward the little finger (thumb at -X), +Z the back of the hand (palm faces -Z).
     All joints have identity rest rotations in this frame, so rest local rotations are identity
     and a joint's local axes are the hand frame's axes.
  5. smoothing: PN-triangle tessellation (--tess N splits each triangle into N*N) on the author's
     normals, crack-free across UV seams (positions use one averaged normal per control point);
     UVs and weights interpolate linearly, shading normals quadratically.
  6. textures: the arm's region of the 2048 body atlas at native resolution (crop, UVs remapped),
     gutters filled by push-pull so mips never pull in black; specular -> roughness (skin 0.60 ..
     0.47, nails ~0.35, cloth 0.90 .. 0.84), metal 0. The normal map is green-up already
     (tools: normal_convention.py), so only R/G/B are copied.
"""
import argparse
import hashlib
import io
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import armlib  # noqa: E402
import rbx_fbx  # noqa: E402

COMMIT = '0943055db6ec570bcef9f2c8b41c9e5467c808f9'
REPO = 'https://github.com/microsoft/Microsoft-Rocketbox'
FINGERS = [('thumb', 0), ('index', 1), ('middle', 2), ('ring', 3), ('pinky', 4)]


def joint_table():
    t = [('upperarm_r', 'Bip01 R UpperArm', None), ('forearm_r', 'Bip01 R Forearm', 'upperarm_r'),
         ('hand_r', 'Bip01 R Hand', 'forearm_r')]
    for name, f in FINGERS:
        prev = 'hand_r'
        for k, suf in enumerate(('', '1', '2')):
            n = '%s_%02d_r' % (name, k + 1)
            t.append((n, 'Bip01 R Finger%d%s' % (f, suf), prev))
            prev = n
    return t


class UnionFind:
    def __init__(self, n):
        self.p = np.arange(n)

    def find(self, x):
        p = self.p
        while p[x] != x:
            p[x] = p[p[x]]
            x = p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def components(tris, n):
    uf = UnionFind(n)
    for a, b, c in tris:
        uf.union(a, b)
        uf.union(a, c)
    return np.array([uf.find(t[0]) for t in tris])


# ------------------------------------------------------------------------------------------------
# PN triangles (Vlachos et al. 2001).
def pn_tessellate(P, N, UV, WD, GN, T, n):
    """P, N (shading), UV, WD (dense weights) per vertex; GN geometric normal per vertex (equal for
    vertices sharing a position); T triangles. Returns the refined arrays."""
    if n <= 1:
        return P, N, UV, WD, T
    outP, outN, outUV, outW = list(P), list(N), list(UV), list(WD)
    edge = {}
    tris = []

    def add(p, nn, uv, w):
        outP.append(p)
        outN.append(nn)
        outUV.append(uv)
        outW.append(w)
        return len(outP) - 1

    for a, b, c in T:
        P1, P2, P3 = P[a], P[b], P[c]
        N1, N2, N3 = GN[a], GN[b], GN[c]
        # PN offset along an edge, faded out where the two ends' normals differ a lot (finger crotches,
        # where full PN control points fold the surface). Depends on the edge's ends only: crack-free.
        def w(i, j, Pi, Pj, Ni):
            Nj = (N1, N2, N3)[j - 1]
            fade = 1.0 - smoothstep(0.35, 0.75, 1.0 - float(np.dot((N1, N2, N3)[i - 1], Nj)))
            return np.dot(Pj - Pi, Ni) * fade
        b210 = (2 * P1 + P2 - w(1, 2, P1, P2, N1) * N1) / 3
        b120 = (2 * P2 + P1 - w(2, 1, P2, P1, N2) * N2) / 3
        b021 = (2 * P2 + P3 - w(2, 3, P2, P3, N2) * N2) / 3
        b012 = (2 * P3 + P2 - w(3, 2, P3, P2, N3) * N3) / 3
        b102 = (2 * P3 + P1 - w(3, 1, P3, P1, N3) * N3) / 3
        b201 = (2 * P1 + P3 - w(1, 3, P1, P3, N1) * N1) / 3
        E = (b210 + b120 + b021 + b012 + b102 + b201) / 6
        V = (P1 + P2 + P3) / 3
        b111 = E + (E - V) / 2
        S1, S2, S3 = N[a], N[b], N[c]

        def nmid(Pi, Pj, Ni, Nj):
            d = Pj - Pi
            v = 2 * np.dot(d, Ni + Nj) / max(np.dot(d, d), 1e-20)
            m = Ni + Nj - v * d
            return m / max(np.linalg.norm(m), 1e-12)

        n110, n011, n101 = nmid(P1, P2, S1, S2), nmid(P2, P3, S2, S3), nmid(P3, P1, S3, S1)

        def point(i, j, k):
            u, v, x = i / n, j / n, k / n
            p = (P1 * u ** 3 + P2 * v ** 3 + P3 * x ** 3 + 3 * b210 * u * u * v + 3 * b120 * u * v * v +
                 3 * b201 * u * u * x + 3 * b021 * v * v * x + 3 * b102 * u * x * x + 3 * b012 * v * x * x +
                 6 * b111 * u * v * x)
            nn = S1 * u * u + S2 * v * v + S3 * x * x + n110 * u * v + n011 * v * x + n101 * u * x
            nn = nn / np.linalg.norm(nn)
            uv = UV[a] * u + UV[b] * v + UV[c] * x
            wd = WD[a] * u + WD[b] * v + WD[c] * x
            return p, nn, uv, wd

        grid = {}
        for i in range(n + 1):
            for j in range(n + 1 - i):
                k = n - i - j
                if i == n:
                    idx = a
                elif j == n:
                    idx = b
                elif k == n:
                    idx = c
                else:
                    key = None
                    if k == 0:   # edge a-b, j steps from a
                        key = (a, b, j) if a < b else (b, a, n - j)
                    elif i == 0:  # edge b-c, k steps from b
                        key = (b, c, k) if b < c else (c, b, n - k)
                    elif j == 0:  # edge c-a, i steps from c
                        key = (c, a, i) if c < a else (a, c, n - i)
                    if key is not None and key in edge:
                        idx = edge[key]
                    else:
                        idx = add(*point(i, j, k))
                        if key is not None:
                            edge[key] = idx
                grid[(i, j)] = idx
        for i in range(n):
            for j in range(n - i):
                tris.append((grid[(i + 1, j)], grid[(i, j + 1)], grid[(i, j)]))
                if i + j <= n - 2:
                    tris.append((grid[(i, j + 1)], grid[(i + 1, j)], grid[(i + 1, j + 1)]))
    return np.array(outP), np.array(outN), np.array(outUV), np.array(outW), np.array(tris)


def clip_plane(P, N, UV, WD, GN, T, cls, yc):
    """Keep the part of the mesh with y >= yc, splitting the triangles that cross the plane."""
    inside = P[:, 1] >= yc
    oP, oN, oUV, oW, oG = list(P), list(N), list(UV), list(WD), list(GN)
    cache = {}

    def cut(a, b):
        key = (min(a, b), max(a, b))
        if key not in cache:
            s = (yc - P[a, 1]) / (P[b, 1] - P[a, 1])
            nrm = N[a] + s * (N[b] - N[a])
            g = GN[a] + s * (GN[b] - GN[a])
            oP.append(P[a] + s * (P[b] - P[a]))
            oN.append(nrm / np.linalg.norm(nrm))
            oUV.append(UV[a] + s * (UV[b] - UV[a]))
            oW.append(WD[a] + s * (WD[b] - WD[a]))
            oG.append(g / np.linalg.norm(g))
            cache[key] = len(oP) - 1
        return cache[key]

    outT, outC = [], []
    for t, tri_ in enumerate(T):
        v = [int(x) for x in tri_]
        ins = [bool(inside[x]) for x in v]
        if all(ins):
            outT.append(v)
            outC.append(cls[t])
        elif any(ins):
            if sum(ins) == 1:
                i = ins.index(True)
                v0, v1, v2 = v[i], v[(i + 1) % 3], v[(i + 2) % 3]
                outT.append([v0, cut(v0, v1), cut(v0, v2)])
                outC.append(cls[t])
            else:
                i = ins.index(False)
                v0, v1, v2 = v[i], v[(i + 1) % 3], v[(i + 2) % 3]
                p01, p02 = cut(v0, v1), cut(v0, v2)
                outT += [[p01, v1, v2], [p01, v2, p02]]
                outC += [cls[t], cls[t]]
    return (np.array(oP), np.array(oN), np.array(oUV), np.array(oW), np.array(oG), np.array(outT),
            np.array(outC))


def fold_check(P, T, ref):
    """Sub-triangles whose winding disagrees with their vertex normals (folds of the smoothed surface)."""
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    d = np.einsum('ij,ij->i', fn, ref[T].mean(1))
    bad = d < 0
    return T, np.where(bad)[0]


def tangents(P, N, UV, T):
    """Per-vertex tangents (xyz, w) for glTF, from UVs with v pointing UP in the image (the source's
    convention), i.e. the bitangent cross(N, T) * w points to the top of the normal map (green up)."""
    t = np.zeros_like(P)
    b = np.zeros_like(P)
    p0, p1, p2 = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    u0, u1, u2 = UV[T[:, 0]], UV[T[:, 1]], UV[T[:, 2]]
    e1, e2 = p1 - p0, p2 - p0
    d1, d2 = u1 - u0, u2 - u0
    r = d1[:, 0] * d2[:, 1] - d2[:, 0] * d1[:, 1]
    r = np.where(np.abs(r) < 1e-20, 1e-20, r)
    sdir = (e1 * d2[:, 1:2] - e2 * d1[:, 1:2]) / r[:, None]
    tdir = (e2 * d1[:, 0:1] - e1 * d2[:, 0:1]) / r[:, None]
    for k in range(3):
        np.add.at(t, T[:, k], sdir)
        np.add.at(b, T[:, k], tdir)
    t = t - N * np.einsum('ij,ij->i', N, t)[:, None]
    ln = np.linalg.norm(t, axis=1)
    bad = ln < 1e-12
    if bad.any():  # any vector perpendicular to N
        alt = np.cross(N[bad], np.array([1.0, 0, 0]))
        alt[np.linalg.norm(alt, axis=1) < 1e-6] = np.cross(N[bad][np.linalg.norm(alt, axis=1) < 1e-6], np.array([0, 1.0, 0]))
        t[bad] = alt
        ln = np.linalg.norm(t, axis=1)
    t /= ln[:, None]
    # Handedness from each triangle's own UV orientation against its face normal (a vote per vertex), so a
    # vertex whose shading normal is far off its faces cannot flip the bitangent.
    fn = np.cross(e1, e2)
    tri_w = np.sign(np.einsum('ij,ij->i', np.cross(fn, sdir), tdir))
    vote = np.zeros(len(P))
    area = np.linalg.norm(fn, axis=1)
    for k in range(3):
        np.add.at(vote, T[:, k], tri_w * area)
    w = np.where(vote < 0, -1.0, 1.0)
    return np.concatenate([t, w[:, None]], 1)


# ------------------------------------------------------------------------------------------------
# Texture helpers.
def raster_labels(UVpx, T, labels, w, h):
    """Label per pixel (-1 none) by rasterising triangles given in pixel coordinates (x right, y down)."""
    out = np.full((h, w), -1, np.int16)
    for t, (a, b, c) in enumerate(T):
        xs, ys = UVpx[[a, b, c], 0] - 0.5, UVpx[[a, b, c], 1] - 0.5
        x0, x1 = max(0, int(np.floor(xs.min()))), min(w - 1, int(np.ceil(xs.max())))
        y0, y1 = max(0, int(np.floor(ys.min()))), min(h - 1, int(np.ceil(ys.max())))
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(d) < 1e-12:
            continue
        l0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
        l1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
        l2 = 1 - l0 - l1
        m = (l0 > -0.01) & (l1 > -0.01) & (l2 > -0.01)
        out[gy[m], gx[m]] = labels[t]
    return out


def grow_labels(lab, steps):
    lab = lab.copy()
    for _ in range(steps):
        empty = lab < 0
        if not empty.any():
            break
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            src = np.roll(np.roll(lab, dy, 0), dx, 1)
            take = empty & (src >= 0)
            lab[take] = src[take]
            empty = lab < 0
    return lab


def push_pull(img, mask):
    """Fill pixels outside mask with a smooth extension of the inside (mip pyramid push-pull)."""
    img = img.astype(np.float64)
    m = mask.astype(np.float64)
    levels = [(img * m[..., None], m)]
    while min(levels[-1][1].shape) > 1:
        c, w = levels[-1]
        H, W = w.shape
        H2, W2 = (H + 1) // 2, (W + 1) // 2
        cp = np.zeros((H2 * 2, W2 * 2, c.shape[2]))
        wp = np.zeros((H2 * 2, W2 * 2))
        cp[:H, :W] = c
        wp[:H, :W] = w
        cs = cp.reshape(H2, 2, W2, 2, -1).sum((1, 3))
        ws = wp.reshape(H2, 2, W2, 2).sum((1, 3))
        levels.append((cs, ws))
    # Normalised colours per level; pull down filling holes.
    filled = None
    for c, w in reversed(levels):
        col = c / np.maximum(w, 1e-12)[..., None]
        if filled is not None:
            up = np.repeat(np.repeat(filled, 2, 0), 2, 1)[:w.shape[0], :w.shape[1]]
            a = np.clip(w, 0, 1)[..., None]
            col = col * a + up * (1 - a)
        filled = col
    out = np.where(mask[..., None], img, filled)
    return out


def gauss_blur(img, sigma):
    img = np.asarray(img, np.float64)
    k = max(1, int(np.ceil(sigma * 3)))
    ker = np.exp(-0.5 * (np.arange(-k, k + 1) / sigma) ** 2)
    ker /= ker.sum()
    out = img
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (k, k)
        o = np.pad(out, pad, mode='edge')
        acc = np.zeros_like(out)
        for i, w in enumerate(ker):
            sl = [slice(None)] * out.ndim
            sl[axis] = slice(i, i + out.shape[axis])
            acc += w * o[tuple(sl)]
        out = acc
    return out


def bilinear(img, x, y):
    H, W = img.shape[:2]
    x = np.clip(x - 0.5, 0, W - 1.001)
    y = np.clip(y - 0.5, 0, H - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    if img.ndim == 3:
        fx, fy = fx[:, None], fy[:, None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) +
            img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def seam_samples(P, UVpx, T, keep):
    """Pairs of texel positions that show the same surface point on the two sides of a UV seam
    (edges shared in 3D by triangles with different UV corners), for triangles where keep is set."""
    pkey = {}
    pid = np.array([pkey.setdefault(tuple(np.round(p * 1e5).astype(int)), len(pkey)) for p in P])
    edges = {}
    for t in np.where(keep)[0]:
        for k in range(3):
            a, b = T[t][k], T[t][(k + 1) % 3]
            key = (min(pid[a], pid[b]), max(pid[a], pid[b]))
            ends = (a, b) if pid[a] <= pid[b] else (b, a)
            edges.setdefault(key, []).append(ends)
    A, B = [], []
    s = np.linspace(0, 1, 9)[:, None]
    for key, lst in edges.items():
        if len(lst) != 2:
            continue
        (a0, a1), (b0, b1) = lst
        if a0 == b0 and a1 == b1:
            continue  # not a seam
        if np.allclose(UVpx[a0], UVpx[b0]) and np.allclose(UVpx[a1], UVpx[b1]):
            continue
        A.append(UVpx[a0] * (1 - s) + UVpx[a1] * s)
        B.append(UVpx[b0] * (1 - s) + UVpx[b1] * s)
    if not A:
        return np.zeros((0, 2)), np.zeros((0, 2))
    return np.concatenate(A), np.concatenate(B)


def level_seams(img, A, B, mask, sigma=2.5, spread=10.0, reach=28.0):
    """Seam levelling: at each pair of texels (A[i], B[i]) showing the same surface point, both sides
    move to their mean (local average, sigma texels); the corrections spread smoothly into the island
    (normalised convolution, spread texels) and fade out reach texels away from the seam."""
    if len(A) == 0:
        return img
    two_d = img.ndim == 2
    im = img[..., None] if two_d else img
    mk = mask.astype(np.float64)[..., None]
    sm = gauss_blur(im * mk, sigma) / np.maximum(gauss_blur(mk, sigma), 1e-6)  # island texels only
    ca, cb = bilinear(sm, A[:, 0], A[:, 1]), bilinear(sm, B[:, 0], B[:, 1])
    m = (ca + cb) / 2
    pts = np.concatenate([A, B])
    d = np.concatenate([m - ca, m - cb])
    H, W = mask.shape
    D = np.zeros((H, W, im.shape[2]))
    Wt = np.zeros((H, W))
    xi = np.clip(pts[:, 0].astype(int), 0, W - 1)
    yi = np.clip(pts[:, 1].astype(int), 0, H - 1)
    np.add.at(D, (yi, xi), d)
    np.add.at(Wt, (yi, xi), 1.0)
    bd, bw = gauss_blur(D, spread), gauss_blur(Wt, spread)
    off = bd / np.maximum(bw, 1e-9)[..., None]
    # Distance to the nearest seam sample (texels), on the masked texels only.
    ys, xs = np.nonzero(mask)
    dist = np.full(len(xs), np.inf)
    for i in range(0, len(pts), 256):
        q = pts[i:i + 256]
        dd = (xs[:, None] + 0.5 - q[None, :, 0]) ** 2 + (ys[:, None] + 0.5 - q[None, :, 1]) ** 2
        dist = np.minimum(dist, dd.min(1))
    fade = np.zeros((H, W))
    fade[ys, xs] = np.clip(1 - np.sqrt(dist) / reach, 0, 1) ** 2 * (3 - 2 * np.clip(1 - np.sqrt(dist) / reach, 0, 1))
    fade *= bw > 1e-6
    out = im + off * fade[..., None]
    return out[..., 0] if two_d else out


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def encode(img8, fmt, quality=92):
    bio = io.BytesIO()
    im = Image.fromarray(img8)
    if fmt == 'jpeg':
        im.save(bio, 'JPEG', quality=quality, subsampling=0, optimize=True)
        return bio.getvalue(), 'image/jpeg'
    im.save(bio, 'PNG', optimize=True)
    return bio.getvalue(), 'image/png'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


# ------------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--cut', type=float, default=7.0, help='cm down the upper arm from the shoulder joint')
    ap.add_argument('--radius', type=float, default=10.0, help='cm, the upper arm sleeve radius limit near the cut')
    ap.add_argument('--tess', type=int, default=3)
    ap.add_argument('--ring', action='store_true', help='keep the avatar\'s finger ring (metal)')
    ap.add_argument('--normal-format', default='png', choices=('png', 'jpeg'))
    ap.add_argument('--name', default='drinking-arm.glb')
    ap.add_argument('--debug-uv', action='store_true', help='debug: base colour = UV gradient, flat normal')
    args = ap.parse_args()

    fbx_name = [f for f in os.listdir(args.src) if f.lower().endswith('.fbx') and 'facial' not in f.lower()][0]
    avatar = fbx_name[:-4]
    av = rbx_fbx.load_avatar(os.path.join(args.src, fbx_name))
    cl = av['clusters']
    bones = sorted(cl)
    bi = {b: i for i, b in enumerate(bones)}
    ncp = len(av['cp'])
    Wall = np.zeros((ncp, len(bones)))
    for b, c in cl.items():
        np.add.at(Wall[:, bi[b]], c['index'], c['weight'])
    Wall /= Wall.sum(1, keepdims=True)
    JT = joint_table()
    names = [j[0] for j in JT]
    keep = [bi[j[1]] for j in JT]
    parent = [names.index(j[2]) if j[2] else -1 for j in JT]
    for (n, b, p) in JT:
        if p and av['parent'].get(b) != JT[names.index(p)][1]:
            raise ValueError('hierarchy mismatch at ' + b)
    Wk = Wall[:, keep].copy()
    other = np.ones(len(bones), bool)
    other[keep] = False
    moved_to_upper = Wall[:, other].sum(1)
    Wk[:, 0] += moved_to_upper
    order = np.argsort(-Wk, 1)[:, :4]
    w4 = np.take_along_axis(Wk, order, 1)
    w4 /= w4.sum(1, keepdims=True)
    Wk4 = np.zeros_like(Wk)
    np.put_along_axis(Wk4, order, w4, 1)

    link = {b: cl[b]['link'] for b in cl}
    jpos = lambda b: link[b][:3, 3]  # noqa: E731
    S, E, Wr = jpos('Bip01 R UpperArm'), jpos('Bip01 R Forearm'), jpos('Bip01 R Hand')

    # 1. Cut.
    body_mat = [i for i, m in enumerate(av['materials']) if m.endswith('_body')][0]
    tri = av['tri_cp']
    armw = Wall[:, keep].sum(1)
    ax = armlib.unit(E - S)
    cen = av['cp'][tri].mean(1)
    tc = (cen - S) @ ax
    radial = np.linalg.norm(cen - S - tc[:, None] * ax, axis=1)
    # Loose pre-selection (the exact planar cut happens after straightening, where the upper arm lies on -Y).
    cand = (av['poly_mat'] == body_mat) & (armw[tri].max(1) > 0.3) & (tc >= args.cut - 8)
    cand &= ~((tc < np.linalg.norm(E - S)) & (radial > args.radius + 2))
    sel = np.where(cand)[0]
    comp = components(tri[sel], ncp)
    sizes = {k: (comp == k).sum() for k in set(comp)}
    main_comp = max(sizes, key=sizes.get)
    keep_tri = comp == main_comp
    for k, s_ in sizes.items():
        if k == main_comp:
            continue
        ts = sel[comp == k]
        fing = Wall[tri[ts].ravel(), bi['Bip01 R Finger3']].mean()
        print('  other piece: %d triangles, ring-finger weight %.2f -> %s' % (s_, fing, 'kept (ring)' if args.ring and fing > 0.8 else 'dropped'))
        if args.ring and fing > 0.8:
            keep_tri |= comp == k
    sel = sel[keep_tri]

    # 3. Straighten.
    h = armlib.unit(jpos('Bip01 R Finger2') - Wr)
    Lf, Lu = np.linalg.norm(Wr - E), np.linalg.norm(E - S)
    Rf = armlib.min_arc(Wr - E, h)
    Ru = armlib.min_arc(E - S, h)
    E2 = Wr - h * Lf
    S2 = E2 - h * Lu
    elbow_bind_angle = np.degrees(np.arccos(np.clip(np.dot(armlib.unit(E - S), armlib.unit(Wr - E)), -1, 1)))
    wrist_bind_angle = np.degrees(np.arccos(np.clip(np.dot(armlib.unit(Wr - E), h), -1, 1)))
    print('bind pose: elbow bent %.1f deg, wrist bent %.1f deg (both straightened)' % (elbow_bind_angle, wrist_bind_angle))
    Ms = np.tile(np.eye(4), (len(JT), 1, 1))
    Ms[0, :3, :3] = Ru
    Ms[0, :3, 3] = S2 - Ru @ S
    Ms[1, :3, :3] = Rf
    Ms[1, :3, 3] = E2 - Rf @ E
    Mv = np.einsum('vj,jab->vab', Wk4, Ms)
    cpS = np.einsum('vab,vb->va', Mv[:, :3, :3], av['cp']) + Mv[:, :3, 3]
    # Elbow flexion axis: the bind's bend, carried with the upper arm into the straight pose.
    elbow_axis_world = armlib.unit(np.cross(h, Ru @ armlib.unit(Wr - E)))

    # 4. Normalised frame.
    X = jpos('Bip01 R Finger4') - jpos('Bip01 R Finger1')
    X = armlib.unit(X - h * np.dot(X, h))
    Y = h
    Z = np.cross(X, Y)
    Rn = np.stack([X, Y, Z], 1)
    to_n = lambda p: ((np.asarray(p) - Wr) @ Rn) / 100.0  # noqa: E731
    joint_world = {'upperarm_r': S2, 'forearm_r': E2, 'hand_r': Wr}
    for n, b, p in JT[3:]:
        joint_world[n] = jpos(b)
    J = np.array([to_n(joint_world[n]) for n in names])
    if J[names.index('thumb_01_r'), 0] >= 0:
        raise ValueError('thumb is not on -X: not a right hand?')

    # Corners -> vertices (control point, UV, normal).
    corner_t = np.repeat(sel, 3)
    corner_k = np.tile(np.arange(3), len(sel))
    corner_cp = tri[sel].ravel()
    corner_uv = av['uv_index'].reshape(-1, 3)[sel].ravel()
    corner_n = av['normals'].reshape(-1, 3, 3)[sel].reshape(-1, 3)
    corner_n = np.einsum('vab,vb->va', Mv[corner_cp, :3, :3], corner_n)
    corner_n /= np.linalg.norm(corner_n, axis=1, keepdims=True)
    corner_n = corner_n @ Rn
    keys = {}
    vcp, vuv, vn = [], [], []
    vidx = np.zeros(len(corner_cp), np.int64)
    for i in range(len(corner_cp)):
        k = (int(corner_cp[i]), int(corner_uv[i]), tuple(np.round(corner_n[i] * 1000).astype(int)))
        v = keys.get(k)
        if v is None:
            v = keys[k] = len(vcp)
            vcp.append(corner_cp[i])
            vuv.append(corner_uv[i])
            vn.append(corner_n[i])
        vidx[i] = v
    vcp = np.array(vcp)
    P = to_n(cpS[vcp])
    N = np.array(vn)
    UV = av['uv'][np.array(vuv)]
    WD = Wk4[vcp]
    T = vidx.reshape(-1, 3)
    # Geometric normal per control point (shared by every vertex at that position): area-weighted face
    # normals, so the PN surface follows the faces and is identical on both sides of a UV seam.
    fnrm = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    gsum = np.zeros((ncp, 3))
    for k in range(3):
        np.add.at(gsum, vcp[T[:, k]], fnrm)
    GN = gsum[vcp] / np.linalg.norm(gsum[vcp], axis=1, keepdims=True)
    # UV islands -> material class: 1 skin (hand island), 0 cloth (sleeve), 2 metal (ring).
    isl = components(av['uv_index'].reshape(-1, 3)[sel], len(av['uv']))
    hand_w = Wk4[:, 2:].sum(1)
    tri_hand = hand_w[tri[sel]].mean(1)
    tri_ring = Wall[tri[sel], bi['Bip01 R Finger3']].mean(1)
    tri_class = np.zeros(len(sel), np.int64)
    for k in set(isl):
        m = isl == k
        if tri_ring[m].mean() > 0.8 and m.sum() < 60:
            tri_class[m] = 2
        elif tri_hand[m].mean() > 0.5:
            tri_class[m] = 1
    print('UV islands: %d (skin triangles %d, cloth %d, metal %d)' % (len(set(isl)), (tri_class == 1).sum(), (tri_class == 0).sum(), (tri_class == 2).sum()))

    # Where the cuff meets the skin the source shares one averaged normal (pointing up the arm) between the
    # two; on the skin side that lights a smooth bright wedge on the palm heel. Those junction vertices take
    # the face normals of their own side (skin or cloth).
    vcls = np.full(len(P), -1)
    for t in range(len(T)):
        vcls[T[t]] = tri_class[t]
    cls_at_cp = {}
    for v in range(len(P)):
        cls_at_cp.setdefault(int(vcp[v]), set()).add(int(vcls[v]))
    junction = np.array([len(cls_at_cp[int(c)] - {2}) > 1 for c in vcp])
    own = np.zeros_like(P)
    for k in range(3):
        np.add.at(own, T[:, k], fnrm)
    own /= np.maximum(np.linalg.norm(own, axis=1, keepdims=True), 1e-12)
    before = np.einsum('ij,ij->i', N[junction], own[junction])
    N[junction] = own[junction]
    print('cuff/skin junction: %d vertices re-normalled from their own faces (authored normal was %.0f..%.0f deg off)' % (
        junction.sum(), np.degrees(np.arccos(np.clip(before.max(), -1, 1))), np.degrees(np.arccos(np.clip(before.min(), -1, 1)))))

    # 1b. Exact cut: clip at the plane y = shoulder + cut, drop what lies off the arm, keep the largest piece.
    yc = J[0, 1] + args.cut / 100.0
    P, N, UV, WD, GN, T, tri_class = clip_plane(P, N, UV, WD, GN, T, tri_class, yc)
    cen = P[T].mean(1)
    off_arm = (np.hypot(cen[:, 0], cen[:, 2]) > args.radius / 100.0) & (cen[:, 1] < J[1, 1])
    T, tri_class = T[~off_arm], tri_class[~off_arm]
    pkey = {}
    pid = np.array([pkey.setdefault(tuple(np.round(p * 1e5).astype(int)), len(pkey)) for p in P])
    comp = components(pid[T], len(pkey))
    sizes = {k: (comp == k).sum() for k in set(comp)}
    main_comp = max(sizes, key=sizes.get)
    keep_t = (comp == main_comp) | (tri_class == 2)
    T, tri_class = T[keep_t], tri_class[keep_t]
    used = np.unique(T)
    remap = np.full(len(P), -1)
    remap[used] = np.arange(len(used))
    P, N, UV, WD, GN, T = P[used], N[used], UV[used], WD[used], GN[used], remap[T]
    n_cut_tris = len(T)
    print('cut plane %.1f cm below the shoulder joint: %d triangles, %d vertices (dropped %d off-arm triangles); '
          'weight moved to the upper arm (clavicle/spine/neck) at kept vertices: max %.2f' % (
              args.cut, len(T), len(P), int(off_arm.sum()) + int((~keep_t).sum()), moved_to_upper[vcp].max()))

    # Texture crop rectangle (pixels of the 2048 atlas).
    col_src = Image.open(os.path.join(args.src, [f for f in os.listdir(args.src) if f.endswith('_body_color.tga')][0])).convert('RGB')
    SZ = col_src.width
    px = np.stack([UV[:, 0] * SZ, (1 - UV[:, 1]) * SZ], 1)
    x0 = max(0, int(np.floor(px[:, 0].min())) - 12) // 8 * 8
    y0 = max(0, int(np.floor(px[:, 1].min())) - 12) // 8 * 8
    x1 = min(SZ, (int(np.ceil(px[:, 0].max())) + 12 + 7) // 8 * 8)
    y1 = min(SZ, (int(np.ceil(px[:, 1].max())) + 12 + 7) // 8 * 8)
    tw, th = x1 - x0, y1 - y0
    print('texture crop: x %d..%d, y %d..%d of %d (%d x %d, native texel density)' % (x0, x1, y0, y1, SZ, tw, th))

    # 5. Tessellate (on the normalised mesh). Classes ride along as a per-vertex value (islands never share vertices).
    vclass = np.zeros(len(P))
    for t in range(len(T)):
        vclass[T[t]] = tri_class[t]
    WDc = np.concatenate([WD, vclass[:, None]], 1)
    P2, N2, UV2, WD2, T2 = pn_tessellate(P, N, UV, WDc, GN, T, args.tess)
    vclass2 = np.round(WD2[:, -1]).astype(int)
    WD2 = WD2[:, :-1]
    _, folds = fold_check(P2, T2, N2)
    print('tessellation x%d: %d vertices, %d triangles (sub-triangles facing against their normals: %d)' % (
        args.tess ** 2, len(P2), len(T2), len(folds)))
    for t in folds[:12]:
        j = WD2[T2[t]].sum(0).argmax()
        print('   fold at %s near joint %s, class %d' % (P2[T2[t]].mean(0).round(4), names[j], vclass2[T2[t]].max()))
    # Top-4 weights again after interpolation.
    order = np.argsort(-WD2, 1)[:, :4]
    W4 = np.take_along_axis(WD2, order, 1)
    W4[W4 < 1e-4] = 0
    W4 /= W4.sum(1, keepdims=True)
    J4 = order.copy()
    J4[W4 == 0] = 0
    TAN = tangents(P2, N2, UV2, T2)
    # glTF UVs into the crop (origin top-left).
    UVg = np.stack([(UV2[:, 0] * SZ - x0) / tw, ((1 - UV2[:, 1]) * SZ - y0) / th], 1)

    # 6. Textures.
    tri_cls2 = vclass2[T2].max(1)
    lab = raster_labels(UVg * [tw, th], T2, tri_cls2, tw, th)
    mask = lab >= 0   # texels kept from the source (centres inside a triangle); the rest is push-pull filled
    lab = grow_labels(lab, 3)
    def crop(name, mode='RGB'):
        f = [x for x in os.listdir(args.src) if x.endswith('_body_%s.tga' % name)][0]
        im = Image.open(os.path.join(args.src, f)).convert(mode)
        return np.asarray(im.crop((x0, y0, x1, y1)), np.float64) / 255
    C = crop('color')
    Nm = crop('normal')
    Sp = crop('specular', 'L')
    rough = np.full((th, tw), 0.88)
    metal = np.zeros((th, tw))
    # Cloth: the source specular is flat on the sleeve (one 8-bit level), so the sleeve takes 0.86 with a
    # slight variation from the knit's brightness (raised fibres a touch glossier than the gaps).
    lum = C @ np.array([0.2126, 0.7152, 0.0722])
    k = 9
    ker = np.exp(-0.5 * (np.arange(-k, k + 1) / 3.0) ** 2)
    ker /= ker.sum()
    blur = lum.copy()
    for axis in (0, 1):
        blur = np.apply_along_axis(lambda v: np.convolve(np.pad(v, k, mode='edge'), ker, 'valid'), axis, blur)
    hp = np.clip((lum - blur) * 8, -1, 1)
    m = lab == 0
    rough[m] = (0.86 - 0.04 * hp)[m]
    print('  cloth: roughness %.2f..%.2f (median %.2f)' % (rough[m].min(), rough[m].max(), np.median(rough[m])))
    for cls, (lo, hi) in ((1, (0.60, 0.47)),):
        m = lab == cls
        if not m.any():
            continue
        p5, p95 = np.percentile(Sp[m], 5), np.percentile(Sp[m], 95)
        sn = np.clip((Sp - p5) / max(p95 - p5, 1e-6), 0, 1.4)
        r = lo + (hi - lo) * np.clip(sn, 0, 1)
        if cls == 1:  # nails (the brightest specular) get glossier
            r -= 0.14 * smoothstep(0.95, 1.35, sn)
        rough[m] = r[m]
        print('  %s: specular p5 %.3f p95 %.3f -> roughness %.2f..%.2f (median %.2f)' % (
            ('cloth', 'skin')[cls], p5, p95, r[m].min(), r[m].max(), np.median(r[m])))
    if (lab == 2).any():
        rough[lab == 2] = 0.3
        metal[lab == 2] = 1.0
    # A mild unsharp mask on the skin colour (the hand gets ~1.5 texels/mm; this keeps creases and nail
    # edges crisp at first-person distance without inventing detail).
    skin_px = (lab == 1)[..., None]
    C = np.where(skin_px, np.clip(C + 0.35 * (C - gauss_blur(C, 1.2)), 0, 1), C)
    # Seam levelling on the skin (the hand island's palm and back halves meet along the sides of the fingers
    # and on the palm heel; the source maps do not match there).
    UVpx0 = np.stack([UV[:, 0] * SZ - x0, (1 - UV[:, 1]) * SZ - y0], 1)
    raw_mask = raster_labels(UVpx0, T, tri_class, tw, th) == 1   # the skin island texels themselves
    sa, sb = seam_samples(P, UVpx0, T, tri_class == 1)
    skin_mask = lab == 1
    if len(sa):
        def step(img):
            mk = raw_mask.astype(np.float64)[..., None]
            sm = gauss_blur(img * mk, 2.5) / np.maximum(gauss_blur(mk, 2.5), 1e-6)
            return np.abs(bilinear(sm, sa[:, 0], sa[:, 1]) - bilinear(sm, sb[:, 0], sb[:, 1])).mean()
        before = step(C)
        C = level_seams(C, sa, sb, raw_mask, spread=5.0, reach=30.0)
        C = level_seams(C, sa, sb, raw_mask, spread=4.0, reach=20.0)
        nxy = level_seams(Nm[..., :2] * 2 - 1, sa, sb, raw_mask, spread=6.0, reach=16.0)
        nz = np.sqrt(np.clip(1 - (nxy ** 2).sum(2), 0, 1))
        Nm = np.where(skin_mask[..., None], (np.dstack([nxy, nz]) + 1) / 2, Nm)
        rough = np.where(skin_mask, level_seams(rough, sa, sb, raw_mask, spread=5.0), rough)
        after = step(C)
        print('skin seams: %d sample pairs; mean colour step across them %.3f -> %.3f' % (len(sa), before, after))
    # The source gutters are black (colour) and white (normal map): never keep such texels, even on an
    # island's edge, or bilinear filtering draws a dark/tilted line along every UV seam.
    nraw = Nm * 2 - 1
    nlen = np.linalg.norm(nraw, axis=2)
    valid_n = (nlen > 0.8) & (nlen < 1.2) & (nraw[..., 2] > 0.15)
    valid_c = C.sum(2) > 0.04
    print('texels kept: %d; dropped as source gutter: colour %d, normal %d' % (
        mask.sum(), (mask & ~valid_c).sum(), (mask & ~valid_n).sum()))
    C = push_pull(C, mask & valid_c)
    Nm = push_pull(Nm, mask & valid_n)
    RM = push_pull(np.dstack([np.ones_like(rough), rough, metal]), mask)
    # Re-normalise the normal map after filtering.
    nv = Nm * 2 - 1
    nv /= np.maximum(np.linalg.norm(nv, axis=2, keepdims=True), 1e-6)
    Nm = (nv + 1) / 2
    to8 = lambda a: np.clip(np.round(a * 255), 0, 255).astype(np.uint8)  # noqa: E731
    os.makedirs(args.out, exist_ok=True)
    tex_dir = os.path.join(args.out, 'textures')
    os.makedirs(tex_dir, exist_ok=True)
    if args.debug_uv:
        gx, gy = np.meshgrid((np.arange(tw) + 0.5) / tw, (np.arange(th) + 0.5) / th)
        C = np.dstack([gx, gy, np.full_like(gx, 0.5)])
        Nm = np.dstack([np.full_like(gx, 0.5), np.full_like(gx, 0.5), np.ones_like(gx)])
    col_bytes, col_mime = encode(to8(C), 'png' if args.debug_uv else 'jpeg', 92)
    nrm_bytes, nrm_mime = encode(to8(Nm), args.normal_format, 95)
    rm_bytes, rm_mime = encode(to8(RM), 'jpeg', 92)
    for nm, data, mime in (('basecolor', col_bytes, col_mime), ('normal', nrm_bytes, nrm_mime), ('metalrough', rm_bytes, rm_mime)):
        with open(os.path.join(tex_dir, 'arm_%s.%s' % (nm, 'jpg' if mime == 'image/jpeg' else 'png')), 'wb') as fh:
            fh.write(data)

    # GLB.
    gb = armlib.GlbBuilder()
    g = gb.gltf
    files = ['Assets/Avatars/Adults/%s/Export/%s' % (avatar, fbx_name)] + [
        'Assets/Avatars/Adults/%s/Textures/%s' % (avatar, f) for f in sorted(os.listdir(args.src)) if f.endswith('.tga')]
    g['asset'] = {
        'version': '2.0',
        'generator': 'horror work/arm/scripts/build_arm.py (numpy + PIL)',
        'copyright': 'Microsoft Rocketbox Avatar Library, Copyright (c) Microsoft Corporation, MIT License',
        'extras': {
            'title': 'First-person right arm (sleeve + hand) for the drinking sequence',
            'source': REPO,
            'sourceCommit': COMMIT,
            'sourceFiles': files,
            'avatar': avatar,
            'library': 'Microsoft Rocketbox',
            'license': 'MIT',
            'licenseUrl': REPO + '/blob/%s/LICENSE.md' % COMMIT,
            'attribution': 'Arm and hand from "%s" of the Microsoft Rocketbox Avatar Library (%s), '
                           'Copyright (c) Microsoft Corporation, MIT License.' % (avatar, REPO),
            'modifications': 'Right arm cut from the full body below the shoulder; skeleton reduced to upper arm, '
                             'forearm, hand and 15 finger joints (other weights moved to the upper arm); elbow and '
                             'wrist straightened; re-framed to wrist origin, fingers +Y, back of hand +Z, metres; '
                             'PN-triangle smoothing x%d; cuff/skin junction normals split; textures cropped from the '
                             'body atlas, skin UV seams levelled, mild skin sharpening, specular converted to '
                             'metallic-roughness (metal 0).' % (args.tess ** 2),
            'frame': 'origin wrist joint; +Y wrist->middle knuckle (fingers); +X toward little finger (thumb -X); '
                     '+Z back of hand (palm -Z); forearm and upper arm along -Y; metres',
        },
    }
    pos_acc = gb.accessor(P2.astype(np.float32), 'VEC3', 34962, minmax=True)
    nrm_acc = gb.accessor(N2.astype(np.float32), 'VEC3', 34962)
    tan_acc = gb.accessor(TAN.astype(np.float32), 'VEC4', 34962)
    uv_acc = gb.accessor(UVg.astype(np.float32), 'VEC2', 34962)
    jnt_acc = gb.accessor(J4.astype(np.uint8), 'VEC4', 34962)
    wgt_acc = gb.accessor(W4.astype(np.float32), 'VEC4', 34962)
    idx_dtype = np.uint16 if len(P2) < 65536 else np.uint32
    idx_acc = gb.accessor(T2.astype(idx_dtype).ravel(), 'SCALAR', 34963)
    img_c = gb.image(col_bytes, col_mime, 'arm_basecolor')
    img_n = gb.image(nrm_bytes, nrm_mime, 'arm_normal')
    img_rm = gb.image(rm_bytes, rm_mime, 'arm_metalrough')
    g['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
    g['textures'] = [{'sampler': 0, 'source': img_c, 'name': 'basecolor'}, {'sampler': 0, 'source': img_n, 'name': 'normal'},
                     {'sampler': 0, 'source': img_rm, 'name': 'metalrough'}]
    g['materials'] = [{
        'name': '%s_arm' % avatar,
        'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'baseColorFactor': [1, 1, 1, 1],
                                 'metallicFactor': 1.0 if (lab == 2).any() else 0.0, 'roughnessFactor': 1.0,
                                 'metallicRoughnessTexture': {'index': 2}},
        'normalTexture': {'index': 1, 'scale': 1.0},
        'doubleSided': False,
        'extras': {'roughness': 'skin 0.47-0.60 (nails ~0.35), sleeve 0.84-0.90, from the source specular map'},
    }]
    g['meshes'] = [{'name': 'drinking_arm', 'primitives': [{
        'attributes': {'POSITION': pos_acc, 'NORMAL': nrm_acc, 'TANGENT': tan_acc, 'TEXCOORD_0': uv_acc,
                       'JOINTS_0': jnt_acc, 'WEIGHTS_0': wgt_acc},
        'indices': idx_acc, 'material': 0, 'mode': 4}]}]
    # Nodes: 0 root, 1 mesh, 2.. joints.
    # Scene roots: the skinned mesh node (a root, as glTF recommends for skinned meshes) and the skeleton root.
    nodes = [{'name': 'drinking_arm', 'mesh': 0, 'skin': 0}]
    for i, (n, b, p) in enumerate(JT):
        t = J[i] - (J[parent[i]] if parent[i] >= 0 else 0)
        nodes.append({'name': n, 'translation': [round(float(v), 6) for v in t], 'extras': {'biped': b}})
    for i in range(len(JT)):
        kids = [1 + k for k in range(len(JT)) if parent[k] == i]
        if kids:
            nodes[1 + i]['children'] = kids
    g['nodes'] = nodes
    # Rest globals are pure translations (identity rotations): IBM = translate(-joint).
    # Recompute the joints' global positions from the rounded translations so IBMs match the nodes exactly.
    Jr = np.zeros_like(J)
    for i in range(len(JT)):
        t = np.array(nodes[1 + i]['translation'])
        Jr[i] = t + (Jr[parent[i]] if parent[i] >= 0 else 0)
    ibm = np.tile(np.eye(4), (len(JT), 1, 1))
    ibm[:, :3, 3] = -Jr
    ibm_acc = gb.accessor(ibm.transpose(0, 2, 1).reshape(len(JT), 16).astype(np.float32), 'MAT4')
    g['skins'] = [{'name': 'arm_skin', 'joints': [1 + i for i in range(len(JT))], 'inverseBindMatrices': ibm_acc, 'skeleton': 1}]
    g['scenes'] = [{'name': 'DrinkingArm', 'nodes': [0, 1]}]
    out_path = os.path.join(args.out, args.name)
    size = gb.write(out_path)
    print('wrote %s: %d bytes (%.2f MB); textures %d x %d: colour %d KB, normal %d KB, metal-rough %d KB' % (
        out_path, size, size / 1e6, tw, th, len(col_bytes) // 1024, len(nrm_bytes) // 1024, len(rm_bytes) // 1024))

    # Build facts for the pose fitter / README.
    facts = {
        'avatar': avatar, 'fbx': fbx_name, 'commit': COMMIT,
        'sources': {f: sha256(os.path.join(args.src, f)) for f in sorted(os.listdir(args.src))},
        'cut_cm': args.cut, 'tess': args.tess, 'ring': bool((lab == 2).any()),
        'source_triangles': int(n_cut_tris), 'triangles': int(len(T2)), 'vertices': int(len(P2)), 'joints': len(JT),
        'bind_elbow_deg': float(elbow_bind_angle), 'bind_wrist_deg': float(wrist_bind_angle),
        'elbow_axis': [float(v) for v in (Rn.T @ elbow_axis_world)],
        'texture': [tw, th], 'crop': [x0, y0, x1, y1], 'bytes': int(size),
        # The source rig's bind-pose bone axes (columns of the Biped TransformLink rotation), in the hand frame.
        'source_axes': {n: [[float(v) for v in col] for col in (Rn.T @ ({0: Ru, 1: Rf}.get(i, np.eye(3))) @ (
            link[b][:3, :3] / np.linalg.norm(link[b][:3, :3], axis=0))).T] for i, (n, b, p) in enumerate(JT)},
    }
    with open(os.path.join(args.out, 'build-facts.json'), 'w') as fh:
        json.dump(facts, fh, indent=1)
    # Self-check: skinning at rest reproduces the mesh.
    arm = armlib.SkinnedArm(out_path)
    p, _, _ = arm.skin()
    print('rest skinning error: %.2e m; weights sum min %.4f; joints %d' % (np.abs(p - arm.P).max(), arm.W.sum(1).min(), len(arm.names)))


if __name__ == '__main__':
    main()

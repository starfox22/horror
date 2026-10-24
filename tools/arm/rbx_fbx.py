"""Binary FBX 7.x reader for Microsoft Rocketbox avatars (pure Python + numpy).

Adapted from the sibling project's tools/player_model.py (read_fbx / load_avatar): reads the
node tree, the one skinned mesh (control points, triangles, per-corner normals and UVs,
per-polygon material), every skin cluster (bone name, bind matrix TransformLink, indices,
weights) and the Model hierarchy (bone parents).
"""
import struct
import zlib

import numpy as np



# ---------------------------------------------------------------------------------------------
# Binary FBX reader: (name, properties, children) tuples.
def read_fbx(path):
    data = open(path, 'rb').read()
    if data[:20] != b'Kaydara FBX Binary  ':
        raise ValueError('not a binary FBX: ' + path)
    version = struct.unpack_from('<I', data, 23)[0]
    wide = version >= 7500

    def prop(pos):
        t = chr(data[pos])
        pos += 1
        if t == 'Y':
            return struct.unpack_from('<h', data, pos)[0], pos + 2
        if t == 'C':
            return data[pos] != 0, pos + 1
        if t == 'I':
            return struct.unpack_from('<i', data, pos)[0], pos + 4
        if t == 'F':
            return struct.unpack_from('<f', data, pos)[0], pos + 4
        if t == 'D':
            return struct.unpack_from('<d', data, pos)[0], pos + 8
        if t == 'L':
            return struct.unpack_from('<q', data, pos)[0], pos + 8
        if t in 'fdlib':
            n, enc, clen = struct.unpack_from('<III', data, pos)
            pos += 12
            raw = data[pos:pos + clen]
            pos += clen
            if enc == 1:
                raw = zlib.decompress(raw)
            dt = {'f': '<f4', 'd': '<f8', 'l': '<i8', 'i': '<i4', 'b': 'u1'}[t]
            return np.frombuffer(raw, dtype=dt, count=n), pos
        if t in 'SR':
            n = struct.unpack_from('<I', data, pos)[0]
            pos += 4
            raw = data[pos:pos + n]
            return (raw.decode('utf-8', 'replace') if t == 'S' else raw), pos + n
        raise ValueError('bad FBX property type %r' % t)

    def node(pos):
        if wide:
            end, nprops, _ = struct.unpack_from('<QQQ', data, pos)
            pos += 24
        else:
            end, nprops, _ = struct.unpack_from('<III', data, pos)
            pos += 12
        if end == 0:
            return None, pos
        nl = data[pos]
        name = data[pos + 1:pos + 1 + nl].decode()
        pos += 1 + nl
        props = []
        for _ in range(nprops):
            v, pos = prop(pos)
            props.append(v)
        kids = []
        while pos < end:
            k, pos = node(pos)
            if k is None:
                break
            kids.append(k)
        return (name, props, kids), end

    top, pos = [], 27
    while pos < len(data):
        n, pos = node(pos)
        if n is None:
            break
        top.append(n)
    return top


def child(n, name):
    for k in n[2]:
        if k[0] == name:
            return k
    return None


def value(n, name):
    k = child(n, name)
    return k[1][0] if k and k[1] else None


# ---------------------------------------------------------------------------------------------
# The Rocketbox mesh: world positions (cm, Y up, the character facing +Z, his left +X), per
# polygon-vertex normals, UVs and materials, and the clusters' weights.
def load_avatar(path):
    """World-space (cm, Y up, facing +Z, his left +X) skinned mesh + clusters + bone parents."""
    top = read_fbx(path)
    root = ('', [], top)
    objs = child(root, 'Objects')[2]
    conns = child(root, 'Connections')[2]
    byid = {o[1][0]: o for o in objs}
    name = {o[1][0]: o[1][1].split('\x00')[0] for o in objs}
    geoms = [o for o in objs if o[0] == 'Geometry' and len(o[1]) > 2 and o[1][2] == 'Mesh']
    if len(geoms) != 1:
        raise ValueError('expected one mesh geometry, got %d' % len(geoms))
    geom = geoms[0]
    mesh_models = [o for o in objs if o[0] == 'Model' and o[1][2] == 'Mesh']
    mesh_model = mesh_models[0][1][0]
    owner = {}     # cluster id -> bone model id
    parent = {}    # model id -> parent model id
    order = []     # materials on the mesh model, in connection order
    for c in conns:
        if c[1][0] != 'OO':
            continue
        a, b = c[1][1], c[1][2]
        if a in byid and b in byid:
            if byid[a][0] == 'Model' and byid[b][0] == 'Deformer':
                owner[b] = a
            if byid[a][0] == 'Material' and b == mesh_model:
                order.append(name[a])
            if byid[a][0] == 'Model' and byid[b][0] == 'Model':
                parent[name[a]] = name[b]
    cp = value(geom, 'Vertices').reshape(-1, 3).astype(np.float64)
    pvi = value(geom, 'PolygonVertexIndex')
    ends = np.where(pvi < 0)[0]
    if not np.all(np.diff(ends, prepend=-1) == 3):
        raise ValueError('expected triangles only')
    tri_cp = np.where(pvi < 0, -pvi - 1, pvi).reshape(-1, 3)
    ln = child(geom, 'LayerElementNormal')
    if value(ln, 'MappingInformationType') != 'ByPolygonVertex' or value(ln, 'ReferenceInformationType') != 'Direct':
        raise ValueError('unexpected normal layout')
    normals = value(ln, 'Normals').reshape(-1, 3).astype(np.float64)
    lu = child(geom, 'LayerElementUV')
    if value(lu, 'MappingInformationType') != 'ByPolygonVertex' or value(lu, 'ReferenceInformationType') != 'IndexToDirect':
        raise ValueError('unexpected UV layout')
    uv = value(lu, 'UV').reshape(-1, 2).astype(np.float64)
    uv_index = value(lu, 'UVIndex').astype(np.int64)
    lm = child(geom, 'LayerElementMaterial')
    poly_mat = value(lm, 'Materials')
    if value(lm, 'MappingInformationType') == 'AllSame':
        poly_mat = np.zeros(len(tri_cp), np.int64)
    clusters = {}
    to_world = None
    for o in objs:
        if o[0] == 'Deformer' and o[1][2] == 'Cluster':
            bone = name[owner[o[1][0]]]
            T = value(o, 'Transform').reshape(4, 4).T
            TL = value(o, 'TransformLink').reshape(4, 4).T
            M = TL @ T  # geometry space -> world, the same for every cluster
            if to_world is None:
                to_world = M
            elif np.abs(M - to_world).max() > 1e-3:
                raise ValueError('clusters disagree on the bind')
            idx = value(o, 'Indexes')
            w = value(o, 'Weights')
            clusters[bone] = {'link': TL,
                              'index': idx.astype(np.int64) if idx is not None else np.zeros(0, np.int64),
                              'weight': w.astype(np.float64) if w is not None else np.zeros(0)}
    world = (to_world[:3, :3] @ cp.T).T + to_world[:3, 3]
    nworld = (np.linalg.inv(to_world[:3, :3]).T @ normals.T).T
    nworld /= np.linalg.norm(nworld, axis=1, keepdims=True)
    return {'cp': world, 'tri_cp': tri_cp, 'normals': nworld, 'uv': uv, 'uv_index': uv_index,
            'poly_mat': np.asarray(poly_mat, np.int64), 'materials': order, 'clusters': clusters,
            'parent': parent, 'to_world': to_world}

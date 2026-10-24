"""Shared helpers for the drinking-arm build: rotations, a minimal GLB writer/reader, linear blend skinning."""
import json
import struct

import numpy as np


# ------------------------------------------------------------------------------------------------
# Rotations (quaternions are [x, y, z, w], glTF order).
def unit(v):
    v = np.asarray(v, np.float64)
    return v / np.linalg.norm(v)


def axis_angle(axis, angle):
    a = unit(axis)
    c, s = np.cos(angle), np.sin(angle)
    x, y, z = a
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                     [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                     [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])


def min_arc(a, b):
    """The smallest rotation taking direction a onto direction b."""
    a, b = unit(a), unit(b)
    ax = np.cross(a, b)
    s = np.linalg.norm(ax)
    if s < 1e-12:
        return np.eye(3)
    return axis_angle(ax, np.arctan2(s, np.dot(a, b)))


def quat_from_matrix(R):
    R = np.asarray(R, np.float64)
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        q = [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, 0.25 * s]
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = np.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2]) * 2
        q = [0.25 * s, (R[0, 1] + R[1, 0]) / s, (R[0, 2] + R[2, 0]) / s, (R[2, 1] - R[1, 2]) / s]
    elif R[1, 1] > R[2, 2]:
        s = np.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2]) * 2
        q = [(R[0, 1] + R[1, 0]) / s, 0.25 * s, (R[1, 2] + R[2, 1]) / s, (R[0, 2] - R[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1]) * 2
        q = [(R[0, 2] + R[2, 0]) / s, (R[1, 2] + R[2, 1]) / s, 0.25 * s, (R[1, 0] - R[0, 1]) / s]
    q = np.array(q)
    q /= np.linalg.norm(q)
    if q[3] < 0:
        q = -q
    return q


def matrix_from_quat(q):
    x, y, z, w = q / np.linalg.norm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


# ------------------------------------------------------------------------------------------------
# GLB writer: build a glTF dict + one binary buffer.
class GlbBuilder:
    def __init__(self):
        self.blob = bytearray()
        self.gltf = {'asset': {'version': '2.0'}, 'buffers': [], 'bufferViews': [], 'accessors': [],
                     'images': [], 'textures': [], 'samplers': [], 'materials': [], 'meshes': [],
                     'nodes': [], 'skins': [], 'scenes': [], 'scene': 0}

    def _view(self, data, target=None):
        while len(self.blob) % 4:
            self.blob += b'\0'
        view = {'buffer': 0, 'byteOffset': len(self.blob), 'byteLength': len(data)}
        if target is not None:
            view['target'] = target
        self.blob += data
        self.gltf['bufferViews'].append(view)
        return len(self.gltf['bufferViews']) - 1

    def accessor(self, arr, kind, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        ctype = {np.dtype('float32'): 5126, np.dtype('uint16'): 5123, np.dtype('uint8'): 5121,
                 np.dtype('uint32'): 5125, np.dtype('int16'): 5122, np.dtype('int8'): 5120}[arr.dtype]
        view = self._view(arr.tobytes(), target)
        acc = {'bufferView': view, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': kind}
        if normalized:
            acc['normalized'] = True
        if minmax:
            flat = arr.reshape(arr.shape[0], -1)
            acc['min'] = [float(v) for v in flat.min(0)]
            acc['max'] = [float(v) for v in flat.max(0)]
        self.gltf['accessors'].append(acc)
        return len(self.gltf['accessors']) - 1

    def image(self, data, mime, name):
        view = self._view(data)
        self.gltf['images'].append({'bufferView': view, 'mimeType': mime, 'name': name})
        return len(self.gltf['images']) - 1

    def write(self, path):
        g = dict(self.gltf)
        for k in [k for k, v in g.items() if isinstance(v, list) and not v]:
            del g[k]
        while len(self.blob) % 4:
            self.blob += b'\0'
        g['buffers'] = [{'byteLength': len(self.blob)}]
        js = json.dumps(g, separators=(',', ':')).encode()
        while len(js) % 4:
            js += b' '
        total = 12 + 8 + len(js) + 8 + len(self.blob)
        with open(path, 'wb') as fh:
            fh.write(struct.pack('<III', 0x46546C67, 2, total))
            fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            fh.write(struct.pack('<II', len(self.blob), 0x004E4942) + bytes(self.blob))
        return total


# ------------------------------------------------------------------------------------------------
# GLB reader (enough for the arm: one buffer, accessors, nodes, one skin).
def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, total = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67 or version != 2:
        raise ValueError('not a glTF 2 binary')
    jl, jt = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20 + jl])
    bl, bt = struct.unpack_from('<II', data, 20 + jl)
    blob = data[28 + jl:28 + jl + bl]
    return gltf, blob


def accessor_array(gltf, blob, index):
    acc = gltf['accessors'][index]
    view = gltf['bufferViews'][acc['bufferView']]
    dt = {5126: '<f4', 5123: '<u2', 5121: 'u1', 5125: '<u4', 5122: '<i2', 5120: 'i1'}[acc['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[acc['type']]
    off = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    arr = np.frombuffer(blob, dtype=dt, count=acc['count'] * n, offset=off)
    return arr.reshape(acc['count'], n) if n > 1 else arr


class SkinnedArm:
    """The arm GLB as arrays, with forward kinematics and skinning for local joint rotations."""

    def __init__(self, path):
        g, blob = read_glb(path)
        self.gltf = g
        prim = g['meshes'][0]['primitives'][0]
        at = prim['attributes']
        self.P = accessor_array(g, blob, at['POSITION']).astype(np.float64)
        self.N = accessor_array(g, blob, at['NORMAL']).astype(np.float64)
        self.J = accessor_array(g, blob, at['JOINTS_0']).astype(np.int64)
        self.W = accessor_array(g, blob, at['WEIGHTS_0']).astype(np.float64)
        self.UV = accessor_array(g, blob, at['TEXCOORD_0']).astype(np.float64)
        self.I = accessor_array(g, blob, prim['indices']).astype(np.int64).reshape(-1, 3)
        skin = g['skins'][0]
        self.joint_nodes = skin['joints']
        self.ibm = accessor_array(g, blob, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
        self.names = [g['nodes'][n]['name'] for n in self.joint_nodes]
        self.index = {n: i for i, n in enumerate(self.names)}
        node_parent = {}
        for i, n in enumerate(g['nodes']):
            for c in n.get('children', []):
                node_parent[c] = i
        jn = {n: i for i, n in enumerate(self.joint_nodes)}
        self.parent = [jn.get(node_parent.get(n), -1) for n in self.joint_nodes]
        self.t_local = np.array([g['nodes'][n].get('translation', [0, 0, 0]) for n in self.joint_nodes], np.float64)
        self.q_rest = np.array([g['nodes'][n].get('rotation', [0, 0, 0, 1]) for n in self.joint_nodes], np.float64)
        # Dense weights per joint.
        self.dense = np.zeros((len(self.P), len(self.names)))
        for k in range(4):
            np.add.at(self.dense, (np.arange(len(self.P)), self.J[:, k]), self.W[:, k])

    def globals(self, q_local=None):
        """Global 4x4 matrices of the joints for local rotations (dict name -> quat, others at rest)."""
        G = np.zeros((len(self.names), 4, 4))
        for i in range(len(self.names)):
            q = self.q_rest[i]
            if q_local and self.names[i] in q_local:
                q = np.asarray(q_local[self.names[i]], np.float64)
            L = np.eye(4)
            L[:3, :3] = matrix_from_quat(q)
            L[:3, 3] = self.t_local[i]
            G[i] = G[self.parent[i]] @ L if self.parent[i] >= 0 else L
        return G

    def skin(self, q_local=None, subset=None):
        G = self.globals(q_local)
        S = G @ self.ibm  # (nj, 4, 4)
        P = self.P if subset is None else self.P[subset]
        N = self.N if subset is None else self.N[subset]
        D = self.dense if subset is None else self.dense[subset]
        M = np.einsum('vj,jab->vab', D, S)
        p = np.einsum('vab,vb->va', M[:, :3, :3], P) + M[:, :3, 3]
        n = np.einsum('vab,vb->va', M[:, :3, :3], N)
        n /= np.linalg.norm(n, axis=1, keepdims=True)
        return p, n, G

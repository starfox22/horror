"""Adapt the downloaded, licensed Elena FF hand; never generate a replacement hand.

Requires Python 3 and NumPy. Downloads a checksum-pinned source into work/ when
absent. Keeps the original hand surface, topology, UVs, skin weights, rig and
animation; only extends existing wrist loops into an offscreen forearm.
"""
import copy
import hashlib
import json
from pathlib import Path
import struct
import urllib.request

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'work/asset-research/hand_right.glb'
SOURCE_URL = ('https://raw.githubusercontent.com/bizzkoot/Hand-Math/'
              '4229f71c17cf7daf8ed060569b27c25b9697f687/assets/models/hand_right.glb')
SOURCE_SHA256 = '11fcdb53fd5c134a658dc93a8c331c4e9bb13df5f978aff44590e484ef5ceb11'
TARGET = ROOT / 'public/assets/props/drinking-hand.glb'

SOURCE.parent.mkdir(parents=True, exist_ok=True)
if not SOURCE.exists():
    urllib.request.urlretrieve(SOURCE_URL, SOURCE)
raw = SOURCE.read_bytes()
if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
    raise ValueError('Downloaded hand checksum differs from reviewed original')
json_length = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20 + json_length])
binary_start = 28 + json_length
components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
types = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}


def accessor(index):
    a = gltf['accessors'][index]
    view = gltf['bufferViews'][a['bufferView']]
    dtype = np.dtype(types[a['componentType']])
    size = components[a['type']]
    offset = binary_start + view.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = view.get('byteStride', dtype.itemsize * size)
    return np.ndarray((a['count'], size), dtype, raw, offset,
                      strides=(stride, dtype.itemsize))


def transform(node):
    if 'matrix' in node:
        return np.array(node['matrix']).reshape(4, 4).T
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    rotation = np.array([
        [1 - 2*y*y - 2*z*z, 2*x*y - 2*z*w, 2*x*z + 2*y*w],
        [2*x*y + 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z - 2*x*w],
        [2*x*z - 2*y*w, 2*y*z + 2*x*w, 1 - 2*x*x - 2*y*y],
    ])
    matrix = np.eye(4)
    matrix[:3, :3] = rotation @ np.diag(node.get('scale', [1, 1, 1]))
    matrix[:3, 3] = node.get('translation', [0, 0, 0])
    return matrix


original_nodes = copy.deepcopy(gltf['nodes'])
parents = {child: i for i, node in enumerate(gltf['nodes'])
           for child in node.get('children', [])}
worlds = {}


def world(index):
    if index not in worlds:
        parent = world(parents[index]) if index in parents else np.eye(4)
        worlds[index] = parent @ transform(gltf['nodes'][index])
    return worlds[index]


# The source bind pose is partly curled. Its first animation sample is fully open.
animation = gltf['animations'][0]
for channel in animation['channels']:
    sampler = animation['samplers'][channel['sampler']]
    target = channel['target']
    gltf['nodes'][target['node']][target['path']] = accessor(sampler['output'])[0].tolist()

primitive = gltf['meshes'][0]['primitives'][0]
positions = accessor(primitive['attributes']['POSITION'])
weights = accessor(primitive['attributes']['WEIGHTS_0'])
joints = accessor(primitive['attributes']['JOINTS_0'])
indices = accessor(primitive['indices']).reshape(-1, 3)
skin = gltf['skins'][0]
inverse_bind = accessor(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
skin_matrices = np.array([world(i) @ bind for i, bind in zip(skin['joints'], inverse_bind)])
weighted = np.sum(skin_matrices[joints] * weights[:, :, None, None], axis=1)
homogeneous = np.c_[positions, np.ones(len(positions))]
source_world = np.einsum('vab,vb->va', weighted, homogeneous)[:, :3]
wrist = world(16)[:3, 3]
scale = .19 / (.30658903 / .15)
canonical = (source_world - wrist) * scale
canonical = canonical[:, [2, 1, 0]]
canonical[:, 0] *= -1

# Extend the author's existing wrist surface. No vertices, faces or joints added.
fraction = np.clip((.008 - canonical[:, 1]) / (.008 - canonical[:, 1].min()), 0, 1)
smooth = fraction * fraction * (3 - 2 * fraction)
changed = smooth > 0
adapted = canonical.copy()
adapted[:, 1] -= .74 * smooth
adapted[:, 0] *= 1 + .35 * smooth
adapted[:, 2] *= 1 + .35 * smooth
source_adapted = adapted[:, [2, 1, 0]] / scale
source_adapted[:, 2] *= -1
source_adapted += wrist
new_local = np.linalg.solve(weighted, np.c_[source_adapted, np.ones(len(positions))][:, :, None])[:, :3, 0]
new_local = new_local.astype(np.float32)
new_local[~changed] = positions[~changed]

normals = accessor(primitive['attributes']['NORMAL']).copy()
face_normals = np.cross(new_local[indices[:, 1]] - new_local[indices[:, 0]],
                        new_local[indices[:, 2]] - new_local[indices[:, 0]])
smooth_normals = np.zeros_like(new_local)
for column in range(3):
    np.add.at(smooth_normals, indices[:, column], face_normals)
coincident = {}
for i, key in enumerate(map(tuple, np.round(new_local, 5))):
    coincident.setdefault(key, []).append(i)
for vertices in coincident.values():
    if len(vertices) > 1:
        smooth_normals[vertices] = smooth_normals[vertices].sum(axis=0)
length = np.linalg.norm(smooth_normals, axis=1)
smooth_normals[length > 0] /= length[length > 0, None]
normals[changed] = smooth_normals[changed]

edited = bytearray(raw)
for attribute, values in [('POSITION', new_local), ('NORMAL', normals)]:
    a = gltf['accessors'][primitive['attributes'][attribute]]
    view = gltf['bufferViews'][a['bufferView']]
    offset = binary_start + view.get('byteOffset', 0) + a.get('byteOffset', 0)
    edited[offset:offset + values.nbytes] = values.tobytes()
    a['min'], a['max'] = values.min(0).tolist(), values.max(0).tolist()
gltf['nodes'] = original_nodes

# Canonical +Y fingers, -Z palm, +Z dorsal, -X thumb. Wrist at the origin.
normalization = [0, 0, scale, 0, 0, scale, 0, 0, -scale, 0, 0, 0,
                 scale * wrist[2], -scale * wrist[1], -scale * wrist[0], 1]
scene = gltf['scenes'][gltf.get('scene', 0)]
root_index = len(gltf['nodes'])
gltf['nodes'].append({'name': 'DrinkingHandMeters', 'matrix': normalization,
                      'children': scene['nodes']})
scene['nodes'] = [root_index]
gltf['asset']['extras'].update({
    'modifiedBy': 'starfox22/horror Codex review 0.11',
    'modifications': 'Metre-scale wrist-origin parent transform; existing wrist loops extended 0.74m and widened 35% at far end; adapted wrist normals rebuilt. Hand surface, topology, UVs, textures, weights, rig and animation retained.',
    'derivativeLicense': 'CC-BY-SA-4.0',
    'sourceMirror': SOURCE_URL,
    'sourceSha256': SOURCE_SHA256,
    'basis': 'Wrist origin; +Y fingers; -Z palm; +Z dorsal; -X thumb; open wrist-to-tip about 0.19m.',
})
encoded = json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode()
encoded += b' ' * (-len(encoded) % 4)
binary_chunk = bytes(edited[20 + json_length:])
result = (struct.pack('<III', 0x46546C67, 2, 20 + len(encoded) + len(binary_chunk))
          + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + binary_chunk)
TARGET.parent.mkdir(parents=True, exist_ok=True)
TARGET.write_bytes(result)
print(f'{TARGET.relative_to(ROOT)}: {len(result):,} bytes; SHA256 {hashlib.sha256(result).hexdigest()}')

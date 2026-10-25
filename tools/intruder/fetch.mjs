// Downloads the intruder's sources into assets-src/intruder/: from the Microsoft Rocketbox Avatar Library (MIT) the
// avatars (FBX + TGA textures) and the animations the game uses; the mask (mask.json: "Porcelain Mask" by sleepwalker77,
// CC BY 4.0, from a GitHub mirror) into mask-<id>/; the dried blood on his glove (BLOOD: "Blood Splatter" by ExileGL,
// CC0, the same download as the death overlay's) into blood/. Each source is pinned to one commit; every file is checked
// against its SHA-256 once recorded in sources.json (the first run records them).
// Usage: node tools/intruder/fetch.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const COMMIT = '0943055db6ec570bcef9f2c8b41c9e5467c808f9';
export const OUT = 'assets-src/intruder';
const RAW = `https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/${COMMIT}/`;
// Avatars: the intruder's body (Male_Adult_18: a hoodie with the hood up, dressed black by build.mjs) and the
// unmasked man from the first draft (Male_Adult_20), kept for later use. Texture prefix per avatar.
export const AVATARS = { Male_Adult_18: 'm023', Male_Adult_20: 'm027' };
// Animations: in-place loops ('xy': horizontal motion extracted) and standing actions ('static').
export const ANIMATIONS = {
  xy: ['m_walk_slow_01', 'm_walk_slow_02', 'm_walk_neutral_01', 'm_run_neutral_01', 'm_walk_start', 'm_walk_stop', 'm_crouch_in', 'm_crouch_out'],
  static: ['m_idle_breathe_01', 'm_idle_breathe_02', 'm_idle_look_around_01', 'm_idle_look_around_02', 'm_idle_neutral_01',
    'm_listen_door', 'm_try_door_inwards', 'm_knock_door', 'm_take_picture', 'm_cell_phone_textmessage', 'm_crouch_idle'
  ],
};
// "Blood Splatter" by ExileGL (CC0 1.0, https://opengameart.org/content/blood-splatter), mirrored on GitHub.
export const BLOOD = { title: 'Blood Splatter', author: 'ExileGL', license: 'CC0-1.0', source: 'https://opengameart.org/content/blood-splatter',
  mirror: 'https://github.com/KurtBliss/Karnage', commit: '8dfaa32779482b0de927ddcf46be0a18ce523c09', file: 'assets/opengameart/ExileGL/ExileGL__blood.png' };
export const maskDir = (mask) => join(OUT, `mask-${mask.id}`);
const FILES = [
  'LICENSE.md',
  ...Object.entries(AVATARS).flatMap(([name, prefix]) => [`Assets/Avatars/Adults/${name}/Export/${name}.fbx`,
    ...['body', 'head'].flatMap(part => ['color', 'normal', 'specular'].map(map => `Assets/Avatars/Adults/${name}/Textures/${prefix}_${part}_${map}.tga`))]),
  ...Object.entries(ANIMATIONS).flatMap(([kind, names]) => names.map(n => `Assets/Animations/all_animations_max_motextr_${kind}/${n}.max.fbx`)),
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = join(dirname(new URL(import.meta.url).pathname), 'sources.json');
  const known = existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')).files : {};
  const files = {};
  const mask = JSON.parse(readFileSync(join(dirname(new URL(import.meta.url).pathname), 'mask.json'), 'utf8'));
  const MASK_RAW = `${mask.mirror.replace('github.com', 'raw.githubusercontent.com')}/${mask.commit}/${mask.dir}/`;
  const BLOOD_RAW = `${BLOOD.mirror.replace('github.com', 'raw.githubusercontent.com')}/${BLOOD.commit}/`;
  const sources = [...FILES.map(path => [path, RAW + encodeURI(path), join(OUT, path.split('/').pop())]),
    ...mask.files.map(f => [`mask-${mask.id}/${f}`, MASK_RAW + encodeURI(f), join(maskDir(mask), f)]),
    [`blood/${BLOOD.file.split('/').pop()}`, BLOOD_RAW + encodeURI(BLOOD.file), join(OUT, 'blood', BLOOD.file.split('/').pop())]];
  for (const [path, url, local] of sources) {
    mkdirSync(dirname(local), { recursive: true });
    if (!existsSync(local)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      writeFileSync(local, Buffer.from(await response.arrayBuffer()));
    }
    const sha256 = createHash('sha256').update(readFileSync(local)).digest('hex');
    if (known[path] && known[path] !== sha256) throw new Error(`${path}: checksum ${sha256} differs from sources.json`);
    files[path] = sha256;
    console.log(sha256.slice(0, 12), path);
  }
  writeFileSync(record, JSON.stringify({ library: 'Microsoft Rocketbox Avatar Library', repository: 'https://github.com/microsoft/Microsoft-Rocketbox',
    commit: COMMIT, license: 'MIT', mask: { title: mask.title, author: mask.author, mirror: mask.mirror, commit: mask.commit, license: mask.license },
    blood: { title: BLOOD.title, author: BLOOD.author, mirror: BLOOD.mirror, commit: BLOOD.commit, license: BLOOD.license }, files }, null, 2) + '\n');
}

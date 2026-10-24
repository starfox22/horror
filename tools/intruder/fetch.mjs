// Downloads the intruder's sources from the Microsoft Rocketbox Avatar Library (MIT) into assets-src/intruder/:
// the avatar "Male_Adult_20" (FBX + TGA textures) and the animations the game uses. Pinned to one commit; every file is
// checked against its SHA-256 once recorded in sources.json (first run records them).
// Usage: node tools/intruder/fetch.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const COMMIT = '0943055db6ec570bcef9f2c8b41c9e5467c808f9';
export const OUT = 'assets-src/intruder';
const RAW = `https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/${COMMIT}/`;
const AVATAR = 'Assets/Avatars/Adults/Male_Adult_20/';
// Animations: in-place loops ('xy': horizontal motion extracted) and standing actions ('static').
export const ANIMATIONS = {
  xy: ['m_walk_slow_01', 'm_walk_slow_02', 'm_walk_neutral_01', 'm_run_neutral_01', 'm_walk_start', 'm_walk_stop', 'm_crouch_in', 'm_crouch_out'],
  static: ['m_idle_breathe_01', 'm_idle_breathe_02', 'm_idle_look_around_01', 'm_idle_look_around_02', 'm_idle_neutral_01',
    'm_listen_door', 'm_try_door_inwards', 'm_knock_door', 'm_take_picture', 'm_cell_phone_textmessage', 'm_crouch_idle'
  ],
};
const FILES = [
  'LICENSE.md',
  `${AVATAR}Export/Male_Adult_20.fbx`,
  ...['body', 'head'].flatMap(part => ['color', 'normal', 'specular'].map(map => `${AVATAR}Textures/m027_${part}_${map}.tga`)),
  ...Object.entries(ANIMATIONS).flatMap(([kind, names]) => names.map(n => `Assets/Animations/all_animations_max_motextr_${kind}/${n}.max.fbx`)),
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = join(dirname(new URL(import.meta.url).pathname), 'sources.json');
  const known = existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')).files : {};
  const files = {};
  for (const path of FILES) {
    const local = join(OUT, path.split('/').pop());
    mkdirSync(dirname(local), { recursive: true });
    if (!existsSync(local)) {
      const response = await fetch(RAW + encodeURI(path));
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      writeFileSync(local, Buffer.from(await response.arrayBuffer()));
    }
    const sha256 = createHash('sha256').update(readFileSync(local)).digest('hex');
    if (known[path] && known[path] !== sha256) throw new Error(`${path}: checksum ${sha256} differs from sources.json`);
    files[path] = sha256;
    console.log(sha256.slice(0, 12), path);
  }
  writeFileSync(record, JSON.stringify({ library: 'Microsoft Rocketbox Avatar Library', repository: 'https://github.com/microsoft/Microsoft-Rocketbox',
    commit: COMMIT, license: 'MIT', files }, null, 2) + '\n');
}

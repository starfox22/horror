// Downloads the source model (the Sketchfab glTF zip the owner attached to a GitHub release of this repo)
// and unpacks it into assets-src/modern_apartment/ (git-ignored).
// Usage: node tools/fetch-source.mjs            (cloud sessions: the agent proxy authenticates api.github.com)
//        GITHUB_TOKEN=... node tools/fetch-source.mjs   (anywhere else: a token that can read this private repo)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const REPO = 'starfox22/horror';
const ASSET = 'modern_apartment2.zip';
const OUT = 'assets-src/modern_apartment';

const headers = { 'User-Agent': 'horror-asset-fetch' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

// curl is used instead of fetch() because it follows the cloud proxy settings everywhere.
const curl = (url, accept, out) => execFileSync('curl', ['-sSfL', '-H', `Accept: ${accept}`,
  ...Object.entries(headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`]), ...(out ? ['-o', out] : []), url]);

const releases = JSON.parse(curl(`https://api.github.com/repos/${REPO}/releases`, 'application/vnd.github+json'));
const asset = releases.flatMap(r => r.assets).find(a => a.name === ASSET);
if (!asset) throw new Error(`${ASSET} not found in any release of ${REPO}`);
mkdirSync('assets-src', { recursive: true });
const zip = `assets-src/${ASSET}`;
if (!existsSync(zip)) {
  console.log(`downloading ${ASSET} (${(asset.size / 1e6).toFixed(0)} MB)`);
  curl(`https://api.github.com/repos/${REPO}/releases/assets/${asset.id}`, 'application/octet-stream', zip);
}
mkdirSync(OUT, { recursive: true });
execFileSync('unzip', ['-q', '-o', zip, '-d', OUT]);
writeFileSync(`${OUT}/.source`, `${REPO} release asset ${asset.id} ${ASSET}\n`);
console.log(`unpacked to ${OUT}`);

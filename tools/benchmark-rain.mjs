// CPU microbenchmark only: no canvas uploads, engine rendering or GPU work.
// Run from the repository root: node tools/benchmark-rain.mjs [OUTPUT_JSON]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
const scratch = new URL('../work/', import.meta.url);
await mkdir(scratch, { recursive: true });
const baselineFile = new URL('rain-0.10.js', scratch);
const { stdout: baselineSource } = await promisify(execFile)('git', ['show', '7c8af57a2a0e2962483f51fd538184418a7b7410:src/rain.js'], { cwd: new URL('../', import.meta.url) });
await writeFile(baselineFile, baselineSource);
const { Rain: Baseline } = await import(baselineFile.href);
import { Rain as Current } from '../src/rain.js';
import { performance } from 'node:perf_hooks';
const savedRandom = Math.random;
function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function benchmark(Class, hz = 20) {
  Math.random = seeded(1234);
  const rain = Object.create(Class.prototype);
  Object.assign(rain, { drops: [], timer: 0, rainHz: hz, lightning() {}, draw() { this.uploads++; }, uploads: 0 });
  for (let i = 0; i < 700; i++) rain.spawn(true);
  for (let k = 0; k < 4; k++) rain.merge(rain.drops);
  const start = performance.now();
  for (let frame = 0; frame < 1200; frame++) rain.update(1 / 120);
  return { cpuMs: performance.now() - start, uploads: rain.uploads, drops: rain.drops.length };
}
const results = { method: 'Node CPU-only wet-glass simulation, deterministic seed, 10 simulated seconds at120Hz; canvas draw/upload stubbed; excludes engine/GPU throughput', baseline: [], high: [], medium: [], low: [] };
try {
  benchmark(Baseline); benchmark(Current);
  for (let trial = 0; trial < 5; trial++) {
    results.baseline.push(benchmark(Baseline));
    results.high.push(benchmark(Current, 20));
    results.medium.push(benchmark(Current, 15));
    results.low.push(benchmark(Current, 10));
  }
} finally { Math.random = savedRandom; }
for (const name of ['baseline', 'high', 'medium', 'low']) {
  const sorted = results[name].map(sample => sample.cpuMs).sort((a,b) => a-b);
  results[name + 'MedianMs'] = sorted[Math.floor(sorted.length / 2)];
}
console.log(JSON.stringify(results, null, 2));
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(results, null, 2));

// Turns the Vite build (dist/) into dist-artifact/ for publishing as a claude.ai artifact: the host wraps the page in
// its own <html>/<head>/<body>, so the page keeps only its title, links and scripts; every other file is copied as is.
// Prints the list of supporting files to pass to the Artifact tool's `files` (with `root: dist-artifact`).
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';

const SRC = 'dist', OUT = 'dist-artifact';
rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });
const html = readFileSync(`${SRC}/index.html`, 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1].replace(/<meta[^>]*>\s*/g, '');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
writeFileSync(`${OUT}/index.html`, `${head.trim()}\n${body.trim()}\n`);
const files = readdirSync(OUT, { recursive: true }).filter(f => f !== 'index.html' && statSync(`${OUT}/${f}`).isFile());
const total = files.reduce((n, f) => n + statSync(`${OUT}/${f}`).size, 0);
console.log(JSON.stringify(files.map(f => ({ path: f }))));
console.error(`${files.length} supporting files, ${(total / 1e6).toFixed(1)} MB`);

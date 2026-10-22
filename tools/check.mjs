import {readdir, readFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const js = path.join(root, 'public/assets/js');
let checked = 0;
for (const name of await readdir(js)) {
  if (!/\.(m?js)$/.test(name)) continue;
  const file = path.join(js, name);
  const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) throw new Error(`Import externo: ${name} → ${match[1]}`);
    await access(path.resolve(js, match[1].split('?')[0]));
  }
  checked++;
}
const manifest = JSON.parse(await readFile(path.join(root, 'public/assets/img/umbral-demo/assets.json'), 'utf8'));
let assets = 0;
async function visit(value) {
  if (typeof value === 'string' && /\.(png|gif|webp)$/.test(value)) {
    await access(path.join(root, 'public/assets/img/umbral-demo', value)); assets++;
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) await visit(child);
  }
}
await visit(manifest);
const {ENEMY_SAMPLES} = await import('../public/assets/js/umbral-enemy-audio.mjs');
const {MUSIC_TRACKS} = await import('../public/assets/js/umbral-music.mjs');
for (const sample of ENEMY_SAMPLES) await access(path.join(root, `public/assets/audio/umbral/enemies/${sample}.mp3`));
for (const track of MUSIC_TRACKS) await access(path.join(root, 'public/assets/audio/umbral/music', track));
const html = await readFile(path.join(root, 'public/index.html'), 'utf8');
if (/<\?php|<\?=|(?:src|href)=["']https?:\/\/|data-ranked-csrf|data-player-id/.test(html)) throw new Error('La entrada debe ser HTML local y autónomo.');
console.log(`${checked} módulos válidos · ${assets} referencias de imagen resueltas · ${ENEMY_SAMPLES.length} sonidos de enemigos · ${MUSIC_TRACKS.length} canciones.`);

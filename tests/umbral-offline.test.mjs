import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalRecords, RECORDS_KEY, compareRecords, MAX_RECORDS} from '../public/assets/js/umbral-local-records.mjs';
import {createTutorialPreferences} from '../public/assets/js/umbral-tutorial.mjs';
import {createStaticServer} from '../tools/serve.mjs';

const storage = () => { const data = new Map(); return {getItem: key => data.get(key), setItem: (key, value) => data.set(key, value)}; };
const state = (changes = {}) => ({mapId: 'cuenca', phase: 'playing', time: 20, wave: 4, clearedWave: 3, kills: 30, ...changes});

test('local checkpoints replace a run, survive reload and never count a death twice', () => {
  const cache = storage(), records = new LocalRecords({storage: cache, id: () => 'one', now: () => 10});
  records.begin('cuenca', 'Ares');
  records.checkpoint(state()); records.checkpoint(state()); records.finish(state(), 'dead'); records.unload(state());
  const reloaded = new LocalRecords({storage: cache}).read();
  assert.equal(reloaded.length, 1); assert.equal(reloaded[0].kills, 30);
  assert.equal(reloaded[0].waves, 3); assert.equal(reloaded[0].name, 'Ares'); assert.equal(reloaded[0].status, 'dead');
  assert.equal(records.checkpoint(state({kills: 99})), false);
});

test('training and all boss demos including wave 11 never alter real records', () => {
  const records = new LocalRecords({storage: storage()});
  assert.equal(records.begin('tutorial'), false); assert.equal(records.begin('titan-demo'), false);
  records.begin('cuenca'); records.checkpoint(state()); const before = records.read();
  for (const practice of [state({training: {}}), ...['cuenca','corona','rio'].map(mapId => state({mapId, mode: 'boss-demo', wave: 11, kills: 500}))]) {
    records.observe(practice); assert.equal(records.checkpoint(practice), false); assert.equal(records.finish(practice), false); records.unload(practice);
  }
  assert.deepEqual(records.read(), before);
});

test('records merge separate tabs, sort by cleared waves then kills, and retain 500', () => {
  const cache = storage();
  const a = new LocalRecords({storage: cache, id: () => 'a', now: () => 1});
  const b = new LocalRecords({storage: cache, id: () => 'b', now: () => 2});
  a.begin('cuenca'); b.begin('cuenca'); a.finish(state()); b.finish(state({clearedWave: 4, kills: 10}));
  assert.equal(a.read().length, 2); assert.equal(a.read().sort(compareRecords)[0].id, 'b');
  const base = a.read()[0];
  cache.setItem(RECORDS_KEY, JSON.stringify({version: 1, runs: Array.from({length: 600}, (_, i) => ({...base, id: String(i), startedAt: i}))}));
  assert.equal(new LocalRecords({storage: cache}).read().length, MAX_RECORDS);
});

test('blocked or malformed storage does not stop gameplay, records stay in memory', () => {
  for (const cache of [null, {getItem(){throw Error();},setItem(){throw Error();}}, {getItem(){return '{';},setItem(){throw Error();}}]) {
    const records = new LocalRecords({storage: cache});
    assert.equal(records.begin('cuenca'), true); records.finish(state());
    assert.equal(records.read()[0].kills, 30); assert.equal(records.persisted, false);
  }
});

test('tutorial first visit and completion persist locally, also work with blocked storage', async () => {
  const cache = storage(), prefs = createTutorialPreferences({storage: cache});
  assert.deepEqual(await prefs.load(), {seen: false, completed: false});
  await prefs.decide(); assert.equal((await createTutorialPreferences({storage: cache}).load()).seen, true);
  await prefs.complete(); assert.deepEqual(await createTutorialPreferences({storage: cache}).load(), {seen: true, completed: true});
  const blocked = createTutorialPreferences({storage: {getItem(){throw Error();},setItem(){throw Error();}}});
  await blocked.complete(); assert.equal((await blocked.load()).completed, true);
});

test('a full storage quota keeps newer snapshots in memory instead of reverting to old totals', () => {
  const cache = storage(), records = new LocalRecords({storage: cache});
  records.begin('cuenca'); records.checkpoint(state());
  cache.setItem = () => { throw new Error('QuotaExceededError'); };
  records.finish(state({kills: 80}), 'dead');
  assert.equal(records.read()[0].kills, 80); assert.equal(records.persisted, false);
});

test('local server serves modules and music ranges, refuses writes and private files', async t => {
  const server = createStaticServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /UMBRAL/);
  const module = await fetch(base + '/assets/js/umbral-core.mjs'); assert.match(module.headers.get('content-type'), /javascript/); await module.arrayBuffer();
  const song = await fetch(base + '/assets/audio/umbral/music/soundtrack-1.mp3', {headers: {Range: 'bytes=0-63'}});
  assert.equal(song.status, 206); assert.equal((await song.arrayBuffer()).byteLength, 64);
  for (const path of ['/package.json', '/tools/router.php', '/.env', '/%2e%2e%2ftools/router.php']) assert.ok((await fetch(base + path)).status >= 400);
  assert.equal((await fetch(base, {method: 'POST'})).status, 405);
});

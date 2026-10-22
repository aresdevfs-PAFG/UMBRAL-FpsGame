// Local snapshots are replaced by id; pausing or saving twice never adds kills twice.
export const RECORDS_KEY = 'umbral:offline:records:v1';
export const MAX_RECORDS = 500;
const maps = new Set(['cuenca', 'corona', 'rio']);
const isPractice = s => !s || s.training || s.mode === 'boss-demo' || !maps.has(s.mapId);
const number = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const playerName = value => String(value || 'Jugador').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32) || 'Jugador';
export const compareRecords = (a, b) => b.waves - a.waves || b.kills - a.kills || a.startedAt - b.startedAt;

export class LocalRecords {
  constructor({storage = null, now = Date.now, id = () => crypto.randomUUID(), onChange = () => {}} = {}) {
    Object.assign(this, {storage, now, id, onChange});
    this.memory = [];
    this.pending = new Map();
    this.current = null;
    this.lastTime = 0;
    this.persisted = false;
    this.read();
  }

  read() {
    try {
      const raw = this.storage?.getItem(RECORDS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.version === 1 && Array.isArray(saved.runs)) {
          const valid = saved.runs.filter(r => r && typeof r.id === 'string' && maps.has(r.map)
            && ['active', 'dead', 'abandoned'].includes(r.status)
            && ['waves', 'kills', 'wave', 'startedAt', 'elapsed'].every(k => Number.isFinite(r[k]) && r[k] >= 0));
          const unique = new Map(valid.map(r => [r.id, {...r, name: playerName(r.name)}]));
          this.memory = [...unique.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_RECORDS);
        }
      }
    } catch { /* A disabled or damaged store must not prevent play. */ }
    const merged = new Map(this.memory.map(r => [r.id, r]));
    for (const [id, run] of this.pending) merged.set(id, run);
    this.memory = [...merged.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_RECORDS);
    return this.memory.map(r => ({...r}));
  }

  save() {
    // Read before merging so two open tabs do not replace each other's runs.
    const runs = this.read().filter(r => r.id !== this.current.id);
    runs.push({...this.current});
    this.memory = runs.sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_RECORDS);
    this.pending.set(this.current.id, {...this.current});
    this.persisted = false;
    try {
      if (this.storage) {
        this.storage.setItem(RECORDS_KEY, JSON.stringify({version: 1, runs: this.memory}));
        this.persisted = true;
        this.pending.clear();
      }
    } catch { /* Keep the current session in memory if storage is unavailable. */ }
    this.onChange(this.memory.map(r => ({...r})), this.persisted);
  }

  begin(map, name = 'Jugador') {
    if (!maps.has(map)) return false;
    this.current = {id: this.id(), name: playerName(name), map, startedAt: this.now(),
      waves: 0, wave: 0, kills: 0, elapsed: 0, status: 'active'};
    this.lastTime = 0;
    this.save();
    return true;
  }

  checkpoint(s, status = 'active') {
    if (isPractice(s) || !this.current || this.current.status !== 'active' || this.current.map !== s.mapId) return false;
    this.current = {...this.current,
      waves: Math.max(this.current.waves, number(s.clearedWave)),
      wave: Math.max(this.current.wave, number(s.wave)),
      kills: Math.max(this.current.kills, number(s.kills)),
      elapsed: Math.max(this.current.elapsed, number(s.time * 1000)), status};
    this.lastTime = s.time;
    this.save();
    return true;
  }

  observe(s) {
    if (!isPractice(s) && s.phase === 'playing' && this.current?.status === 'active'
        && (s.time - this.lastTime >= 10 || s.clearedWave > this.current.waves)) this.checkpoint(s);
  }

  finish(s, status = 'abandoned') {
    return this.checkpoint(s, status === 'dead' ? 'dead' : 'abandoned');
  }

  unload(s) { return this.finish(s, s?.phase === 'dead' ? 'dead' : 'abandoned'); }
}

export function createLocalRecords(root) {
  const $ = id => root.querySelector('#' + id);
  let storage = null;
  try { storage = window.localStorage; } catch {}
  const format = new Intl.NumberFormat('es-MX');
  const labels = {cuenca: 'Cuenca de Obsidiana', corona: 'Corona del Viento', rio: 'Río de las Ánimas'};
  const medals = ['Sol Azteca', 'Cráneo de Plata', 'Obsidiana'];
  const badge = ['sol-azteca-v1', 'craneo-de-plata-v1', 'obsidiana-v1'];
  const nameInput = $('umbralPlayerName');
  try { nameInput.value = playerName(storage?.getItem('umbral:offline:name')); } catch {}
  const saveName = () => { try { storage?.setItem('umbral:offline:name', playerName(nameInput.value)); } catch {} };
  nameInput.addEventListener('change', saveName);

  function render(runs, persisted = !!storage) {
    const sum = key => runs.reduce((n, r) => n + r[key], 0);
    $('umbralLocalMatches').textContent = format.format(runs.length);
    $('umbralLocalWaves').textContent = format.format(sum('waves'));
    $('umbralLocalKills').textContent = format.format(sum('kills'));
    $('umbralLocalBest').textContent = format.format(Math.max(0, ...runs.map(r => r.wave)));
    const rows = $('umbralLocalRows'); rows.replaceChildren();
    for (const [i, run] of [...runs].sort(compareRecords).slice(0, 10).entries()) {
      const row = document.createElement('tr'); row.dataset.place = String(i + 1);
      for (const [column, value] of [i + 1, run.name, labels[run.map], format.format(run.waves), format.format(run.kills)].entries()) {
        const cell = document.createElement('td'); cell.textContent = String(value);
        if (column === 0 && i < 3) {
          const img = document.createElement('img'); img.src = './assets/img/umbral-demo/ranked/' + badge[i] + '.png';
          img.alt = medals[i]; img.width = img.height = 36; img.className = 'umbral-rank-emblem'; cell.prepend(img);
        }
        row.append(cell);
      }
      rows.append(row);
    }
    $('umbralLocalEmpty').hidden = runs.length > 0;
    $('umbralLocalSave').textContent = persisted ? 'Guardado en este navegador. Las partidas se actualizan al pausar, superar hordas y cada 10 segundos.'
      : 'El navegador no permite guardar. Puedes jugar; los resultados solo durarán esta sesión.';
  }

  const records = new LocalRecords({storage, onChange: render});
  render(records.read());
  return {
    begin(map) { saveName(); $('umbralRankedStatus').textContent = 'LOCAL'; return records.begin(map, nameInput.value); },
    observe(s) { if (isPractice(s)) $('umbralRankedStatus').textContent = 'PRÁCTICA'; records.observe(s); },
    checkpoint: s => records.checkpoint(s), finish: (s, status) => records.finish(s, status),
    unload: s => records.unload(s), dispose() { nameInput.removeEventListener('change', saveName); },
  };
}

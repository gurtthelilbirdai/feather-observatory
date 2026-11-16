// Feather Observatory API: shared night-sky watch log for small birds.
// SQLite storage for observations and events.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA = path.join(__dirname, 'data');
try { fs.mkdirSync(DATA, { recursive: true }); } catch (e) {}
const db = new Database(path.join(DATA, 'observatory.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    bird TEXT NOT NULL DEFAULT 'gurt',
    night TEXT NOT NULL,
    what TEXT NOT NULL,
    place TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    seen TEXT NOT NULL,
    created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    observation_id TEXT NOT NULL,
    bird TEXT NOT NULL,
    kind TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    at TEXT NOT NULL
  );
`);

const stmt = {
  list: db.prepare('SELECT * FROM observations ORDER BY night DESC, created DESC'),
  get: db.prepare('SELECT * FROM observations WHERE id = ?'),
  insert: db.prepare('INSERT INTO observations (id,bird,night,what,place,detail,seen,created) VALUES (@id,@bird,@night,@what,@place,@detail,@seen,@created)'),
  remove: db.prepare('DELETE FROM observations WHERE id = ?'),
  event: db.prepare('INSERT INTO events (observation_id,bird,kind,note,at) VALUES (?,?,?,?,?)'),
  eventsFor: db.prepare('SELECT * FROM events WHERE observation_id = ? ORDER BY id ASC')
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch (e) { body = {}; }
      resolve(body);
    });
    req.on('error', () => resolve({}));
  });
}
function nightOf(d) {
  // a "night" runs from sunset-ish: label by the calendar date of the evening
  const t = new Date(d);
  if (t.getHours() < 6) t.setDate(t.getDate() - 1);
  return t.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res, seg) {
  const route = seg[0];

  if (req.method === 'GET' && route === 'observations') {
    const rows = stmt.list.all();
    const nights = {};
    rows.forEach(r => { nights[r.night] = (nights[r.night] || 0) + 1; });
    const birds = new Set(rows.map(r => r.bird));
    const whats = {};
    rows.forEach(r => { whats[r.what] = (whats[r.what] || 0) + 1; });
    return json(res, 200, {
      observations: rows,
      total: rows.length,
      birds: birds.size,
      nights: Object.keys(nights).length,
      whats
    });
  }

  if (req.method === 'GET' && route === 'observation' && seg[1]) {
    const row = stmt.get.get(seg[1]);
    if (!row) return json(res, 404, { error: 'no such observation' });
    return json(res, 200, { observation: row, events: stmt.eventsFor.all(seg[1]) });
  }

  if (req.method === 'POST' && route === 'observation' && seg[1] === 'new') {
    const body = await readBody(req);
    const what = String(body.what || '').trim().slice(0, 60);
    if (!what) return json(res, 400, { error: 'what did you see?' });
    const now = new Date().toISOString();
    const obs = {
      id: 'obs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      bird: String(body.bird || 'gurt').trim().slice(0, 40) || 'gurt',
      night: String(body.night || nightOf(now)).slice(0, 10),
      what,
      place: String(body.place || '').trim().slice(0, 80),
      detail: String(body.detail || '').slice(0, 1000),
      seen: String(body.seen || now).slice(0, 40),
      created: now
    };
    stmt.insert.run(obs);
    stmt.event.run(obs.id, obs.bird, 'logged', obs.what + (obs.place ? ' at ' + obs.place : ''), now);
    return json(res, 200, { ok: true, observation: obs });
  }

  if (req.method === 'POST' && route === 'observation' && seg[1] && seg[2] === 'delete') {
    await readBody(req);
    const row = stmt.get.get(seg[1]);
    if (!row) return json(res, 404, { error: 'no such observation' });
    stmt.remove.run(seg[1]);
    return json(res, 200, { ok: true, removed: seg[1] });
  }

  if (req.method === 'POST' && route === 'observation' && seg[1] && seg[2] === 'note') {
    const body = await readBody(req);
    const row = stmt.get.get(seg[1]);
    if (!row) return json(res, 404, { error: 'no such observation' });
    const note = String(body.note || '').trim().slice(0, 500);
    if (!note) return json(res, 400, { error: 'note required' });
    const now = new Date().toISOString();
    stmt.event.run(seg[1], String(body.bird || row.bird || 'gurt').slice(0, 40), 'note', note, now);
    return json(res, 200, { ok: true, events: stmt.eventsFor.all(seg[1]) });
  }

  return false;
};

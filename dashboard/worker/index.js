// Home HQ backend: serves the built dashboard and a small JSON API.
//   /api/state     lists (shopping, photos) + family config                D1
//   /api/calendar  Google Calendar ICS feeds + events added on the frame    ICS → D1 cache
//   /api/weather   Open-Meteo forecast                                      → D1 cache
//   /api/home      Home Assistant states, controls and camera snapshots     HA REST API
//   /api/photos    upload / serve / favourite / delete                      R2 + D1
// Every /api route needs the dashboard key: open any page once with ?key=<DASHBOARD_KEY> and it is
// kept in a cookie (the kiosk WebView keeps cookies across reboots).
import RAW from '../family.json';
import { parseIcs } from './ics.js';

const DAY_MS = 864e5;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// ------------------------------------------------------------------ config
function hexRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

const CFG = (function () {
  const tz = RAW.timezone || 'UTC';
  const people = (RAW.people || []).map((p) => {
    const [r, g, b] = hexRgb(p.color || '#888888');
    const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
    return { id: p.id, name: p.name, color: p.color, rgb: r + ' ' + g + ' ' + b, ink: light ? '#111111' : '#FFFFFF', ha: p.ha };
  });
  const shop = RAW.shopping || {};
  const cats = shop.categories || ['Other'];
  const stores = shop.stores && shop.stores.length ? shop.stores : [{ id: 'grocer', name: 'Groceries' }];
  const catOrder = { all: cats };
  stores.forEach((s) => { catOrder[s.id] = (shop.storeOrder && shop.storeOrder[s.id]) || cats; });
  const catalog = [];
  Object.keys(shop.catalog || {}).forEach((cat) => shop.catalog[cat].forEach((name) => catalog.push([name, cat])));

  const home = RAW.home && RAW.home.url ? RAW.home : null;
  const rooms = [], devices = [];
  if (home) (home.rooms || []).forEach((r) => {
    const id = r.id || slug(r.name);
    rooms.push({ id, name: r.name });
    (r.devices || []).forEach((d) => devices.push({ entity: d.entity, name: d.name, room: id, garage: !!d.garage }));
  });
  const alerts = (home && home.alerts) || {};
  const bins = RAW.bins && RAW.bins.every && RAW.bins.every.length ? RAW.bins : null;
  const warnings = RAW.warnings && RAW.warnings.region ? RAW.warnings : null;
  const display = RAW.display || {};
  return {
    tz, people, bins, warnings, display,
    location: RAW.location, stores, catOrder, catalog, usuals: shop.usuals || [],
    home, rooms, devices,
    scenes: home ? (home.scenes || []).map((s) => ({ id: s.entity, name: s.name, icon: s.icon || 'bolt' })) : [],
    cameras: home ? (home.cameras || []).map((c) => ({ id: c.entity, name: c.name })) : [],
    alerts,
  };
})();

// ------------------------------------------------------------------ helpers
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function bad(msg, status) { return json({ error: msg }, status || 400); }
function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || 200) : ''; }
async function body(req) { try { return await req.json(); } catch (e) { return {}; } }

// Local calendar day in the family's time zone: { ymd: '2026-10-16', dow: 5 } (0 = Sunday)
function localDay(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CFG.tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .formatToParts(new Date(ms == null ? Date.now() : ms));
  const get = (t) => parts.find((p) => p.type === t).value;
  return { ymd: get('year') + '-' + get('month') + '-' + get('day'), dow: WEEKDAYS.indexOf(get('weekday').slice(0, 3).toLowerCase()) };
}

async function cached(env, key, ttlMs, compute) {
  const row = await env.DB.prepare('SELECT value, expires FROM cache WHERE key = ?').bind(key).first();
  if (row && row.expires > Date.now()) return JSON.parse(row.value);
  try {
    const value = await compute();
    await env.DB.prepare('INSERT INTO cache (key, value, expires) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires = excluded.expires')
      .bind(key, JSON.stringify(value), Date.now() + ttlMs).run();
    return value;
  } catch (err) {
    if (row) return JSON.parse(row.value); // serve stale rather than nothing
    throw err;
  }
}

// ------------------------------------------------------------------ auth
const enc = new TextEncoder();
function sameKey(a, b) {
  if (!a || !b) return false;
  const x = enc.encode(a), y = enc.encode(b);
  return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
}
function cookieKey(req) {
  const m = /(?:^|;\s*)hq=([^;]+)/.exec(req.headers.get('cookie') || '');
  return m ? decodeURIComponent(m[1]) : null;
}

// ------------------------------------------------------------------ bins
// Collection dates come from the council's rotation in family.json ("every"), with bank-holiday
// changes listed in "moved" (usual date -> actual date, or null when it is skipped).
function addYmd(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
async function binsState(env) {
  const B = CFG.bins;
  if (!B) return null;
  const today = localDay().ymd, until = addYmd(today, 42), moved = B.moved || {}, by = {};
  B.every.forEach((x) => {
    const step = 7 * (x.weeks || 1);
    let d = x.from;
    if (d < today) d = addYmd(d, Math.ceil((Date.parse(today) - Date.parse(d)) / 864e5 / step) * step - step);
    for (; d <= until; d = addYmd(d, step)) {
      const actual = Object.prototype.hasOwnProperty.call(moved, d) ? moved[d] : d;
      if (!actual || actual < today) continue;
      (by[actual] = by[actual] || []).push(x.bin);
    }
  });
  const next = Object.keys(by).sort().slice(0, 4).map((date) => ({ date, bins: by[date] }));
  const out = await env.DB.prepare('SELECT value FROM cache WHERE key = ?').bind('bins-out').first();
  return { types: B.types || {}, next, out: out ? JSON.parse(out.value) : null };
}
// "They're out" for one collection date; out: false takes it back.
async function setBinsOut(env, b) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  if (!date) return bad('date required');
  if (b.out === false) await env.DB.prepare('DELETE FROM cache WHERE key = ?').bind('bins-out').run();
  else await env.DB.prepare('INSERT INTO cache (key, value, expires) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires = excluded.expires')
    .bind('bins-out', JSON.stringify({ date, at: Date.now() }), Date.now() + 7 * 864e5).run();
  return json(await binsState(env));
}

// ------------------------------------------------------------------ frames
// Each wall display checks in every 5 minutes; the list shows when one has gone quiet.
async function frameBeat(env, b) {
  const id = str(b.id, 40);
  if (!/^[a-z0-9]{6,40}$/.test(id)) return bad('id required');
  const row = {
    id, name: str(b.name, 40) || 'Frame', version: str(b.version, 20), build: str(b.build, 40), kiosk: str(b.kiosk, 20),
    rssi: typeof b.rssi === 'number' ? Math.round(b.rssi) : null, model: str(b.model, 60), android: str(b.android, 10),
    loaded: typeof b.loaded === 'number' ? b.loaded : null, seen: Date.now(),
  };
  await env.DB.prepare('INSERT INTO cache (key, value, expires) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires = excluded.expires')
    .bind('frame:' + id, JSON.stringify(row), Date.now() + 30 * 864e5).run();
  return json({ ok: true });
}
async function listFrames(env) {
  const rows = await env.DB.prepare("SELECT value FROM cache WHERE key LIKE 'frame:%' AND expires > ?").bind(Date.now()).all();
  return rows.results.map((r) => JSON.parse(r.value)).sort((a, b) => (a.name < b.name ? -1 : 1));
}

// ------------------------------------------------------------------ state (shopping, photos, bins)
async function getState(env) {
  const [groceries, photos, bins] = await Promise.all([
    env.DB.prepare('SELECT id, name, cat, qty, store, note, done FROM groceries WHERE cleared = 0 ORDER BY updated_at').all(),
    env.DB.prepare('SELECT id, o, date, place, from_id, fav FROM photos ORDER BY date DESC').all(),
    binsState(env),
  ]);
  return {
    people: CFG.people.map((p) => ({ id: p.id, name: p.name, color: p.color, rgb: p.rgb, ink: p.ink, tracked: !!(p.ha && CFG.home) })),
    stores: CFG.stores, catOrder: CFG.catOrder, catalog: CFG.catalog, usuals: CFG.usuals,
    groceries: groceries.results.map((g) => Object.assign(g, { done: !!g.done })),
    photos: photos.results.map((p) => ({ id: p.id, o: p.o, date: p.date, place: p.place, from: p.from_id, fav: !!p.fav, tag: p.date })),
    hasHome: !!CFG.home,
    scenes: CFG.scenes, cameras: CFG.cameras,
    bins,
    // Minutes everyone known to Home Assistant must be away before the screen turns off (0 = never).
    awayOffMinutes: CFG.display.awayOffMinutes || 0,
  };
}

async function putGrocery(env, b) {
  const id = str(b.id, 64), name = str(b.name, 80);
  if (!id || !name) return bad('id and name required');
  const cat = str(b.cat, 40) || 'Other';
  const store = CFG.stores.some((s) => s.id === b.store) ? b.store : CFG.stores[0].id;
  const qty = Math.max(1, Math.min(99, parseInt(b.qty, 10) || 1));
  await env.DB.prepare(
    'INSERT INTO groceries (id, name, cat, qty, store, note, done, cleared, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET name = excluded.name, cat = excluded.cat, qty = excluded.qty, store = excluded.store, note = excluded.note, done = excluded.done, cleared = 0, updated_at = excluded.updated_at'
  ).bind(id, name, cat, qty, store, str(b.note, 120), b.done ? 1 : 0, Date.now()).run();
  return json({ ok: true });
}

async function clearGroceries(env, b) {
  const ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === 'string').slice(0, 500) : [];
  if (!ids.length) return json({ ok: true });
  const now = Date.now();
  await env.DB.batch(ids.map((id) => env.DB.prepare('UPDATE groceries SET cleared = ?, updated_at = ? WHERE id = ?').bind(b.cleared === false ? 0 : 1, now, id))
    .concat([env.DB.prepare('DELETE FROM groceries WHERE cleared = 1 AND updated_at < ?').bind(now - 30 * DAY_MS)]));
  return json({ ok: true });
}

// ------------------------------------------------------------------ calendar
// The calendar links are private (anyone holding one can read that calendar), so they live in the
// CALENDARS secret, which Cloudflare encrypts and never shows again, not in the deployed code.
// `calendars` in family.json still works for local development.
function calendarList(env) {
  if (env.CALENDARS) {
    try { return JSON.parse(env.CALENDARS); } catch (e) { throw new Error('CALENDARS secret is not valid JSON'); }
  }
  return RAW.calendars || [];
}

const CAL_TTL_MS = 10 * 60e3;

// Fetch each calendar on its own. One bad link must not hide the others: a calendar that fails keeps
// the events it had last time and its error is reported (never its link) in the log, in the
// response and on the frame's Status panel.
async function refreshCalendars(env, prev) {
  const from = Date.now() - 45 * DAY_MS, to = Date.now() + 75 * DAY_MS;
  const all = CFG.people.map((p) => p.id);
  let list;
  try {
    list = calendarList(env);
    if (!Array.isArray(list)) throw new Error('CALENDARS must be a list [ … ]');
  } catch (e) {
    console.error('calendars: ' + e.message);
    return { events: prev ? prev.events : [], errors: [e.message], checked: Date.now() };
  }
  const results = await Promise.all(list.map(async (cal, i) => {
    const n = i + 1, notes = [];
    try {
      if (!cal || typeof cal.url !== 'string') throw new Error('no "url"');
      const wanted = [].concat(cal.people || []).indexOf('all') > -1 ? all : [].concat(cal.people || []);
      const unknown = wanted.filter((id) => all.indexOf(id) < 0);
      if (unknown.length) notes.push('Calendar ' + n + ': unknown people ' + unknown.join(', ') + ' (ids must match family.json)');
      const people = wanted.filter((id) => all.indexOf(id) > -1);
      const res = await fetch(cal.url.trim().replace(/^webcal:/, 'https:'), { headers: { 'user-agent': 'HomeHQ/1.0' } });
      if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 404 ? ' (link wrong, or reset in Google)' : ''));
      const text = await res.text();
      if (text.slice(0, 2000).indexOf('BEGIN:VCALENDAR') < 0) throw new Error('not an iCal feed (use "Secret address in iCal format")');
      const events = parseIcs(text, people.length ? people : all, from, to, 'c' + i + '-');
      console.log('calendar ' + n + ': ' + events.length + ' events');
      return { events, notes };
    } catch (e) {
      console.error('calendar ' + n + ': ' + e.message);
      const kept = prev ? prev.events.filter((ev) => ev.id.indexOf('c' + i + '-') === 0) : [];
      return { events: kept, notes: notes.concat(['Calendar ' + n + ': ' + e.message]) };
    }
  }));
  // The same invite on two people's calendars becomes one event with both of them.
  const byKey = new Map();
  results.forEach((r) => r.events.forEach((e) => {
    const k = e.key || e.id, prev = byKey.get(k);
    if (prev) e.people.forEach((p) => { if (prev.people.indexOf(p) < 0) prev.people.push(p); });
    else byKey.set(k, Object.assign({}, e, { people: e.people.slice() }));
  }));
  return {
    events: Array.from(byKey.values()).map((e) => { delete e.key; return e; }),
    errors: results.reduce((a, r) => a.concat(r.notes), []),
    checked: Date.now(),
  };
}

async function getCalendar(env) {
  const row = await env.DB.prepare("SELECT value, expires FROM cache WHERE key = 'calendar'").first();
  let feed = row ? JSON.parse(row.value) : null;
  if (Array.isArray(feed)) feed = { events: feed, errors: [], checked: 0 }; // saved by an older version
  if (!feed || row.expires <= Date.now()) {
    feed = await refreshCalendars(env, feed);
    await env.DB.prepare('INSERT INTO cache (key, value, expires) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires = excluded.expires')
      .bind('calendar', JSON.stringify(feed), Date.now() + CAL_TTL_MS).run();
  }
  const local = await env.DB.prepare('SELECT id, title, people, start, end FROM events WHERE end > ?').bind(Date.now() - 45 * DAY_MS).all();
  return {
    events: feed.events.concat(local.results.map((e) => ({
      id: e.id, title: e.title, people: JSON.parse(e.people), start: new Date(e.start).toISOString(), end: new Date(e.end).toISOString(), local: true,
    }))),
    errors: feed.errors, checked: feed.checked,
  };
}

async function addEvent(env, b) {
  const id = str(b.id, 64), title = str(b.title, 120);
  const start = +b.start, end = +b.end;
  const people = (Array.isArray(b.people) ? b.people : []).filter((id) => CFG.people.some((p) => p.id === id));
  if (!id || !title || !(end > start) || !people.length) return bad('id, title, people, start < end required');
  await env.DB.prepare('INSERT OR REPLACE INTO events (id, title, people, start, end, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, title, JSON.stringify(people), start, end, Date.now()).run();
  return json({ ok: true });
}

// ------------------------------------------------------------------ weather (Open-Meteo, no key)
function wxCond(code, isDay) {
  if (code <= 1) return isDay ? 'sun' : 'moon';
  if (code === 2) return 'partly';
  if (code === 3 || code === 45 || code === 48) return 'cloud';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return 'rain';
}
async function getWeather(env) {
  const [w, warnings] = await Promise.all([
    forecast(env).catch((err) => ({ error: err.message })),
    getWarnings(env).catch(() => []),
  ]);
  return Object.assign({}, w, { warnings });
}
async function forecast(env) {
  const loc = CFG.location;
  if (!loc) return { none: true };
  return cached(env, 'weather', 15 * 60e3, async () => {
    const q = new URLSearchParams({
      latitude: loc.lat, longitude: loc.lon, timezone: CFG.tz, forecast_days: '2',
      temperature_unit: loc.units === 'fahrenheit' ? 'fahrenheit' : 'celsius',
      wind_speed_unit: loc.units === 'fahrenheit' ? 'mph' : 'kmh',
      hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
      daily: 'temperature_2m_max,temperature_2m_min',
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m',
    });
    const res = await fetch('https://api.open-meteo.com/v1/forecast?' + q);
    if (!res.ok) throw new Error('weather: HTTP ' + res.status);
    const w = await res.json(), h = w.hourly;
    return {
      day: h.time[0].slice(0, 10), // index 0 = local midnight today; 48 hours
      units: loc.units === 'fahrenheit' ? 'fahrenheit' : 'celsius',
      t: h.temperature_2m.map(Math.round),
      p: h.precipitation_probability.map((x) => x || 0),
      c: h.weather_code.map((code, i) => wxCond(code, h.is_day[i])),
      hi: Math.round(w.daily.temperature_2m_max[0]), lo: Math.round(w.daily.temperature_2m_min[0]),
      feels: Math.round(w.current.apparent_temperature), humidity: w.current.relative_humidity_2m,
      wind: Math.round(w.current.wind_speed_10m), now: Math.round(w.current.temperature_2m),
    };
  });
}

// Met Office warnings for one region (family.json "warnings": { "region": "yh", "areas": [...] }),
// kept to those naming one of the areas. Times are UK local, as 'YYYY-MM-DDTHH:MM'.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function xmlText(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
}
function warnTime(hhmm, day, mon, year) {
  return year + '-' + String(MONTHS.indexOf(mon.toLowerCase()) + 1).padStart(2, '0') + '-' + day.padStart(2, '0') + 'T' + hhmm.slice(0, 2) + ':' + hhmm.slice(2);
}
async function getWarnings(env) {
  const W = CFG.warnings;
  if (!W) return [];
  return cached(env, 'warnings', 10 * 60e3, async () => {
    const res = await fetch('https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/' + encodeURIComponent(W.region));
    if (!res.ok) throw new Error('warnings: HTTP ' + res.status);
    const xml = await res.text(), want = (W.areas || []).map((a) => a.toLowerCase()), seen = {}, out = [];
    (xml.match(/<item>[\s\S]*?<\/item>/g) || []).forEach((item) => {
      const tag = (t) => { const m = new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>').exec(item); return m ? xmlText(m[1]) : ''; };
      const d = /^(Yellow|Amber|Red) warning of (.+?) affecting (.+?):\s*(.*?)\s+valid from (\d{4}) \w{3} (\d{1,2}) (\w{3}) to (\d{4}) \w{3} (\d{1,2}) (\w{3})/i.exec(tag('description'));
      if (!d) return;
      const areas = d[4].split(/,\s*/), mine = want.length ? areas.filter((a) => want.indexOf(a.toLowerCase()) > -1) : areas;
      if (!mine.length) return;
      const link = tag('link'), y = +((/date=(\d{4})/.exec(link) || [])[1] || new Date().getUTCFullYear());
      const from = warnTime(d[5], d[6], d[7], y);
      const to = warnTime(d[8], d[9], d[10], MONTHS.indexOf(d[10].toLowerCase()) < MONTHS.indexOf(d[7].toLowerCase()) ? y + 1 : y);
      const level = d[1].toLowerCase(), type = d[2].toLowerCase(), key = level + type + from + to;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ level, type, region: d[3], areas: mine, from, to, link });
    });
    const rank = { red: 0, amber: 1, yellow: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level] || (a.from < b.from ? -1 : 1));
  });
}

// ------------------------------------------------------------------ Home Assistant
function ha(env, path, init) {
  init = init || {};
  init.headers = Object.assign({ authorization: 'Bearer ' + env.HA_TOKEN, 'content-type': 'application/json' }, init.headers || {});
  return fetch(CFG.home.url.replace(/\/$/, '') + path, init);
}
async function haService(env, domain, service, data) {
  const res = await ha(env, '/api/services/' + domain + '/' + service, { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(domain + '.' + service + ': HTTP ' + res.status);
}

function deviceView(d, s) {
  const domain = d.entity.split('.')[0], a = (s && s.attributes) || {};
  const out = { id: d.entity, room: d.room, name: d.name || a.friendly_name || d.entity, offline: !s || s.state === 'unavailable' };
  const state = s ? s.state : 'unavailable';
  if (domain === 'lock') return Object.assign(out, { type: 'lock', locked: state === 'locked' });
  if (domain === 'cover' && (d.garage || a.device_class === 'garage' || a.device_class === 'gate')) {
    return Object.assign(out, { type: 'garage', state: ['open', 'opening', 'closing'].indexOf(state) > -1 ? state : 'closed' });
  }
  if (domain === 'cover') return Object.assign(out, { type: 'blind', pos: a.current_position != null ? a.current_position : state === 'open' ? 100 : 0 });
  const dims = domain === 'light' && (a.brightness != null || (a.supported_color_modes || []).some((m) => m !== 'onoff'));
  return Object.assign(out, { type: 'light', on: state === 'on', level: a.brightness ? Math.max(1, Math.round(a.brightness / 2.55)) : 100, dims: !!dims });
}

async function getHome(env) {
  if (!CFG.home) return { none: true };
  if (!env.HA_TOKEN) return { online: false, error: 'HA_TOKEN secret is not set' };
  let states;
  try {
    const res = await ha(env, '/api/states');
    if (!res.ok) return { online: false, error: 'Home Assistant: HTTP ' + res.status };
    states = await res.json();
  } catch (err) {
    return { online: false, error: 'Home Assistant unreachable' };
  }
  const by = {};
  states.forEach((s) => { by[s.entity_id] = s; });
  const H = CFG.home, al = CFG.alerts;
  const c = H.climate && by[H.climate], m = H.media && by[H.media];
  const ca = c ? c.attributes : {}, ma = m ? m.attributes : {};
  const devices = CFG.devices.map((d) => deviceView(d, by[d.entity]));
  const garage = devices.find((d) => d.type === 'garage');
  const doorbell = al.doorbell && by[al.doorbell.entity];
  return {
    online: true,
    rooms: CFG.rooms, devices, scenes: CFG.scenes, cameras: CFG.cameras,
    climate: c ? {
      current: ca.current_temperature, set: ca.temperature != null ? ca.temperature : ca.target_temp_low,
      mode: c.state === 'heat_cool' ? 'auto' : c.state, modes: ca.hvac_modes || [],
      humidity: ca.current_humidity, step: ca.target_temp_step || 0.5, min: ca.min_temp || 7, max: ca.max_temp || 35,
    } : null,
    media: m ? {
      room: (ma.friendly_name || '').replace(/\s*(speaker|media player)$/i, '') || 'Speaker',
      title: ma.media_title || (m.state === 'off' || m.state === 'idle' ? 'Nothing playing' : ''), artist: ma.media_artist || ma.app_name || '',
      playing: m.state === 'playing', art: ma.entity_picture ? '/api/ha/media?v=' + encodeURIComponent(ma.entity_picture.slice(-16)) : null,
    } : null,
    presence: CFG.people.filter((p) => p.ha).map((p) => {
      const s = by[p.ha];
      return { id: p.id, home: !!s && s.state === 'home', status: !s ? 'Unknown' : s.state === 'home' ? 'Home' : s.state === 'not_home' ? 'Away' : s.state };
    }),
    sensors: {
      doorbell: doorbell ? { state: doorbell.state, changed: doorbell.last_changed } : null,
      leak: ((al.leak && al.leak.entities) || []).some((e) => by[e] && by[e].state === 'on'),
      // Smoke and CO detectors that are going off right now, by name, so the alert can say where.
      smoke: ((al.smoke && al.smoke.entities) || []).filter((e) => by[e] && by[e].state === 'on').map((e) => {
        const a = by[e].attributes || {};
        return { name: a.friendly_name || e, co: a.device_class === 'carbon_monoxide' || /(^|[._])co(_|$)|carbon_monoxide/.test(e) };
      }),
      garageOpenSince: garage && garage.state !== 'closed' && by[garage.id] ? by[garage.id].last_changed : null,
    },
    energy: energyView(H.energy, by),
    checks: checksView(al, by),
    alertConfig: {
      doorbell: !!al.doorbell, doorbellCamera: al.doorbell && al.doorbell.camera || null, doorbellLock: al.doorbell && al.doorbell.lock || null,
      waterValve: !!(al.leak && al.leak.valve), smoke: !!(al.smoke && al.smoke.entities && al.smoke.entities.length),
      garageOpenMinutes: al.garageOpenMinutes || 0,
    },
  };
}

// The "all clear" line: sensors behind the alerts that have gone quiet, the water main, and low
// batteries on those same devices (a sensor.<name>_battery whose <name> starts the alert entity's).
function checksView(al, by) {
  const off = (id) => !by[id] || by[id].state === 'unavailable' || by[id].state === 'unknown';
  const name = (id) => (by[id] && by[id].attributes.friendly_name) || id;
  const leaks = (al.leak && al.leak.entities) || [], smoke = (al.smoke && al.smoke.entities) || [];
  const watched = leaks.concat(smoke).map((id) => id.split('.')[1]);
  const lowBattery = Object.keys(by).filter((id) => {
    const s = by[id], a = s.attributes || {};
    if (id.indexOf('sensor.') !== 0 || a.device_class !== 'battery') return false;
    const stem = id.slice(7).replace(/_battery(_level)?$/, '');
    const pct = parseFloat(s.state);
    return !isNaN(pct) && pct < 20 && watched.some((w) => w.indexOf(stem) === 0);
  }).map((id) => ({ name: name(id).replace(/\s*battery( level)?$/i, ''), pct: Math.round(parseFloat(by[id].state)) }));
  const v = al.leak && al.leak.valve && by[al.leak.valve];
  return {
    leaksOffline: leaks.filter(off).map(name), leakTotal: leaks.length,
    smokeOffline: smoke.filter(off).map(name), smokeTotal: smoke.length,
    // A valve.* reports open/closed; a switch.* standing in for one is on while the water is on.
    valveClosed: v ? (v.state === 'closed' || v.state === 'off') : null,
    lowBattery,
  };
}

// family.json home.energy: { "cost": "sensor.…" or a list to add up (money today, e.g. electricity
// and gas), "power": "sensor.…" (W or kW now), "high": 3000 (watts that count as a lot) }.
// Either can be left out.
function energyView(E, by) {
  if (!E) return null;
  const num = (id) => { const s = id && by[id]; const n = s ? parseFloat(s.state) : NaN; return isNaN(n) ? null : { n, unit: (s.attributes || {}).unit_of_measurement || '' }; };
  const costs = [].concat(E.cost || []).map(num).filter(Boolean), power = num(E.power);
  const cost = costs.length ? { n: costs.reduce((t, c) => t + c.n, 0), unit: costs[0].unit } : null;
  const watts = power ? (/^kw$/i.test(power.unit) ? power.n * 1000 : power.n) : null;
  return {
    cost: cost ? cost.n : null, currency: cost ? ({ GBP: '£', EUR: '€', USD: '$' }[cost.unit] || cost.unit || '£') : null,
    watts, high: watts != null && watts >= (E.high || 3000),
  };
}

async function controlDevice(env, entity, p) {
  const d = CFG.devices.find((x) => x.entity === entity) || (CFG.alerts.doorbell && CFG.alerts.doorbell.lock === entity ? { entity } : null);
  if (!d) return bad('unknown device', 404);
  const domain = entity.split('.')[0], target = { entity_id: entity };
  if (domain === 'lock' && 'locked' in p) await haService(env, 'lock', p.locked ? 'lock' : 'unlock', target);
  else if (domain === 'cover' && 'state' in p) await haService(env, 'cover', p.state === 'open' || p.state === 'opening' ? 'open_cover' : 'close_cover', target);
  else if (domain === 'cover' && 'pos' in p) {
    const pos = Math.max(0, Math.min(100, Math.round(+p.pos)));
    if (pos === 0) await haService(env, 'cover', 'close_cover', target);
    else if (pos === 100) await haService(env, 'cover', 'open_cover', target);
    else await haService(env, 'cover', 'set_cover_position', Object.assign({ position: pos }, target));
  } else if ('on' in p) {
    if (!p.on) await haService(env, domain, 'turn_off', target);
    else if (domain === 'light' && p.level) await haService(env, 'light', 'turn_on', Object.assign({ brightness_pct: Math.max(1, Math.min(100, Math.round(+p.level))) }, target));
    else await haService(env, domain, 'turn_on', target);
  } else return bad('nothing to change');
  return json({ ok: true });
}

async function homeAction(env, what, b) {
  const H = CFG.home;
  if (what === 'climate' && H.climate) {
    if (b.mode) await haService(env, 'climate', 'set_hvac_mode', { entity_id: H.climate, hvac_mode: b.mode === 'auto' ? 'heat_cool' : str(b.mode, 20) });
    if (b.set != null) await haService(env, 'climate', 'set_temperature', { entity_id: H.climate, temperature: +b.set });
    return json({ ok: true });
  }
  if (what === 'media' && H.media) { await haService(env, 'media_player', 'media_play_pause', { entity_id: H.media }); return json({ ok: true }); }
  if (what === 'scene' && CFG.scenes.some((s) => s.id === b.id)) { await haService(env, 'scene', 'turn_on', { entity_id: b.id }); return json({ ok: true }); }
  if (what === 'water-off' && CFG.alerts.leak && CFG.alerts.leak.valve) {
    const v = CFG.alerts.leak.valve, domain = v.split('.')[0];
    await haService(env, domain, domain === 'valve' ? 'close_valve' : 'turn_off', { entity_id: v });
    return json({ ok: true });
  }
  return bad('unknown action', 404);
}

async function haImage(env, which, url) {
  let path;
  if (which === 'camera') {
    const id = url.searchParams.get('id');
    const ok = CFG.cameras.some((c) => c.id === id) || (CFG.alerts.doorbell && CFG.alerts.doorbell.camera === id);
    if (!ok) return bad('unknown camera', 404);
    path = '/api/camera_proxy/' + id;
  } else {
    if (!CFG.home.media) return bad('no media player', 404);
    const s = await ha(env, '/api/states/' + CFG.home.media);
    const pic = s.ok && (await s.json()).attributes.entity_picture;
    if (!pic) return new Response(null, { status: 404 });
    if (/^https?:/.test(pic)) return fetch(pic);
    path = pic;
  }
  const res = await ha(env, path, { headers: { 'content-type': '' } });
  return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'image/jpeg', 'cache-control': 'no-store' } });
}

// ------------------------------------------------------------------ photos
async function uploadPhoto(env, req) {
  const form = await req.formData();
  const full = form.get('full'), small = form.get('small');
  let meta = {};
  try { meta = JSON.parse(form.get('meta') || '{}'); } catch (e) {}
  if (!full || !small || typeof full === 'string') return bad('full and small images required');
  if (full.size > 12e6 || small.size > 4e6) return bad('image too large', 413);
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(meta.date) ? meta.date : localDay().ymd;
  const from = CFG.people.some((p) => p.id === meta.from) ? meta.from : null;
  const opts = { httpMetadata: { contentType: 'image/jpeg' } };
  await Promise.all([env.PHOTOS.put('full/' + id + '.jpg', full.stream(), opts), env.PHOTOS.put('small/' + id + '.jpg', small.stream(), opts)]);
  await env.DB.prepare('INSERT INTO photos (id, o, date, place, from_id, fav, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
    .bind(id, meta.o === 'p' ? 'p' : 'l', date, str(meta.place, 80), from, Date.now()).run();
  return json({ id });
}

async function servePhoto(env, id, small) {
  const obj = await env.PHOTOS.get((small ? 'small/' : 'full/') + id + '.jpg');
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable', etag: obj.httpEtag } });
}

// ------------------------------------------------------------------ router
async function api(req, env, url) {
  const p = url.pathname.replace(/^\/api/, ''), m = req.method;
  let r;
  if (p === '/state' && m === 'GET') return json(await getState(env));
  if (p === '/calendar' && m === 'GET') return json(await getCalendar(env));
  if (p === '/weather' && m === 'GET') return json(await getWeather(env));
  if (p === '/events' && m === 'POST') return addEvent(env, await body(req));
  if ((r = /^\/events\/([\w-]+)$/.exec(p)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(r[1]).run();
    return json({ ok: true });
  }
  if (p === '/bins/out' && m === 'POST') return setBinsOut(env, await body(req));
  if (p === '/frames' && m === 'POST') return frameBeat(env, await body(req));
  if (p === '/frames' && m === 'GET') return json(await listFrames(env));
  if ((r = /^\/frames\/([a-z0-9]{6,40})$/.exec(p)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM cache WHERE key = ?').bind('frame:' + r[1]).run();
    return json({ ok: true });
  }
  if (p === '/groceries' && m === 'POST') return putGrocery(env, await body(req));
  if (p === '/groceries/clear' && m === 'POST') return clearGroceries(env, await body(req));

  if (p === '/photos' && m === 'POST') return uploadPhoto(env, req);
  if ((r = /^\/photos\/(\w+)$/.exec(p))) {
    if (m === 'GET') return servePhoto(env, r[1], url.searchParams.has('s'));
    if (m === 'PATCH') {
      await env.DB.prepare('UPDATE photos SET fav = ? WHERE id = ?').bind((await body(req)).fav ? 1 : 0, r[1]).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      await env.PHOTOS.delete(['full/' + r[1] + '.jpg', 'small/' + r[1] + '.jpg']);
      await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(r[1]).run();
      return json({ ok: true });
    }
  }

  if (p.indexOf('/home') === 0 || p.indexOf('/ha/') === 0) {
    if (!CFG.home) return bad('Home Assistant is not configured', 404);
    if (!env.HA_TOKEN) return bad('HA_TOKEN secret is not set', 503);
    if (p === '/home' && m === 'GET') return json(await getHome(env));
    if ((r = /^\/home\/device\/([\w.]+)$/.exec(p)) && m === 'POST') return controlDevice(env, r[1], await body(req));
    if ((r = /^\/home\/([\w-]+)$/.exec(p)) && m === 'POST') return homeAction(env, r[1], await body(req));
    if (p === '/ha/camera' || p === '/ha/media') return haImage(env, p.slice(4), url);
  }
  return bad('not found', 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!env.DASHBOARD_KEY) return new Response('Set the DASHBOARD_KEY secret first: npx wrangler secret put DASHBOARD_KEY', { status: 500 });

    // ?key=… on any page: remember it in a cookie and drop it from the address bar.
    const given = url.searchParams.get('key');
    if (given != null && url.pathname.indexOf('/api/') !== 0) {
      if (!sameKey(given, env.DASHBOARD_KEY)) return new Response('Wrong key', { status: 403 });
      url.searchParams.delete('key');
      return new Response(null, {
        status: 302,
        headers: {
          location: url.pathname + url.search + url.hash,
          'set-cookie': 'hq=' + encodeURIComponent(given) + '; Path=/; Max-Age=315360000; HttpOnly; Secure; SameSite=Lax',
        },
      });
    }
    if (url.pathname.indexOf('/api/') !== 0) return env.ASSETS.fetch(req);
    if (!sameKey(cookieKey(req) || req.headers.get('x-hq-key'), env.DASHBOARD_KEY)) return bad('locked', 401);
    try {
      return await api(req, env, url);
    } catch (err) {
      console.error(err);
      return bad(String(err.message || err), 502);
    }
  },
};

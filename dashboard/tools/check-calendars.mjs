// Check calendars.json before it is uploaded as the CALENDARS secret: valid JSON, a list of
// { url, people } with known people ids. Prints no links. Used by `npm run calendars`.
import { readFileSync } from 'node:fs';

const fail = (msg) => { console.error('calendars.json: ' + msg); process.exit(1); };
let raw, list;
try { raw = readFileSync(new URL('../calendars.json', import.meta.url), 'utf8'); } catch (e) { fail('not found (cp calendars.example.json calendars.json)'); }
try { list = JSON.parse(raw); } catch (e) {
  const m = /position (\d+)/.exec(e.message);
  const line = m ? raw.slice(0, +m[1]).split('\n').length : '?';
  fail('not valid JSON near line ' + line + '. Check the quotes and commas around it.');
}
if (!Array.isArray(list) || !list.length) fail('must be a list: [ { "url": …, "people": … } ]');
const fam = JSON.parse(readFileSync(new URL('../family.json', import.meta.url), 'utf8'));
const ids = fam.people.map((p) => p.id);
list.forEach((c, i) => {
  const n = 'entry ' + (i + 1);
  if (!c || typeof c.url !== 'string' || !/^(https|webcal):\/\//.test(c.url.trim())) fail(n + ': "url" must be the https:// secret iCal address');
  const people = [].concat(c.people || []);
  const bad = people.filter((p) => p !== 'all' && ids.indexOf(p) < 0);
  if (!people.length || bad.length) fail(n + ': "people" must be "all" or ids from family.json (' + ids.join(', ') + ')' + (bad.length ? '; unknown: ' + bad.join(', ') : ''));
});
console.log('calendars.json OK: ' + list.length + ' calendar(s), for ' + list.map((c) => [].concat(c.people).join('+')).join(', '));

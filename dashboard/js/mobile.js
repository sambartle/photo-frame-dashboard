// Phone page: the shopping list and today's chores, live from the same API as the wall dashboard.
// Changes show on screen at once and save in the background; a poll that started before the last
// save is dropped, so a tick never flickers back.
var $ = function (s) { return document.querySelector(s); };
var S = { tab: 'shopping', store: 'all', routine: null, data: null, wrote: 0, lastText: '' };
var POLL_MS = 20000;

// ------------------------------------------------------------ API
function api(method, path, body) {
  return fetch('/api' + path, {
    method: method, credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) {
    if (r.status === 401) { $('#locked').hidden = false; $('.tabs').hidden = true; throw new Error('locked'); }
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      return j;
    });
  });
}
function save(method, path, body) {
  S.wrote = Date.now();
  return api(method, path, body).then(function (r) { S.wrote = Date.now(); return r; }, function (err) {
    S.wrote = Date.now();
    toast('Couldn’t save · ' + err.message, null, true);
    load();
    throw err;
  });
}
function load() {
  var started = Date.now();
  return api('GET', '/state').then(function (d) {
    if (S.wrote >= started) return; // a save raced this poll
    var text = JSON.stringify(d);
    $('#sync').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (text === S.lastText) return;
    S.lastText = text;
    S.data = d;
    if (document.activeElement !== $('#addInput')) render(); else renderList();
  }).catch(function (e) { if (e.message !== 'locked') $('#sync').textContent = 'Offline · retrying'; });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

// ------------------------------------------------------------ toast
var toastT;
function toast(text, undo, error) {
  var t = $('#toast');
  clearTimeout(toastT);
  t.className = 'toast' + (error ? ' is-error' : '');
  t.innerHTML = '<span>' + esc(text) + '</span>' + (undo ? '<button>Undo</button>' : '');
  t.hidden = false;
  if (undo) t.querySelector('button').onclick = function () { t.hidden = true; undo(); };
  toastT = setTimeout(function () { t.hidden = true; }, 4000);
}

// ------------------------------------------------------------ shopping
function storeName(id) { var s = S.data.stores.filter(function (x) { return x.id === id; })[0]; return s ? s.name : ''; }
function inStore(g) { return S.store === 'all' || g.store === S.store; }
function categorize(name) {
  var n = name.toLowerCase(), cat = S.data.catalog;
  var hit = cat.filter(function (c) { return c[0].toLowerCase() === n; })[0] ||
    cat.filter(function (c) { var a = c[0].toLowerCase(); return a.indexOf(n) > -1 || n.indexOf(a) > -1; })[0];
  return hit ? hit[1] : 'Other';
}
function putItem(g) { return save('POST', '/groceries', g); }

function renderStores() {
  var open = S.data.groceries.filter(function (g) { return !g.done; });
  $('#stores').innerHTML = [['all', 'All']].concat(S.data.stores.map(function (s) { return [s.id, s.name]; })).map(function (s) {
    var n = s[0] === 'all' ? open.length : open.filter(function (g) { return g.store === s[0]; }).length;
    return '<button data-store="' + s[0] + '" class="' + (S.store === s[0] ? 'is-on' : '') + '">' + esc(s[1]) + '<span class="n">' + n + '</span></button>';
  }).join('');
}

function itemHTML(g) {
  var tag = S.store === 'all' && S.data.stores.length > 1 ? '<span class="store-tag">' + esc(storeName(g.store)) + '</span>' : '';
  return '<div class="item' + (g.done ? ' is-done' : '') + '" data-id="' + g.id + '">' +
    '<button class="check" data-check aria-label="' + (g.done ? 'Add back' : 'Got it') + '">' + (g.done ? '✓' : '') + '</button>' +
    '<span class="label"><b>' + esc(g.name) + '</b>' + (g.note ? '<small>' + esc(g.note) + '</small>' : '') + '</span>' + tag +
    (g.done ? '' : '<span class="qty"><button data-qty="-1" aria-label="Fewer">−</button><span>' + g.qty + '</span><button data-qty="1" aria-label="More">+</button></span>') +
    '</div>';
}

function renderList() {
  if (!S.data) return;
  renderStores();
  var open = S.data.groceries.filter(function (g) { return !g.done && inStore(g); });
  var done = S.data.groceries.filter(function (g) { return g.done && inStore(g); });
  var order = (S.data.catOrder[S.store] || S.data.catOrder.all).filter(function (c) { return c !== 'Other'; }).concat(['Other']);
  var html = open.length ? order.map(function (cat) {
    var items = open.filter(function (g) { return g.cat === cat || (cat === 'Other' && order.indexOf(g.cat) < 0); });
    return items.length ? '<div class="group"><h2><span>' + esc(cat) + '</span><span>' + items.length + '</span></h2>' + items.map(itemHTML).join('') + '</div>' : '';
  }).join('') : '<div class="empty">All stocked up.</div>';
  if (done.length) {
    html += '<details class="got"' + (S.gotOpen ? ' open' : '') + '><summary>Got it (' + done.length + ')</summary>' +
      done.map(itemHTML).join('') + '<button class="link" data-clear>Clear ' + done.length + ' ticked items</button></details>';
  }
  $('#shopList').innerHTML = html;
  $('#catalog').innerHTML = S.data.catalog.map(function (c) { return '<option value="' + esc(c[0]) + '">'; }).join('');
}

function addItem(raw) {
  var name = raw.trim();
  if (!name) return;
  var list = S.data.groceries, lower = name.toLowerCase();
  var g = list.filter(function (x) { return !x.done && x.name.toLowerCase() === lower; })[0];
  if (g) { g.qty++; toast('Already on the list · now ×' + g.qty); }
  else if ((g = list.filter(function (x) { return x.done && x.name.toLowerCase() === lower; })[0])) { g.done = false; g.qty = 1; toast('Added back ' + g.name); }
  else {
    var cat = S.data.catalog.filter(function (c) { return c[0].toLowerCase() === lower; })[0];
    g = { id: uid(), name: cat ? cat[0] : name.charAt(0).toUpperCase() + name.slice(1), cat: categorize(name), qty: 1,
      store: S.store === 'all' ? S.data.stores[0].id : S.store, done: false, note: '' };
    list.push(g);
    toast('Added ' + g.name + (S.data.stores.length > 1 ? ' · ' + storeName(g.store) : ''));
  }
  renderList();
  putItem(g);
}

function onShopClick(e) {
  var t = e.target, row = t.closest('[data-id]');
  if (t.closest('[data-store]')) { S.store = t.closest('[data-store]').dataset.store; return renderList(); }
  if (t.closest('[data-clear]')) {
    var gone = S.data.groceries.filter(function (g) { return g.done && inStore(g); });
    var ids = gone.map(function (g) { return g.id; });
    S.data.groceries = S.data.groceries.filter(function (g) { return gone.indexOf(g) < 0; });
    renderList();
    save('POST', '/groceries/clear', { ids: ids });
    return toast('Cleared ' + ids.length + ' items', function () {
      S.data.groceries = S.data.groceries.concat(gone); renderList();
      save('POST', '/groceries/clear', { ids: ids, cleared: false });
    });
  }
  if (!row) return;
  var g = S.data.groceries.filter(function (x) { return x.id === row.dataset.id; })[0];
  if (!g) return;
  if (t.closest('[data-check]')) {
    g.done = !g.done;
    renderList(); putItem(g);
    if (g.done) toast(g.name + ' ticked off', function () { g.done = false; renderList(); putItem(g); });
    return;
  }
  var q = t.closest('[data-qty]');
  if (q) {
    g.qty = Math.max(1, g.qty + +q.dataset.qty);
    row.querySelector('.qty span').textContent = g.qty;
    clearTimeout(g._t);
    g._t = setTimeout(function () { delete g._t; putItem(g); }, 600);
  }
}

// ------------------------------------------------------------ chores
function person(id) {
  if (id === 'any') return { name: 'Anyone', color: '#111111', rgb: '17 17 17', ink: '#FFFFFF' };
  return S.data.people.filter(function (p) { return p.id === id; })[0] || { name: id, color: '#7A756B', rgb: '122 117 107', ink: '#FFFFFF' };
}
function pstyle(p) { return '--c:' + p.color + ';--c-rgb:' + p.rgb + ';--c-ink:' + p.ink; }
function currentRoutine() {
  var h = new Date().getHours(), r = S.data.routines;
  return (r.filter(function (x) { return h >= x.from && h < x.to; })[0] || r[r.length - 1]).id;
}

function renderChores() {
  if (!S.data) return;
  var now = currentRoutine(), sel = S.routine || now, rs = S.data.routines;
  $('#routines').innerHTML = rs.map(function (r) {
    var n = S.data.chores.filter(function (c) { return c.r === r.id && !c.done; }).length;
    return '<button data-routine="' + r.id + '" class="' + (r.id === sel ? 'is-on' : '') + '">' + esc(r.name) + '<span class="n">' + n + '</span></button>';
  }).join('');
  var list = S.data.chores.filter(function (c) { return c.r === sel; }).sort(function (a, b) { return a.done - b.done; });
  var r = rs.filter(function (x) { return x.id === sel; })[0];
  $('#choreList').innerHTML = list.length ? '<div class="group"><h2><span>' + esc(r.range) + (sel === now ? '<span class="now-tag">NOW</span>' : '') + '</span><span>' +
    list.filter(function (c) { return c.done; }).length + ' / ' + list.length + '</span></h2>' + list.map(function (c) {
      var p = person(c.who), by = c.doneBy ? person(c.doneBy).name : '';
      return '<div class="item' + (c.done ? ' is-done' : '') + '" data-chore="' + c.id + '">' +
        '<button class="check" aria-label="' + (c.done ? 'Not done' : 'Done') + '">' + (c.done ? '✓' : '') + '</button>' +
        '<span class="emoji">' + c.emoji + '</span>' +
        '<span class="label"><b>' + esc(c.title) + '</b>' + (by ? '<small>by ' + esc(by) + '</small>' : '') + '</span>' +
        '<span class="who" style="' + pstyle(p) + '">' + esc(p.name) + '</span></div>';
    }).join('') + '</div>' : '<div class="empty">Nothing this ' + esc(r.name.toLowerCase()) + '.</div>';
}

function setChore(c, done, by) {
  c.done = done;
  if (done && by) c.doneBy = by; else delete c.doneBy;
  renderChores();
  save('POST', '/chores/' + c.id, { done: done, doneBy: c.doneBy }).then(function (r) { S.data.stars = r.stars; S.data.week = r.week; });
}

function whoDidIt(c) {
  var sh = $('#sheet');
  sh.innerHTML = '<div class="card"><h3>' + c.emoji + ' Who did it?</h3><div class="people">' + S.data.people.map(function (p) {
    return '<button data-by="' + p.id + '" style="' + pstyle(p) + '">' + esc(p.name) + '</button>';
  }).join('') + '</div><button class="cancel" data-cancel>Cancel</button></div>';
  sh.hidden = false;
  sh.onclick = function (e) {
    var b = e.target.closest('[data-by]');
    if (b) setChore(c, true, b.dataset.by);
    if (b || e.target.closest('[data-cancel]') || e.target === sh) sh.hidden = true;
  };
}

function onChoreClick(e) {
  var b = e.target.closest('[data-routine]');
  if (b) { S.routine = b.dataset.routine === currentRoutine() ? null : b.dataset.routine; return renderChores(); }
  var row = e.target.closest('[data-chore]');
  if (!row) return;
  var c = S.data.chores.filter(function (x) { return x.id === row.dataset.chore; })[0];
  if (!c) return;
  if (c.done) return setChore(c, false);
  if (c.who === 'any' && S.data.people.length > 1) return whoDidIt(c);
  setChore(c, true, c.who === 'any' ? S.data.people[0].id : null);
}

// ------------------------------------------------------------ tabs + boot
function render() { renderList(); renderChores(); }
function showTab(name) {
  S.tab = name;
  $('#title').textContent = name === 'chores' ? 'Chores' : 'Shopping';
  $('#tab-shopping').hidden = name !== 'shopping';
  $('#tab-chores').hidden = name !== 'chores';
  Array.prototype.forEach.call(document.querySelectorAll('.tabs [data-tab]'), function (b) { b.classList.toggle('is-on', b.dataset.tab === name); });
  try { localStorage.setItem('hq-m-tab', name); } catch (e) {}
}

document.querySelector('.tabs').addEventListener('click', function (e) {
  var b = e.target.closest('[data-tab]');
  if (b) showTab(b.dataset.tab);
});
$('#addForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var i = $('#addInput');
  addItem(i.value);
  i.value = '';
});
$('#tab-shopping').addEventListener('click', onShopClick);
$('#shopList').addEventListener('toggle', function (e) { if (e.target.classList.contains('got')) S.gotOpen = e.target.open; }, true);
$('#tab-chores').addEventListener('click', onChoreClick);
document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });

try { showTab(localStorage.getItem('hq-m-tab') || 'shopping'); } catch (e) { showTab('shopping'); }
load();
setInterval(function () { if (!document.hidden) load(); }, POLL_MS);

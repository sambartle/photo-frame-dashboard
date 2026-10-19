// Home / Today: the glanceable overview. Never scrolls.
(function () {
  'use strict';
  var D = window.DATA, V = {};

  function clock() {
    var n = App.now();
    return '<div class="h-time num">' + App.fmt.time(n, false) + '<span class="h-ampm">' + App.fmt.ampm(n) + '</span></div>' +
      '<div class="h-date"><b>' + App.fmt.day(n) + '</b> ' + App.fmt.month(n) + ' ' + n.getDate() + '</div>';
  }

  function weather() {
    var w = App.weatherNow();
    if (!w) return '<div class="h-wx-say"><b>No forecast yet.</b> Set <i>location</i> in family.json.</div>';
    var hours = App.hourly(7);
    var tmin = Math.min.apply(null, hours.map(function (h) { return h.t; }));
    var tmax = Math.max.apply(null, hours.map(function (h) { return h.t; }));
    return '<div class="h-wx-top">' +
      '<span class="h-wx-icon">' + App.icon(w.cond, 60) + '</span>' +
      '<span class="h-wx-temp num">' + w.temp + '°</span>' +
      '<span class="h-wx-meta"><b>' + w.label + '</b><span>H ' + w.hi + '°  L ' + w.lo + '°</span></span>' +
      '</div>' +
      (warning() || '<div class="h-wx-say"><b>' + w.summary + '.</b> ' + w.advice + '.</div>') +
      '<div class="h-wx-hours">' + hours.map(function (h) {
        var lift = tmax === tmin ? 0 : Math.round((h.t - tmin) / (tmax - tmin) * 8);
        return '<div class="h-hr' + (h.p >= 50 ? ' is-wet' : '') + '"><span class="h-hr-l">' + h.label + '</span>' +
          '<span class="h-hr-i" style="transform:translateY(' + -lift + 'px)">' + App.icon(h.c, 22) + '</span><b>' + h.t + '°</b></div>';
      }).join('') + '</div>';
  }

  // The most severe Met Office warning that hasn't ended, as a strip under the temperature.
  function liveWarnings() {
    var now = App.now();
    return D.warnings.filter(function (x) { return new Date(x.to) > now; });
  }
  function warnWhen(x) {
    var a = new Date(x.from), b = new Date(x.to), now = App.now();
    var day = function (d) { return App.sameDay(d, now) ? '' : App.fmt.dayShort(d) + ' '; };
    return a <= now ? 'Now until ' + day(b) + App.fmt.hour(b) : day(a) + App.fmt.hour(a) + ' – ' + day(b) + App.fmt.hour(b);
  }
  function warning() {
    var x = liveWarnings()[0];
    if (!x) return '';
    return '<button class="h-wx-warn is-' + x.level + '" data-warn>' + App.icon('alert', 22) +
      '<span><b>' + x.level[0].toUpperCase() + x.level.slice(1) + ' ' + App.esc(x.type) + ' warning</b> · ' + warnWhen(x) + '</span></button>';
  }
  function warningSheet() {
    var list = liveWarnings();
    if (!list.length) return;
    App.sheet('<div class="sheet-pad wxs">' + list.map(function (x) {
      return '<div class="wxs-item"><span class="wxs-tag is-' + x.level + '">' + App.esc(x.level) + ' · ' + App.esc(x.type) + '</span>' +
        '<h2 class="serif">' + App.esc(x.type[0].toUpperCase() + x.type.slice(1)) + ' warning</h2>' +
        '<div class="wxs-when num">' + warnWhen(x) + '</div>' +
        '<p>Covers ' + App.esc(x.areas.join(', ')) + '. Details at metoffice.gov.uk.</p></div>';
    }).join('') + '<div class="label">Met Office · ' + App.esc(list[0].region) + '</div></div>');
  }

  // Only people with a Home Assistant person entity; everyone else's whereabouts are unknown.
  function presence() {
    return D.people.filter(function (p) { return p.tracked; }).map(function (p) {
      // No status yet (Home Assistant offline or still loading): show a dash, not "undefined".
      var sub = p.home ? 'Home' : (p.eta ? '<b>ETA ' + p.eta + ' min</b>' : App.esc(p.status || '–'));
      return '<div class="h-who' + (p.home ? ' is-home' : '') + '" style="' + App.pstyle(p) + '">' +
        App.avatar(p, 36, p.home ? '' : 'avatar--away') +
        '<span><b>' + p.name + '</b><small>' + sub + '</small></span></div>';
    }).join('');
  }

  function hero() {
    var e = App.nextEvent(), now = App.now();
    if (!e) {
      var tomorrow = App.timedOn(App.addDays(now, 1))[0];
      return '<div class="h-hero h-hero--empty" data-go="calendar">' +
        '<div class="label label--light">Rest of today</div>' +
        '<div class="h-hero-title serif">Nothing else scheduled.<br><i>Enjoy the quiet.</i></div>' +
        (tomorrow ? '<div class="h-hero-meta">Tomorrow starts with <b>' + App.esc(tomorrow.title) + '</b> at ' + App.fmt.time(tomorrow.start) + '</div>' : '') +
        '</div>';
    }
    var p = App.evColor(e);
    var mins = (e.start - now) / 60000;
    var leave = (App.leaveBy(e) - now) / 60000;
    var who = e.people.map(function (id) { return App.person(id).name; });
    var whoText = App.isFamily(e) ? 'Everyone' : who.join(' + ');
    var big = mins < 100
      ? '<div class="h-hero-count num">' + Math.round(mins) + '<small>min</small></div>'
      : '<div class="h-hero-count num">' + App.fmt.time(e.start, false) + '<small>' + App.fmt.ampm(e.start) + '</small></div>';
    var leavePill = '', tone = '', kicker = 'Next up';
    if (e.travel) {
      // Within the hour the count is time to leave. Past leave-by, anyone on the event still at home
      // (per Home Assistant) is running late; once they're all out, it's back to "starts in".
      var tracked = e.people.map(App.person).filter(function (x) { return x.tracked; });
      var stillHome = tracked.length ? tracked.some(function (x) { return x.home; }) : true;
      if (leave > 0 && leave < 60) {
        kicker = 'Leave for';
        big = '<div class="h-hero-count num">' + Math.ceil(leave) + '<small>min to leave</small></div>';
      } else if (leave <= 0 && stillHome) {
        var late = Math.floor(-leave);
        tone = late < 3 ? ' is-go' : ' is-late';
        kicker = late < 3 ? 'Leave now' : 'Running late';
        big = late < 3
          ? '<div class="h-hero-count num">' + App.icon('car', 110) + '<small>leave now</small></div>'
          : '<div class="h-hero-count num">+' + late + '<small>min late</small></div>';
      } else if (leave > 0) {
        leavePill = '<span class="pill">' + App.icon('car', 20) + 'Leave by ' + App.fmt.time(App.leaveBy(e)) + '</span>';
      }
    }
    return '<button class="h-hero' + tone + '" style="' + App.pstyle(p) + '" data-ev="' + e.id + '">' +
      '<div class="h-hero-main">' +
      '  <div class="label label--on">' + kicker + ' · ' + App.esc(whoText) + '</div>' +
      '  <div class="h-hero-title serif">' + App.esc(e.title) + '</div>' +
      '  <div class="h-hero-meta">' + App.fmt.range(e.start, e.end) + (e.travel ? ' · ' + e.travel + ' min to get there' : '') + (e.loc ? ' · ' + App.esc(e.loc) : '') + '</div>' +
      '  <div class="h-hero-foot">' + (e.people.length > 1 ? App.dots(e.people, 22) : '') + leavePill + '</div>' +
      '</div>' + big + '</button>';
  }

  function lanes() {
    var now = App.now();
    V.el.querySelector('.h-lanes').style.gridTemplateColumns = 'repeat(' + Math.max(1, D.people.length) + ',1fr)';
    return D.people.map(function (p) {
      var list = App.timedOn(now, p.id).filter(function (e) { return e.end > now; });
      var shown = list.slice(0, 3), more = list.length - shown.length;
      return '<div class="h-lane" style="' + App.pstyle(p) + '">' +
        '<div class="h-lane-head">' + App.avatar(p, 30) + '<b>' + p.name + '</b></div>' +
        (list.length ? shown.map(function (e) {
          var cur = e.start <= now;
          return '<button class="h-ev' + (cur ? ' is-now' : '') + '" data-ev="' + e.id + '">' +
            '<span class="h-ev-t">' + (cur ? 'Now' : App.fmt.time(e.start, false)) + '</span>' +
            '<span class="h-ev-n">' + App.esc(e.title) + '</span></button>';
        }).join('') : '<div class="h-free serif"><i>Free</i> the rest of the day</div>') +
        (more > 0 ? '<button class="h-more" data-go="calendar">+' + more + ' more</button>' : '') +
        '</div>';
    }).join('');
  }

  // ------------------------------------------------------------ bins
  App.binIcon = function (color, size) {
    return '<svg class="bin" width="' + size + '" height="' + Math.round(size * 1.17) + '" viewBox="0 0 24 28" aria-hidden="true">' +
      '<rect x="3" y="6" width="18" height="21" rx="2" fill="' + color + '"/><rect x="1.5" y="2.5" width="21" height="4" rx="1" fill="' + color + '"/></svg>';
  };
  function binType(id) { return (D.bins.types || {})[id] || { name: id, color: '#7A756B' }; }
  function binNames(c) { return c.bins.map(function (b) { return binType(b).name; }).join(' + '); }
  function ymdDate(s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  // The next collection still to come: today's counts until 9 AM, then it's the one after.
  function nextBins() {
    var now = App.now();
    return D.bins && D.bins.next.filter(function (c) { return !(App.sameDay(ymdDate(c.date), now) && now.getHours() >= 9); })[0] || null;
  }
  // "Due" from 4 PM the day before until 9 AM on the day: that's when bins go out.
  App.binsDue = function () {
    var c = nextBins();
    if (!c) return null;
    var day = ymdDate(c.date), now = App.now(), h = now.getHours();
    var eve = App.sameDay(App.addDays(day, -1), now) && h >= 16, morning = App.sameDay(day, now) && h < 9;
    if (!eve && !morning) return null;
    return { c: c, out: !!(D.bins.out && D.bins.out.date === c.date), tonight: eve };
  };
  function bins() {
    var c = nextBins();
    if (!c) return '';
    var due = App.binsDue(), day = ymdDate(c.date), today = App.dayStart(App.now());
    var days = Math.round((day - today) / 864e5);
    var icons = c.bins.map(function (b) { return App.binIcon(binType(b).color, 30); }).join('');
    var what = c.bins.map(function (b) { return binType(b).what || ''; }).filter(Boolean).join(' · ');
    var when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : App.fmt.day(day) + ' ' + day.getDate() + ' ' + App.fmt.monthShort(day);
    var right = due
      ? (due.out ? '<span class="h-bins-go is-done">' + App.icon('check', 22) + 'Out</span>' : '<span class="h-bins-go">' + (due.tonight ? 'Put out tonight' : 'Put out now') + '</span>')
      : '<span class="h-bins-in num">' + (days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days') + '</span>';
    return '<div class="h-bins-icons">' + icons + '</div>' +
      '<div class="h-bins-text"><span class="label' + (due && !due.out ? ' label--light' : '') + '">Bins · ' + when + '</span><b>' + App.esc(binNames(c)) + '</b>' +
      (what ? '<small>' + App.esc(what) + '</small>' : '') + '</div>' + right;
  }
  function binsSheet() {
    App.sheet('<div class="sheet-pad bns"><div class="label">Next collections</div>' + D.bins.next.map(function (c) {
      var d = ymdDate(c.date);
      return '<div class="bns-row">' + c.bins.map(function (b) { return App.binIcon(binType(b).color, 34); }).join('') +
        '<div><b>' + App.fmt.day(d) + ' ' + d.getDate() + ' ' + App.fmt.month(d) + '</b><span>' +
        App.esc(c.bins.map(function (b) { var t = binType(b); return t.name + (t.what ? ' (' + t.what.toLowerCase() + ')' : ''); }).join(', ')) + '</span></div></div>';
    }).join('') + '</div>');
  }
  App.setBinsOut = function (c, out) {
    D.bins.out = out ? { date: c.date, at: Date.now() } : null;
    App.emit('data');
    App.write('state', 'POST', '/bins/out', { date: c.date, out: out }).then(function (b) { D.bins = b; App.emit('data'); });
  };
  function binsTap() {
    var due = App.binsDue();
    if (!due) return binsSheet();
    App.setBinsOut(due.c, !due.out);
    if (!due.out) App.toast('Bins out · thanks', { icon: 'check', ms: 2500 });
  }

  function shopping() {
    var open = D.groceries.filter(function (g) { return !g.done; });
    var recent = open.slice(-3).reverse();
    return '<div class="label">Shopping</div>' +
      '<div class="h-stat"><span class="num">' + open.length + '</span><small>items to get</small></div>' +
      '<ul class="h-recent">' + recent.map(function (g) {
        return '<li><i></i>' + App.esc(g.name) + '</li>';
      }).join('') + '</ul>';
  }

  function status() {
    var W = D.weather;
    if (!D.hasHome) {
      // No Home Assistant: show the outside conditions instead.
      return '<div class="label">Outside</div>' + (W ?
        '<div class="h-st-row">' + App.icon('thermo', 24) + '<b class="num">' + W.feels + '°</b><span>feels like</span></div>' +
        '<div class="h-st-row">' + App.icon('drop', 24) + '<b class="num">' + W.humidity + '%</b><span>humidity</span></div>' +
        '<div class="h-st-row">' + App.icon('away', 24) + '<b class="num">' + W.wind + '</b><span>' + (W.units === 'fahrenheit' ? 'mph' : 'km/h') + ' wind</span></div>' : '');
    }
    if (!D.homeOnline) return '<div class="label">Home</div><div class="h-st-row is-warn">' + App.icon('bolt', 24) + '<span>Can’t reach Home Assistant</span></div>';
    var lights = D.devices.filter(function (d) { return d.type === 'light' && d.on; }).length;
    var unlocked = D.devices.filter(function (d) { return d.type === 'lock' && !d.locked; });
    var garage = D.devices.filter(function (d) { return d.type === 'garage'; })[0];
    var garageOpen = garage && garage.state !== 'closed';
    var secure = !unlocked.length && !garageOpen;
    var secText = secure ? 'All locked' : (garageOpen ? 'Garage open' : unlocked[0].name + ' unlocked');
    return '<div class="label">Home</div>' +
      '<div class="h-st-row">' + App.icon('bulb', 24) + '<b class="num">' + lights + '</b><span>lights on</span></div>' +
      '<div class="h-st-row' + (secure ? '' : ' is-warn') + '">' + App.icon(secure ? 'lock' : 'unlock', 24) + '<span>' + secText + '</span></div>' +
      (D.climate && D.climate.current != null ? '<div class="h-st-row">' + App.icon('thermo', 24) + '<b class="num">' + D.climate.current + '°</b><span>inside</span></div>' : '') +
      energy();
  }
  // Spend today, or the draw right now when it's high (kettle, oven and washer at once).
  function energy() {
    var E = D.energy;
    if (!E) return '';
    if (E.high) return '<div class="h-st-row is-warn">' + App.icon('bolt', 24) + '<b class="num">' + (E.watts / 1000).toFixed(1) + ' kW</b><span>now</span></div>';
    if (E.cost == null) return E.watts == null ? '' : '<div class="h-st-row">' + App.icon('bolt', 24) + '<b class="num">' + (E.watts >= 1000 ? (E.watts / 1000).toFixed(1) + ' kW' : Math.round(E.watts) + ' W') + '</b><span>now</span></div>';
    return '<div class="h-st-row">' + App.icon('bolt', 24) + '<b class="num">' + E.currency + E.cost.toFixed(2) + '</b><span>today</span></div>';
  }

  function paint() {
    var el = V.el;
    el.querySelector('.h-clock').innerHTML = clock();
    el.querySelector('.h-weather').innerHTML = weather();
    el.querySelector('.h-presence').innerHTML = presence();
    el.querySelector('.h-hero-slot').innerHTML = hero();
    el.querySelector('.h-lanes').innerHTML = lanes();
    el.querySelector('.h-shop').innerHTML = shopping();
    var b = el.querySelector('.h-bins'), due = App.binsDue();
    b.innerHTML = bins();
    b.hidden = !b.innerHTML;
    b.classList.toggle('is-due', !!due && !due.out);
    el.querySelector('.h-side').classList.toggle('has-bins', !b.hidden);
    var st = el.querySelector('.h-status');
    st.innerHTML = status();
    if (D.hasHome) st.setAttribute('data-go', 'control'); else st.removeAttribute('data-go');
  }

  function photoCaption(s) {
    var m = App.photoMeta(s.photos[0]);
    V.el.querySelector('.h-photo-cap').innerHTML = '<b>' + (m.onThisDay ? 'On this day · ' : '') + m.kicker + '</b><span>' + App.esc(m.place) + '</span>';
  }

  App.register('home', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="home">' +
          '<div class="h-clock" data-go="calendar"></div>' +
          '<div class="h-weather"></div>' +
          '<div class="h-presence"></div>' +
          '<div class="h-main"><div class="h-hero-slot"></div><div class="h-lanes" ></div></div>' +
          '<div class="h-side">' +
          '  <button class="h-photo" data-go="photos"><div class="h-photo-stage"></div><div class="h-photo-cap"></div></button>' +
          '  <button class="h-bins card" data-bins hidden></button>' +
          '  <div class="h-duo"><button class="h-shop card" data-go="shopping"></button><button class="h-status card"></button></div>' +
          '</div></div>';
        el.addEventListener('click', function (e) {
          var ev = e.target.closest('[data-ev]');
          if (ev) { App.eventSheet(App.findEvent(ev.dataset.ev)); return; }
          if (e.target.closest('[data-warn]')) { warningSheet(); return; }
          if (e.target.closest('[data-bins]')) { binsTap(); return; }
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
        V.slides = new App.Slideshow(el.querySelector('.h-photo-stage'), { layout: 'cover', captions: false, interval: 12000, onChange: photoCaption });
      }
      paint();
      V.slides.start();
    },
    resume: function () { V.slides.start(); },
    hide: function () { if (V.slides) V.slides.stop(); }
  });
  // Every minute: just the clock and next-up countdown (cheap, even while hidden). Weather on the hour.
  App.on('minute', function (n) {
    if (!V.el || !V.el.firstChild) return;
    V.el.querySelector('.h-clock').innerHTML = clock();
    V.el.querySelector('.h-hero-slot').innerHTML = hero();
    // Every half hour everything (weather, bins due at 4 PM and 9 AM, warnings starting or ending).
    if (n.getMinutes() % 30 === 0) paint();
    else if (n.getMinutes() % 5 === 0) V.el.querySelector('.h-lanes').innerHTML = lanes(); // drop finished events
  });
  App.on('data', function () { if (App.current === 'home') paint(); });

  // The night before collection: a banner on every view at 6 PM, again at 8:30 PM if nobody has
  // said the bins are out. It goes away by itself once they are.
  var binBanner = null;
  App.on('minute', function (n) {
    var due = App.binsDue(), t = n.getHours() * 60 + n.getMinutes();
    if (binBanner && (!due || due.out)) { binBanner(); binBanner = null; }
    if (!due || due.out || !due.tonight || (t !== 18 * 60 && t !== 20 * 60 + 30)) return;
    if (binBanner) binBanner();
    var names = due.c.bins.map(function (b) { return ((D.bins.types || {})[b] || { name: b }).name; }).join(' and ');
    binBanner = App.banner({
      tone: 'ink', icon: 'bell', title: App.esc(names) + (due.c.bins.length > 1 ? ' bins' : ' bin') + ' out tonight',
      sub: 'Collected tomorrow morning', action: 'They’re out', dismiss: 'Later',
      onAction: function () { binBanner = null; App.setBinsOut(due.c, true); }
    });
  });
})();

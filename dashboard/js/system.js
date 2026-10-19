// Alerts (takeovers, banners) raised by Home Assistant via js/sync.js, + the display-controls drawer.
(function () {
  'use strict';
  var D = window.DATA, $ = App.$;

  App.cameraSrc = function (id) { return '/api/ha/camera?id=' + encodeURIComponent(id) + '&t=' + Date.now(); };

  // ------------------------------------------------------------ full-screen takeovers
  function takeover(html, cls) {
    var el = $('#takeover');
    el.className = 'takeover ' + (cls || '');
    el.innerHTML = html;
    el.classList.add('is-open');
    App.closeSheet();
    if (App.mode !== 'day') App.setMode('day');
    return el;
  }
  function closeTakeover() {
    var el = $('#takeover');
    el.classList.remove('is-open');
    el.innerHTML = '';
  }
  App.closeTakeover = closeTakeover;

  var doorbellTimer;
  App.doorbell = function () {
    var now = App.now(), cfg = D.alertConfig || {};
    var el = takeover(
      (cfg.doorbellCamera ? '<div class="tk-cam"><img src="' + App.cameraSrc(cfg.doorbellCamera) + '" alt=""><span class="tk-live"><i></i>Front door</span></div>' : '') +
      '<div class="tk-door">' +
      '  <div class="label label--light">' + App.icon('bell', 20) + ' Doorbell · ' + App.fmt.time(now) + '</div>' +
      '  <h1 class="serif tk-title">Someone’s at<br>the front door</h1>' +
      '  <div class="tk-actions">' +
      (cfg.doorbellLock ? '    <button class="tk-btn tk-btn--hold" data-unlock>' + App.icon('unlock', 30) + '<span>Hold to unlock</span></button>' : '') +
      '    <button class="tk-btn tk-btn--solid" data-dismiss>' + App.icon('x', 30) + '<span>Dismiss</span></button>' +
      '  </div>' +
      '</div>', 'takeover--door');
    el.querySelector('[data-dismiss]').onclick = function () { clearTimeout(doorbellTimer); closeTakeover(); };
    var u = el.querySelector('[data-unlock]');
    if (u) App.hold(u, 1000, {
      done: function () {
        App.setDevice(cfg.doorbellLock, { locked: false });
        u.classList.add('is-on');
        u.querySelector('span').textContent = 'Unlocked';
        App.toast('Front door unlocked', { icon: 'unlock' });
      },
      cancel: function () { App.toast('Keep holding to unlock', { ms: 2000, icon: 'lock' }); }
    });
    clearTimeout(doorbellTimer);
    doorbellTimer = setTimeout(closeTakeover, 45000);
  };

  App.leak = function () {
    var now = App.now();
    var el = takeover(
      '<div class="tk-alarm">' +
      '  <div class="tk-alarm-icon">' + App.icon('drop', 88) + '</div>' +
      '  <div class="label label--light">Critical alert · ' + App.fmt.time(now) + '</div>' +
      '  <h1 class="tk-huge">Water leak</h1>' +
      '  <p class="tk-sub">A leak sensor detected water.</p>' +
      '  <div class="tk-actions">' +
      ((D.alertConfig || {}).waterValve ? '    <button class="tk-btn tk-btn--hold tk-btn--light" data-valve>' + App.icon('drop', 30) + '<span>Hold to shut off water</span></button>' : '') +
      '    <button class="tk-btn tk-btn--solid tk-btn--light" data-ack>' + App.icon('check', 30) + '<span>Acknowledge</span></button>' +
      '  </div>' +
      '</div>', 'takeover--alarm');
    var v = el.querySelector('[data-valve]');
    if (v) App.hold(v, 1200, {
      done: function () {
        App.write('home', 'POST', '/home/water-off', {}).then(function () { v.classList.add('is-on'); v.querySelector('span').textContent = 'Water main closed'; });
      },
      cancel: function () { App.toast('Keep holding to shut off the water main', { ms: 2000, icon: 'drop' }); }
    });
    el.querySelector('[data-ack]').onclick = function () {
      closeTakeover();
      App.toast('Leak acknowledged', { icon: 'check' });
    };
  };

  // Smoke or carbon monoxide: list = [{ name, co }] of the detectors going off.
  App.smoke = function (list) {
    var now = App.now(), co = list.length && list.every(function (s) { return s.co; });
    var el = takeover(
      '<div class="tk-alarm">' +
      '  <div class="tk-alarm-icon">' + App.icon('flame', 88) + '</div>' +
      '  <div class="label label--light">Critical alert · ' + App.fmt.time(now) + '</div>' +
      '  <h1 class="tk-huge">' + (co ? 'Carbon monoxide' : 'Smoke alarm') + '</h1>' +
      '  <p class="tk-sub">' + App.esc(list.map(function (s) { return s.name; }).join(', ')) + '. ' +
      (co ? 'Open windows and get everyone outside.' : 'Check it now. If there’s a fire, get everyone out.') + '</p>' +
      '  <div class="tk-actions">' +
      '    <button class="tk-btn tk-btn--solid tk-btn--light" data-ack>' + App.icon('check', 30) + '<span>Acknowledge</span></button>' +
      '  </div>' +
      '</div>', 'takeover--alarm');
    el.querySelector('[data-ack]').onclick = function () {
      closeTakeover();
      App.toast((co ? 'CO' : 'Smoke') + ' alarm acknowledged', { icon: 'check' });
    };
  };

  // ------------------------------------------------------------ banners (amber, actionable)
  App.banner = function (opts) {
    var box = $('#banners');
    var b = document.createElement('div');
    b.className = 'banner banner--' + (opts.tone || 'amber');
    b.innerHTML = App.icon(opts.icon || 'bell', 30) + '<div class="banner-text"><b>' + opts.title + '</b><span>' + (opts.sub || '') + '</span></div>' +
      (opts.action ? '<button class="banner-btn banner-btn--solid" data-act>' + opts.action + '</button>' : '') +
      '<button class="banner-btn" data-x>' + (opts.dismiss || 'Dismiss') + '</button>';
    box.appendChild(b);
    b.classList.add('is-in');
    function kill() { b.remove(); }
    b.querySelector('[data-x]').onclick = kill;
    if (opts.action) b.querySelector('[data-act]').onclick = function () { kill(); opts.onAction(); };
    if (opts.ms) setTimeout(kill, opts.ms);
    return kill;
  };

  App.garageOpenAlert = function (mins) {
    App.banner({
      icon: 'garage', title: 'Garage open for ' + App.fmt.mins(mins || 15), sub: 'Close it from here if nobody needs it open',
      action: 'Close garage', dismiss: 'Leave open',
      onAction: function () { App.openGarageSheet(); }
    });
  };

  // ------------------------------------------------------------ display controls drawer
  function demoHTML() {
    return '<div class="demo-panel">' +
      '<div class="demo-head"><div><div class="label label--light">Home HQ</div><h2 class="serif">Display controls</h2></div><button class="demo-x" data-demo-close>' + App.icon('x', 28) + '</button></div>' +
      '<div class="demo-sec"><div class="label label--light">Modes</div><div class="demo-grid">' +
      '<button data-mode="ambient">Ambient</button><button data-mode="night">Night</button><button data-fastidle>' + (App.idle.home < 60 ? 'Idle: fast ✓' : 'Idle: fast') + '</button><button data-reload>Refresh data</button></div></div>' +
      (D.hasHome ? '<div class="demo-sec"><div class="label label--light">Test alerts (nothing is sent to the house)</div><div class="demo-grid">' +
      '<button data-alert="doorbell">Doorbell</button><button data-alert="leak">Water leak</button><button data-alert="smoke">Smoke</button><button data-alert="garage">Garage open</button></div></div>' : '') +
      '<div class="demo-sec"><div class="label label--light">Status</div><p class="demo-note">' + status() + '</p>' +
      '<p class="demo-note">Version ' + __APP_VERSION__ + '</p></div>' +
      '<p class="demo-note">Keyboard: <b>D</b> controls · <b>A</b> ambient · <b>N</b> night · <b>1–5</b> views</p>' +
      '</div>';
  }
  function status() {
    var bits = [D.events.length + ' calendar events', D.photos.length + ' photos', D.weather ? 'weather ok' : 'no weather'];
    (D.calendarErrors || []).forEach(function (e) { bits.push(App.esc(e)); });
    // Short form: "HA offline (unreachable)", not "Home Assistant offline (Home Assistant unreachable)".
    var haErr = (D.homeError || '').replace(/^Home Assistant:?\s*/, '');
    if (D.hasHome) bits.push(D.homeOnline ? 'HA connected' : 'HA offline' + (haErr ? ' (' + App.esc(haErr) + ')' : ''));
    return bits.join(' · ');
  }
  App.openDemo = function () {
    var el = $('#demo');
    el.innerHTML = demoHTML();
    el.classList.add('is-open');
  };
  function closeDemo() { $('#demo').classList.remove('is-open'); }

  function demoClick(e) {
    var b = e.target.closest('button');
    if (!b) { if (e.target === $('#demo')) closeDemo(); return; }
    if (b.hasAttribute('data-demo-close')) return closeDemo();
    if (b.dataset.mode) { closeDemo(); App.setMode(b.dataset.mode); return; }
    if (b.hasAttribute('data-fastidle')) {
      var fast = App.idle.home >= 60;
      App.idle.home = fast ? 8 : 60;
      App.idle.ambient = fast ? 15 : 120;
      App.openDemo();
      return;
    }
    if (b.dataset.alert) {
      closeDemo();
      // Previews only: the leak valve and door lock still need a deliberate hold to act.
      ({ doorbell: App.doorbell, leak: App.leak, smoke: function () { App.smoke([{ name: 'Test: Landing', co: false }]); },
        garage: function () { App.garageOpenAlert(15); } })[b.dataset.alert]();
      return;
    }
    if (b.hasAttribute('data-reload')) {
      closeDemo();
      Promise.all(['state', 'calendar', 'weather', 'home'].map(App.refresh)).then(function () { App.toast('Data refreshed', { icon: 'check', ms: 2000 }); });
    }
  }

  App.on('ready', function () {
    $('#demo').addEventListener('click', demoClick);
    App.hold($('#railClock'), 700, { done: App.openDemo });
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      var k = e.key.toLowerCase();
      if (k === 'd') { $('#demo').classList.contains('is-open') ? closeDemo() : App.openDemo(); }
      if (k === 'a') App.setMode('ambient');
      if (k === 'n') App.setMode('night');
      if (k === 'escape') { closeDemo(); App.closeSheet(); }
      var views = ['home', 'calendar', 'shopping', 'photos', 'control'];
      if (k >= '1' && k <= '5') App.go(views[+k - 1]);
    });
  });
})();

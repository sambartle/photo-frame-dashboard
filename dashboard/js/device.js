// This display as a device: screen off while everyone is away, checking in so a quiet frame is
// noticed, and reloading itself after a deploy. The kiosk app (window.HomeHQKiosk, kiosk 1.2+)
// turns the backlight down and reports its version and Wi-Fi signal; in a browser those parts
// are skipped.
(function () {
  'use strict';
  var D = window.DATA, $ = App.$;
  var K = window.HomeHQKiosk || null;
  var loadedAt = Date.now();

  // ------------------------------------------------------------ kiosk bridge
  App.kiosk = function () {
    if (!K) return null;
    try { return JSON.parse(K.info()); } catch (e) { return null; }
  };
  App.on('mode', function (m) {
    if (m !== 'off') autoOff = false;
    if (K) try { K.setScreenOff(m === 'off'); } catch (e) {}
  });

  // ------------------------------------------------------------ screen off while away
  // Only people Home Assistant can place count: someone whose status is unknown (no tracker) is
  // left out, so one untracked person doesn't keep the screen on forever. Anyone coming home, a
  // tap, or an alert turns it back on.
  var awaySince = null, autoOff = false; // autoOff: this code turned the screen off (not a test)
  function everyoneAway() {
    var known = D.people.filter(function (p) { return p.tracked && p.status && !/unknown|–/i.test(p.status); });
    return known.length > 0 && known.every(function (p) { return !p.home; });
  }
  App.on('minute', function () {
    if (!D.awayOffMinutes || !D.homeOnline) {
      awaySince = null;
      if (App.mode === 'off' && autoOff) { App.setMode('day'); App.go('home'); } // can't tell who's home: wake
      return;
    }
    if (!everyoneAway()) {
      awaySince = null;
      if (App.mode === 'off' && autoOff) { App.setMode('day'); App.go('home'); }
      return;
    }
    if (!awaySince) awaySince = Date.now();
    var blocked = $('#takeover').classList.contains('is-open');
    if (App.mode !== 'off' && !blocked && Date.now() - awaySince >= D.awayOffMinutes * 60e3 && App.idleFor() >= 120) {
      App.closeSheet();
      App.setMode('off');
      autoOff = true;
    }
  });
  App.on('ready', function () {
    $('#screenoff').addEventListener('click', function () { App.setMode('day'); App.go('home'); });
  });

  // ------------------------------------------------------------ frame health
  // A random id per display (kept in localStorage) and a name: ?frame=Kitchen once in the
  // address, else the device model from the kiosk or the browser.
  function frameId() {
    var id = null;
    try { id = localStorage.getItem('hq-frame-id'); } catch (e) {}
    if (!id) {
      id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).replace(/[^a-z0-9]/g, '');
      try { localStorage.setItem('hq-frame-id', id); } catch (e) {}
    }
    return id;
  }
  function frameName(info) {
    var q = /[?&]frame=([^&]+)/.exec(location.search), name = null;
    if (q) { name = decodeURIComponent(q[1]).slice(0, 40); try { localStorage.setItem('hq-frame-name', name); } catch (e) {} }
    if (!name) try { name = localStorage.getItem('hq-frame-name'); } catch (e) {}
    if (!name && info && info.model) name = info.model;
    if (!name) { var m = /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(navigator.userAgent); name = m ? m[1] : 'Browser'; }
    return name;
  }
  function beat() {
    var info = App.kiosk() || {};
    App.api('POST', '/frames', {
      id: frameId(), name: frameName(info), version: __APP_VERSION__, build: __BUILD_ID__,
      kiosk: info.kiosk || '', rssi: typeof info.rssi === 'number' ? info.rssi : null,
      model: info.model || '', android: info.android || '', loaded: loadedAt
    }).catch(function () {});
  }
  App.frameId = frameId;
  // Only frames check in: the kiosk app (1.2+), or a screen named with ?frame= on purpose. A
  // phone, tablet or laptop showing the wall view stays out, so it never shows up as a quiet frame.
  var named = /[?&]frame=/.test(location.search);
  if (!named) try { named = !!localStorage.getItem('hq-frame-name'); } catch (e) {}
  if (K || named) {
    App.on('ready', function () { setTimeout(beat, 5000); setInterval(beat, 5 * 60e3); });
  }

  // ------------------------------------------------------------ reload after a deploy
  // Each build writes /build.json. When it differs from the build running here, reload, but
  // only while nobody is using the screen.
  var newBuild = null;
  function checkBuild() {
    fetch('/build.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (b) {
      if (b && b.build && b.build !== __BUILD_ID__) newBuild = b.build;
    }).catch(function () {});
  }
  App.on('ready', function () { setInterval(checkBuild, 5 * 60e3); });
  App.on('minute', function () {
    var busy = App.idleFor() < 60 || $('#takeover').classList.contains('is-open') || $('#sheetLayer').classList.contains('is-open');
    if (newBuild && !busy) location.reload();
  });
})();

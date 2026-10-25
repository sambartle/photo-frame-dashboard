# Home HQ dashboard: development log

Technical notes for whoever works on this next: how it's built, why it's built that way, and what
went wrong along the way. [README.md](README.md) covers setup and day-to-day use. Newest first in
the version history; everything else is grouped by topic.

## Architecture

```
 Frames (kiosk WebView)          Phones (/m, /upload)
          │  HTTPS, cookie key        │
          ▼                           ▼
 ┌─────────────── Cloudflare Worker "home-hq" ───────────────┐
 │ static assets (Vite build in dist/) + /api/* in worker/   │
 │ D1 home-hq: groceries, events, notes, photos, cache, …    │
 │ R2 home-hq-photos: full/<id>.jpg, small/<id>.jpg          │
 │ edge cache (caches.default): HA snapshot, home view      │
 │ cron */5: frame health → HA notify                        │
 └──┬──────────────┬──────────────┬──────────────┬───────────┘
    │              │              │              │
 Google iCal   Open-Meteo,    Home Assistant   Google Routes API,
 feeds (read)  Met Office RSS (Cloudflare      Google Calendar API
                              Tunnel, REST)    (service account)
          ▲
          └── HA automation POSTs /api/alert?t=ALERT_TOKEN (pushed alerts)
```

- **One Worker serves everything.** `wrangler.jsonc` binds `ASSETS` (the Vite output), `DB` (D1)
  and `PHOTOS` (R2), and runs `scheduled()` every 5 minutes. It's on the custom domain
  `homehq.sambartle.co.uk`; `workers_dev` is off. Before any upstream PR, replace the personal
  values in `wrangler.jsonc` and `tools/moved/wrangler.jsonc` with placeholders.
- **Config split.** `settings.json` (gitignored) is imported into the Worker at build time, so a
  settings change needs `npm run deploy`. `secrets.json` (gitignored, mode 600) is uploaded with
  `wrangler secret bulk` by `tools/secrets.mjs`, so a secret change needs no deploy. The browser
  only sees what the API chooses to send (names, colours, lists), never keys or tokens.
- **Auth.** `DASHBOARD_KEY` arrives once as `?key=`, moves into an HttpOnly cookie (`hq`, 10 years), and is
  stripped from the address bar. Two exceptions: `POST /api/alert` takes `ALERT_TOKEN` (it can only
  bump the alert sequence), and `POST /share` (the Android share target) redirects to the upload
  page when it can't handle the request.
- **Front end.** Plain ES modules and IIFEs, no framework, built by Vite. `window.DATA` (`D`) is
  the shared state; `js/sync.js` fills it and emits `data`; views in `js/views/` register with
  `App.register` and redraw from `D`. The last good copy is kept in `localStorage`, so a frame
  starts instantly and survives outages. Saves are optimistic and roll back on failure.
- **Version.** `package.json` `version` becomes `__APP_VERSION__` (shown under Status in the display
  controls) and the build writes `build.json` with a build id. Frames poll it and reload after a
  deploy (checked every 5 min) once nobody has touched the screen for a minute.
- **Must work on WebView 106** (the PF1007L, Android 6): ES2022 at most; check newer JS and CSS against
  [`docs/building-for-the-frame.md`](../docs/building-for-the-frame.md).

### Polling

| What | Day | Ambient / night | Notes |
| --- | --- | --- | --- |
| `/api/state` (shopping, notes, bins, frames) | 30 s | 30 s | |
| `/api/calendar` | 5 min | 5 min | Worker re-parses feeds at most every 10 min |
| `/api/weather` | 15 min | 15 min | includes Met Office warnings (10 min) |
| `/api/home` | 30 s | 60 s | served from an 8 s edge cache |
| `/api/alerts/ws` | WebSocket | WebSocket | the `AlertHub` Durable Object pushes alerts; ping every 30 s; `/api/alerts` (the counter) every 10 s only while the socket is down |
| `build.json` | 5 min | 5 min | auto-reload after deploy |
| heartbeat `/api/frames` | 5 min | 5 min | kiosk 1.2+ or `?frame=` screens only |

### D1

| Table | Holds |
| --- | --- |
| `groceries` | shopping list; ticked items stay until cleared |
| `events` | events added on the frame; `gcal`/`gid` (0002) link the Google copy |
| `notes` | sticky notes (0003); cleared notes keep `cleared` so Undo works |
| `photos` | photo metadata; images in R2 |
| `cache` | key/value with expiry: `calendar`, `weather`, `warnings`, `bins-out`, `frame:<id>`, `alert-seq`, `energy-yday:<midnight>`, `energy-today`, drive times and the daily drive budget |
| `chore_log` | unused since 1.3 (chores removed); kept so old data isn't lost |

Migrations live in `migrations/` and are applied with `npm run db:migrate`. **Apply them remotely
and check before deploying code that needs them**: in 1.14 the notes migration hadn't applied and
`/api/state` failed for about a minute after the deploy.

## Home Assistant

- Reached through a Cloudflare Tunnel at the house, with a long-lived token of a non-admin
  "Frame" user. Non-admin users get **401 from `/api/template`**, so everything is built from
  `/api/states/<id>` and `/api/history`.
- **Load (1.13, partly undone in 1.20).** The first version fetched the full `/api/states` every
  10 s per frame, which on a busy install is megabytes; HA's VM ran out of RAM. 1.13 read the ~36
  entities one by one and ran a full read for discovery every 5 min. That cut HA's load but cost
  the Worker 14-27 ms CPU per `/api/home` (43 ms with discovery), 2-4x the free plan's 10 ms, and
  the Worker hit the CPU limit 100+ times in a few days. The HA VM has been fixed and copes with
  full reads, so 1.20 went back:
  - `haSnapshotFetch` does one `GET /api/states`, keeps `coreIds()` + the media players
    `playersView` finds + the alert sensors' batteries, and caches that reduced list for 8 s in
    the edge cache (`ha-snap`), so frames, phones and the energy panel share one read. `discover()`
    and `ha-discover-last` are gone: players and batteries come from the same read.
  - `/api/home` itself is cached 8 s too (`home-view`); `forgetSnapshot()` clears both.
  - Frames poll `/api/home` every 30 s in the day (was 10 s): urgent alerts are pushed now.
  - Measured with `wrangler tail` (it reports `cpuTime`): `/api/home` refreshing 14-27 ms, cached
    2-10 ms; energy recompute 27-35 ms, calendar refresh 14 ms.
  - Every HA call has a timeout (15 s, history 30 s). After a failure the Worker stops asking for
    30 s (`ha-fail`), so a struggling HA isn't hammered.
  - Any action (`/api/home/...`) calls `forgetSnapshot()` so the next read is fresh.
- **History API gotcha:** without `end_time`, `/api/history/period/<start>` returns one day from
  `start`, not "until now". This once made a working smart meter look stuck for days.
- **Pushed states (1.21).** Profiling the real Worker code (Node, a copy of the HA list): a refresh
  is ~11.5 ms JS + ~2.6 ms gunzip + runtime overhead; 45% is `JSON.parse` of the 834 KB list, 10%
  UTF-8 decode, 9% our filter loop, the rest small, to keep 21 KB (2.5%). So HA pushes instead:
  `tools/ha-state.mjs` prints a `rest_command` (payload templated in HA with `expand([...])`,
  `states.media_player`, battery sensors, `to_json`) and an automation (state change of the quiet
  entities, plus every minute; `queued`, 2 s delay between pushes). `pushState` (same `ALERT_TOKEN`)
  reduces it with `reduceStates` and stores `ha-push` in D1: it has to be D1, not the edge cache,
  because `caches.default` is per data centre and HA's POST lands in a different one from the
  frame's GET. `haSnapshotFetch` uses it while fresh (150 s) and newer than `ha-dirty` (set by
  `forgetSnapshot(env)` on a control or alert), else reads HA directly as in 1.20.
  The payload template sends a fixed list of 25 attributes (`KEEP` in `tools/ha-state.mjs`, the
  ones `worker/index.js` reads), not `s.attributes` whole: `to_json` fails with "Type is not JSON
  serializable: datetime.datetime" on entities with a datetime attribute (media players have
  `media_position_updated_at`). Add to the list if the Worker starts reading another attribute.
- **Pushed alerts (1.15).** Polling every 10 s plus the 8 s snapshot meant a doorbell could take
  ~20 s. Now an HA automation calls `rest_command.homehq_alert` → `POST /api/alert?t=ALERT_TOKEN`
  with a type (`doorbell`, `smoke`, `leak`, `test`). The Worker bumps `alert-seq` in D1 and clears
  `ha-snap` and `ha-fail`; frames fetch `/api/home` at once when the sequence changes (long poll in
  1.16-1.21, a WebSocket from 1.22). `npm run ha-alerts [-- --with-token]` prints the YAML. A
  `rest_command` only registers after a full HA restart, not a YAML reload. Measured: HA to Worker
  in 0.6 s.
- **Doorbell off switch.** `home.alerts.doorbell.off: true` drops the doorbell at load time (`alerts`
  in the `CFG` block), so the alert, the camera takeover and the generated Home Assistant YAML all
  ignore it while its settings stay. Added when the new Blink doorbell wasn't ringing in HA. An
  unexplained uncommitted `refreshBlink` (re-trigger the Blink camera at most every 10 s on each
  look at the doorbell camera, for stale thumbnails) and its README paragraph were found and
  removed on 2026-10-25.
- **Alert WebSocket (1.22).** The 1.16 long poll made `/api/alerts` the most expensive request
  there was: measured with `wrangler tail`, 20-22 ms CPU per call, because the Worker re-checked D1
  once a second for 25 s (~0.85 ms each) and a push is a separate run of the Worker that can't
  signal the waiting one. Now one Durable Object, `AlertHub` (SQLite-backed, so it's available on
  the free plan; `durable_objects` + `migrations` in `wrangler.jsonc`), holds every frame's
  hibernating WebSocket (`/api/alerts/ws`): `pushAlert` posts to it and it sends to all sockets, so
  an alert arrives at once and waiting costs nothing. `setWebSocketAutoResponse('ping','pong')`
  answers the frame's 30 s ping without waking it. A new socket is sent the last alert (the counter);
  the frame reconnects with a 2-30 s back-off and, while down, reads `GET /api/alerts` every 10 s.
  Pages from 1.16-1.21 still send `?since=` and loop straight back on every answer, so the Worker
  holds that one call for 20 s with a single sleep until they've reloaded, rather than letting them
  spin through the request quota. Tested locally: two sockets both receive a push, ping/pong, a
  late joiner gets the latest, 401 without the key, and a page reconnects after a server restart.
- **Long poll (1.16, replaced in 1.22).** 1.15 polled `/api/alerts` every 2 s: 43,200 requests a day per frame, so
  two frames (~106k with everything else) went over the free plan's 100,000 a day, after which
  every request fails until midnight UTC. Now the request waits in the Worker (`alertWait`,
  `ALERT_WAIT_MS` = 25 s, D1 checked every second; waiting costs no CPU time) and the frame asks
  again at once, so ~3,500 a day per frame and ~14k in all per frame. The frame gives up a hung
  request after 40 s and retries after 5 s on errors. Tested: no push answers at 26 s, a push
  at 3 s answers at 3.3 s.
- **Energy (1.10).** kWh today is integrated from `power` history (`wattHours`), hourly bars for
  today (cached 15 min) and yesterday (cached for the day). DCC smart meter `usage` sensors arrive
  hours late, so they're only used to say when the meter last reported.
- **Media (1.11).** `playersView` finds every `media_player.*` during discovery, merges duplicates
  by friendly name (Cast + Assistant SDK + old TV entries), ranks by `MEDIA_RANK`, and hides
  unavailable ones. `loaded` marks an idle player with nothing to resume; Music Assistant returns
  HTTP 500 for play on such a player, so the buttons are disabled and the Worker answers 409.
  The old single `home.media` setting (kitchen "now playing" card) was removed in the docs pass.
- **Frame health (1.6).** Frames heartbeat every 5 min into `frame:<id>`. Same-name entries quiet
  15 min are deduped (a frame gets a new id at a new address); entries expire after 30 days. The
  cron sends one "offline" and one "back" notification per outage through `frames.notify`, with
  the same tag so Android replaces the first.

## Google

- **Drive times (1.7).** Routes API `computeRoutes`, `TRAFFIC_AWARE` (Pro SKU), origin from the
  latitude/longitude of the person's HA `person.` entity, or `zone.home`. Only events with a location starting in
  the next 4 h; each cached 10 min; over 3 h or no route falls back to `Travel:`. A Worker-side
  budget of 300 calls a day (`DRIVE_DAILY_MAX`) protects the bill, because free trial accounts
  can't set quotas in the console. `Walk:` minutes are added on top.
- **Calendar write-back (1.8).** No OAuth user login: a service account signs an RS256 JWT with
  WebCrypto (`googleToken`), trades it for an access token, and writes to calendars shared with it
  ("Make changes to events"). Calendar ids are parsed from the iCal URLs. The event row keeps
  `gcal`/`gid`; `getCalendar` hides the local copy once the feed contains `<gid>@google.com`, so
  nothing shows twice. Our Google Workspace org enforces `iam.disableServiceAccountKeyCreation`;
  the project needed a policy override to make the key, then was set back to inherit.

## Kiosk app (`kiosk/`)

- Built without Gradle (`build.sh`/`build.ps1`: javac, d8, aapt2, apksigner). 1.2 = versionCode 3.
- 1.2 added the `window.HomeHQKiosk` bridge: `setScreenOff()` (window brightness 0, taps still
  work) and `info()` (kiosk version, model, Android version, Wi-Fi RSSI; needs
  `ACCESS_WIFI_STATE`).
- **Saved URL:** the kiosk only saves a URL given by `--es url` (`scripts/set-kiosk-url.sh`).
  Redirects are followed but not saved, so after the move to `homehq` each frame needed
  re-pointing before the old Worker could be deleted.
- **Updating a frame:** `frames/<frame>/build.sh` and `deploy.sh` (private, gitignored). Deploy
  checks the fingerprint and signing cert, `adb install -r`, **`sync`**, restarts, and checks
  `mResumedActivity` (Android 10 doesn't print `mCurrentFocus`). On 2026-10-19 the C-2 lost power
  shortly after an install: the package list was saved but the APK wasn't, so it booted to a black
  screen with no Home app. Hence the `sync` and the "leave it powered 30 s" message.
- adb in scripts must read `/dev/null`, or it swallows the next line of stdin (the y/N answer).
- PF1007L: `adbd` runs as root and `su -c` prints nothing, so use plain `cat`. It has no volume
  buttons; media volume is set with `service call audio 3 i32 3 i32 <0-15> i32 0 s16 com.android.shell`.
- C-2: re-pointing needs a USB-C cable that carries data and fits its recessed port. Never disable
  the whole `com.waophoto.fota` package.

## Version history

| Version | Commit | What changed |
| --- | --- | --- |
| kiosk 1.3.3 | — | `backlight` mode: Android's auto-brightness pushed lcdbl back up whenever the light changed (0 -> 242, lit ~9 s with the 5 s hold loop; measured by covering the sensor). While dark the kiosk now sets `screen_brightness_mode` to manual via su (`settings put system`), restores the level then auto on wake, holds at 0.5 s, and recovers both on the next start if killed while dark (`autobright_off` pref) |
| kiosk 1.3.2 | — | `backlight` mode's su call: the PF1007L's Android 6 `su` takes `su 0 sh -c cmd` and rejects `-c` ("invalid uid/gid '-c'"), so 1.3.1's write failed and fell back to dimming (the safety check worked); now tries both forms |
| 1.22 | — | Pushed alerts by WebSocket through an `AlertHub` Durable Object: instant, no polling, ~0 CPU while idle (the 1.16 long poll cost 20-22 ms CPU per request); a Durable Object binding and migration in `wrangler.jsonc`; old pages' `?since=` loop held for 20 s so they can't spin |
| 1.21 | — | HA pushes the dashboard's states to `POST /api/ha-push` (`npm run ha-state`: a rest_command whose template builds the payload in HA, plus an automation on change + every minute); the Worker reads that from D1 (`ha-push`, ~21 KB, 1-3 ms) and falls back to its own `/api/states` read when the push is older than 150 s or a control happened since (`ha-dirty`). Profiled before: 60%+ of a 14-22 ms refresh was decoding and parsing 834 KB to keep 21 KB |
| 1.20 | — | Worker CPU: HA read back to one `/api/states` (reduced + cached 8 s), finished `/api/home` cached 8 s, home poll 30 s in the day, discovery removed (1.13's per-entity reads cost 14-27 ms CPU per request against the free 10 ms; 100+ CPU-limit hits) |
| 1.19.1 / kiosk 1.3.1 | — | PF1007L can't wake from a real sleep (its touchscreen powers down; no events while asleep), so kiosk 1.3.1 adds a per-frame `screenoff` mode: `backlight` writes 0 to `/sys/class/disp/disp/attr/lcdbl` via su and keeps the frame awake (touch works), restored on wake/pause/destroy and re-applied every 5 s; `lock`, `dim`, `auto`. Page ignores a tap on the off layer in the first 1.5 s (a bounce woke the PF1007L 1.2 s after the first sleep). C-2 stays on `lock` |
| 1.19 / kiosk 1.3 | 2d9ec88 | Real screen sleep: kiosk 1.3 is a device admin with force-lock only (`ScreenAdmin`, enable with `dpm set-active-admin`); `setScreenOff(true)` calls `lockNow()` and holds a partial wake lock, `false` wakes it; ACTION_SCREEN_ON calls `HomeHQScreenOn()` in the page; a page loading while asleep joins "off"; no auto-reload while off. Measured on the C-2: sleep gives `backlight(0)` and the page still checks in; its minimum dim brightness is 8/255, PF1007L 10/255 |
| 1.18 | 5665152 | Per-frame timeouts (`hq-idle`: Today 60 s, Rest 120 s, Peek 20 s in the night hours); night mode controls: Dim/Bright/Sleep/Wake times and a toggle; the dim amber tint now follows the night hours (`data-night` on the stage) instead of only the tap-the-clock state; Modes is a dropdown (Ambient, Screen off), refresh is an icon button, "Idle: fast" and the Night preview removed; Screen off picked by hand stays until a tap (`App.setMode('off', true)`); Ambient from the controls and the A key just call `App.rest()` (rest now, the clock still decides); tapping the night clock goes to Today like any wake (no more 20 s `nightdash` mode); the clock picks the resting screen only when idle runs out and at the four boundaries (`App.restMode`, `App.rest`, `App.syncNightMode`) |
| 1.17.1 | — | Night/screen-off time boxes open the picker on a tap anywhere in the box (same `showPicker()` trick as the calendar's add dialog) |
| 1.17 | — | Night and screen-off hours per frame, set in the display controls (`hq-night` in localStorage); frames now move between photo screen and night clock by themselves at the boundaries |
| 1.16 | 875b4ef | Pushed alerts by long poll (fits the free plan); DEVLOG; README audit; dead `home.media` setting removed |
| 1.15 | 1b413cb | Home Assistant pushes urgent alerts (`/api/alert`, 2 s alert poll, `npm run ha-alerts`) |
| 1.14 | 596a69a | Sticky notes on frames and phone; push to the person's phone; migration 0003 |
| 1.13 | 41dad00 | HA load cut by >95%: per-entity reads, 8 s edge snapshot, 5 min discovery, timeouts, back-off |
| 1.12 / 1.12.1 | 0aa0e7a, 0a54964 | Home HQ wordmark top right (centred); presence sits on the rule |
| 1.11 | 4b6b8f3 | Media tab for every player; kitchen card removed |
| 1.10 | 8092d38 | Energy "today so far" panel; heating & water and climate summary removed; thermostat "Idle" |
| 1.9 / 1.9.1 | ca6a4f9, dbae8b3 | Web Audio sounds with per-frame mute and volume; bins wording fix |
| 1.8.1 – 1.8.3 | fcf09c7, 162bf84 | Add-event date/time pickers; 24 h calendar grid opening at 6 AM |
| 1.8 | 476d07d | Frame events written to Google Calendar (service account); migration 0002 |
| 1.7 | 50e99d7 | Live Google drive times for leave-by, `Walk:`, 300/day cap |
| — | 3589960 | Worker renamed `home-hq` at homehq.sambartle.co.uk; `tools/moved` redirect (old Worker since deleted) |
| — | d616ca2 | `settings.json` + `secrets.json` replace `family.json` + `calendars.json` |
| 1.6 | 3002512 | Frame-offline phone notifications; tidier frame list |
| 1.5 | f25f2a5 | Android share target for photos |
| 1.4 / kiosk 1.2 | 2d41c0c | Screen off when away, all clear, frame health, auto-reload after deploy |
| 1.3 – 1.3.2 | 5c40b5c, 51a79e0, 7249b83 | Chores removed; bins, leave countdown, Met Office warnings, energy line; test alerts dropdown |
| 1.2 / 1.2.1 | effd15c, 5b19c69 | Version under Status; time preview removed; "HA connected" |
| pre-1.2 | 7e4f916 … b94881a | Real data sources, phone page, smoke/CO takeover, per-calendar errors, `Travel:` parsing |

## Open items

- Real doorbell test of pushed alerts (the `rest_command` test passed).
- Second person's `notify` service and HA app location (for drive times and notes to their phone).
- Energy `rate` and `standing` not set yet, so no cost estimate.
- Name the frames with `&frame=` once they have permanent homes.
- Phones: reinstall the PWA from `homehq` so the share menu entry points at the new address.
- Add Christmas bin dates to `bins.moved` when Rotherham publishes the 2026/27 calendar.

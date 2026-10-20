# Home HQ dashboard

The family dashboard from the video, wired to real data. It runs as one Cloudflare Worker on **your
own** Cloudflare account (the free plan is enough). The Worker serves the page and a small API
behind it:

| On screen | Comes from |
| --- | --- |
| Calendar, Today lanes, "Next up" | Google Calendar secret ICS links (read-only), plus events added on the frame |
| Weather | [Open-Meteo](https://open-meteo.com) for your latitude/longitude (no API key) |
| Weather warnings | [Met Office](https://weather.metoffice.gov.uk/guides/rss) regional feed, kept to your areas (UK only, no key) |
| Bin day | Your council's collection rotation, written into `settings.json` |
| Shopping list | Cloudflare D1, shared by every screen and phone that opens the dashboard |
| Photos (slideshow, home tile, ambient mode) | Uploaded from a phone at `/upload`; stored in Cloudflare R2 |
| Home tab, presence, doorbell/leak/smoke/garage alerts | Home Assistant REST API (optional) |

The kiosk app in [`kiosk/`](kiosk) shows it full screen on the frame.

## One-time setup

You need Node 20+, a free [Cloudflare account](https://dash.cloudflare.com/sign-up), and (for the
Home tab) Home Assistant reachable over HTTPS.

```bash
cd dashboard
npm install
npx wrangler login
```

1. **Database and photo bucket.** Create both on your account:

   ```bash
   npx wrangler d1 create home-hq
   npx wrangler r2 bucket create home-hq-photos
   ```

   Paste the `database_id` that the first command prints into `wrangler.jsonc`, replacing
   `REPLACE_WITH_YOUR_D1_ID`. Then create the tables:

   ```bash
   npm run db:migrate
   ```

2. **Your settings and secrets.** Copy both examples and edit them. Both files are gitignored.

   ```bash
   cp settings.example.json settings.json
   cp secrets.example.json secrets.json
   ```

   `settings.json` is what the dashboard shows and does; it's built into the deployed code.
   `secrets.json` holds what grants access, and is uploaded as encrypted Cloudflare secrets instead:

   - `people` (settings): names and colours. Add `"ha": "person.x"` to show whether they're home.
   - `home` (settings): delete this section if you don't use Home Assistant; the Home tab then
     disappears.
   - `DASHBOARD_KEY` (secrets): a long random key, letters and digits only (`openssl rand -hex 24`) so
     it survives `adb shell`. Every screen and phone needs it once.
   - `HA_TOKEN` (secrets): only with Home Assistant; see [Connect it](#connect-it).
   - `CALENDARS` (secrets): in Google Calendar, open **Settings → (the calendar) → Integrate calendar →
     Secret address in iCal format**. Give each link the people it belongs to, or `"all"`. If the
     same invite appears on two calendars, it shows once with both people. To get a "Leave by"
     reminder, add `Travel: 15` (minutes) anywhere in an event's description. Anyone with one of
     these links can read that calendar. If one leaks, **Reset** it on the same Google page and
     upload the new one.

3. **Upload the secrets.**

   ```bash
   npm run secrets
   ```

   It checks `secrets.json` (valid JSON, a sensible key and token, calendar people that exist in
   `settings.json`), refuses if git could commit the file, makes it readable by you only, and
   uploads every secret that has a value in one go. Blank ones are skipped, so they never replace
   what's already on Cloudflare. Run it again after any change; no redeploy is needed.

   Cloudflare never shows a secret again, even to you, so `secrets.json` is your only readable copy.
   Keep it out of synced folders (Dropbox, Google Drive and so on) and back it up in a password
   manager.

4. **Deploy.**

   ```bash
   npm run deploy
   ```

   Wrangler prints your address: your own domain from `routes` in `wrangler.jsonc` (a domain on the
   same Cloudflare account; Cloudflare adds the DNS record and certificate), or
   `https://<name>.<you>.workers.dev` without one. Open it once as
   `https://<your address>/?key=<DASHBOARD_KEY>`. The key moves into a cookie and
   disappears from the address bar.

5. **Point the frame at it.** From the repository root, with the frame on ADB:

   ```bash
   scripts/set-kiosk-url.sh 'https://<your address>/?key=<DASHBOARD_KEY>'
   ```

6. **Add photos.** On a phone, open `https://<your address>/upload?key=<DASHBOARD_KEY>`,
   pick who's adding them, and choose photos. They're shrunk and rotated on the phone (1920 px and
   960 px copies) and dated from EXIF, so "On this day" works.

After editing `settings.json`, run `npm run deploy` again. Lists, ticks and photos live in D1 and R2
and aren't touched by a deploy.

## Running it day to day

Run every `npx wrangler` and `npm run` command from the `dashboard` folder. From anywhere else
wrangler can't find `wrangler.jsonc` and stops with "Required Worker name missing".

| To change… | Edit | Then | Shows up |
| --- | --- | --- | --- |
| The dashboard code | the files in `dashboard/` | `npm run deploy`, then reload the frame | at the next reload |
| People, stores, shopping catalog, weather location, bins | `settings.json` | `npm run deploy`, then reload the frame | at the next reload |
| Calendars, dashboard key, Home Assistant token | `secrets.json` | `npm run secrets` | within ~15 min, no deploy |
| Home Assistant devices | `home` in `settings.json` | `npm run deploy` | within ~10 s of the reload |
| Home Assistant token | in Home Assistant | `npx wrangler secret put HA_TOKEN` | immediately |
| The dashboard key | — | `npx wrangler secret put DASHBOARD_KEY`, then re-key every device | immediately |
| Shopping list, photos | on a screen or phone | nothing | within 30 s on other screens |

### Update the dashboard

```bash
npm run deploy                 # builds and uploads; takes about 20 s
```

The frame keeps running the copy it already loaded. To pick up the new one, open the kiosk menu (hold
two fingers still for 1.5 s) and tap **Reload dashboard**, or power-cycle the frame. Phones get it
the next time the page is opened.

If an update adds a file in `migrations/`, create the new tables before deploying:

```bash
npm run db:migrate
```

To undo a bad deploy:

```bash
npx wrangler versions list     # find the previous version id
npx wrangler rollback <version-id>
```

### Family and shopping

All in `settings.json`, then `npm run deploy`:

- **People:** `id`, `name`, `color`. Add `"ha": "person.x"` for the home/away display. Changing
  someone's `id` detaches their calendar mapping.
- **Shopping:**
  - `stores` sets the filter buttons. New items go to the first store, or to the one being viewed.
  - `categories` sets the aisle order, and `storeOrder` can reorder the aisles per store.
  - `catalog` maps item names to aisles; unknown items go under "Other".
  - `usuals` are the quick-add tiles on the frame.
  - If you remove a store, items already listed under it still show under **All**.
- **Bins:** `types` names each bin with a `color` (and a `lid` colour when it differs); `every` gives each bin's rotation, as one
  collection date (`from`) and how many `weeks` apart. Copy them from your council's calendar.
  `moved` lists bank-holiday changes (`"usual date": "actual date"`, or `null` when skipped).
  The home screen shows the next collection; from 4 PM the day before it asks for the bins to go
  out, with a banner at 6 PM and 8:30 PM until someone taps **They're out**.
- **Weather warnings (UK):** `warnings.region` is a Met Office region code (`yh` Yorkshire &
  Humber, `se`, `nw`, `wl`, `os` …; the codes are on the Met Office RSS page) and `areas` lists the
  council areas you care about. A warning naming one of them replaces the forecast line until it
  ends; tap it for the details.

### Calendars

Each entry in `CALENDARS` in `secrets.json` is a Google Calendar secret iCal link and the people it
belongs to: `["sam"]`, `["laura", "sam"]` or `"all"`. After any change, upload the secrets again:

```bash
npm run secrets
```

The Worker re-reads calendars at most every 10 minutes and the frame asks every 5, so allow up to
about 15 minutes. To refresh straight away:

```bash
npx wrangler d1 execute home-hq --remote --command "DELETE FROM cache WHERE key = 'calendar'"
```

**Leave-by times.** Lines in an event's description set when to leave:

- `Travel: 25`: minutes door to door. Used as written when there's no live drive time.
- `Walk: 5`: minutes from parking to the door, added to the live drive time. Optional.

With a `GOOGLE_MAPS_KEY` in `secrets.json`, events that have a **location** and start in the next 4
hours get a live, traffic-aware drive time from Google instead of `Travel:`. It starts from wherever
Home Assistant places the event's people (their phone's position, from the companion app), or from
home (`zone.home`) for anyone it can't place; with several people the longest drive counts. Each
event is looked up at most every 10 minutes. If Google can't find the place, has no route, or the
drive is over 3 hours, `Travel:` is used. The event sheet says which was used. A lookup sends the
person's position and the event's location to Google.

To get the key, once:

1. In the [Google Cloud console](https://console.cloud.google.com), create a project (for example
   "Home HQ") and attach a billing account; Google requires one even within the free allowance.
2. **APIs & Services → Library**: enable the **Routes API**.
3. **APIs & Services → Credentials → Create credentials → API key**, then edit it: under **API
   restrictions** choose **Restrict key** and tick only the Routes API. Leave application
   restrictions off: the Worker calls from Cloudflare's servers.
4. The dashboard asks Google at most 300 times a day (then uses `Travel:` until midnight), so a fault
   can't run up a bill. On a paid account you can also cap it at Google: **Google Maps Platform →
   Quotas → Routes API → "Directions - ComputeRoutes per request quota per day"**. Free trial
   accounts can't edit quotas, but can't be charged either: the API just stops when the trial ends.
5. Put the key in `secrets.json` as `GOOGLE_MAPS_KEY` and run `npm run secrets`.

A typical family calendar needs about a thousand lookups a month, inside the monthly free allowance
for the Routes API at the time of writing; check Google's current pricing.

Add and change events in the Google Calendar app as usual; the frame follows within the same window.
To remove a calendar, delete its line and upload again. If a link may have leaked, also press **Reset** next to
it in Google Calendar's settings, which kills the old link, and put the new one in.

**Events added on the frame go to Google Calendar too** (optional). The Worker writes them with a
Google **service account**: a separate robot account in your Google Cloud project, signed in with
its own key through Google's documented server-to-server flow, that can only touch the calendars
you share with it. An event for everyone goes to the `"all"` calendar in `CALENDARS`, one for a
single person to that person's calendar (or the `"all"` one if they have none). The frame shows it
at once; when Google's iCal feed carries it, the feed's copy takes over. **Remove** or **Undo** on
the frame deletes it from Google as well. If Google refuses (calendar not shared, no key, offline),
the event stays on the frame and a message says so. A service account can't send invitations.

To set it up, once:

1. In the [Google Cloud console](https://console.cloud.google.com), in the same project as the Maps
   key (or a new one): **APIs & Services → Library**, enable the **Google Calendar API**.
2. **IAM & Admin → Service Accounts → Create service account**. Name it, for example `homehq`;
   skip the optional roles and access steps (it needs no project permissions). Open it, then
   **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
3. Paste that file's whole contents into `secrets.json` as the value of `GOOGLE_SERVICE_ACCOUNT`
   (the object, not a string), delete the downloaded file, and run `npm run secrets`. It prints the
   service account's email address.
4. In [Google Calendar](https://calendar.google.com), for **each calendar in `CALENDARS`**: the
   calendar's ⋮ menu → **Settings and sharing → Shared with → Add people and groups**, paste the
   service account's email, choose **Make changes to events**, and **Send**.
5. Test: add an event with **+** on the frame; it appears in the Google Calendar app within seconds.

### Connecting devices

- **A phone or computer:** open `https://<your dashboard>/?key=<DASHBOARD_KEY>` once. Phones get
  the phone page (shopping, photos); bigger screens get the wall dashboard. Open the address
  with `?wall` to see the wall dashboard on a phone, and with `?phone` to switch back.
- **A frame:** `scripts/set-kiosk-url.sh 'https://<your dashboard>/?key=<DASHBOARD_KEY>'` from the
  repository root, with the frame on ADB.
- **Change the key**, for example if a link with it was shared:
  `npx wrangler secret put DASHBOARD_KEY` with a new `openssl rand -hex 24`. Every device then shows
  "Not connected" until it has opened the address with the new key once.

### Photos

On a phone, open `/upload` (or **Photos** on the phone page). Pick **Added by**, an optional place,
and the photos. They're resized on the phone, and the location and other hidden metadata are
removed; only the date taken is kept. The same page lists every photo with a delete button. On the
frame, the heart on the Photos tab marks favourites, which come up more often.

**Share from the gallery (Android):** open the phone page in Chrome and choose **Install app** (or
**Add to Home screen**) from the menu, once per phone. **Home HQ** then appears when you tap
**Share** on photos in the gallery or Google Photos. They open on the upload page, ready to go:
add a place if you like and tap **Upload**. iPhones can't add web apps to the share menu, so they
keep using `/upload`.

### Moving to a new address

Renaming the Worker or changing its domain gives the dashboard a new address. The data stays (D1
and R2 are attached by id), but secrets belong to each Worker, and every screen and phone signs in
again because the cookie belongs to the old address. To move without visiting each one:

1. Change `name` and/or `routes` in `wrangler.jsonc`, `npm run deploy`, then `npm run secrets`.
2. Set `NEW_ORIGIN` and the old name in `tools/moved/wrangler.jsonc`, then
   `npx wrangler deploy -c tools/moved/wrangler.jsonc`. The old address now redirects every page to
   the new one, adding the key for anyone who already had it (the old cookie or `?key=`), and pages
   left open reload into it within a few minutes.
3. Point each frame at the new address with `scripts/set-kiosk-url.sh`: the kiosk keeps starting
   from the address it was given, so until then it goes through the redirect. Reinstall the phone
   app from the new address (the share menu entry belongs to the old one).
4. When nothing uses the old address any more, delete its Worker in the Cloudflare dashboard.

### Backups

Shopping and frame-added events live in D1 (plus old chore ticks in `chore_log`, kept but no longer used):

```bash
npx wrangler d1 export home-hq --remote --output home-hq-backup.sql
```

The photos are copies of ones on your phone, so they don't need a separate backup.

### When something looks wrong

- **The frame or a phone says "Not connected":** it doesn't have the current key. Open the address
  with `?key=` again.
- **Taps do nothing on the frame:** reload it from the kiosk menu (two-finger hold). That fault was
  fixed in the kiosk app, so if it still happens, rebuild the kiosk from current code.
- **See what's connected:** on the frame, press and hold the clock in the sidebar (or press **D** on a
  keyboard). **Status** lists the number of calendar events, the number of photos, and the state of
  weather and Home Assistant, including Home Assistant's error message.
- **The Worker's live log:** `npx wrangler tail` shows each request and any error, such as a
  calendar link that stopped working or `exceeded CPU`.
- **Check the secrets are set:** `npx wrangler secret list` shows their names, never their values.

## Home Assistant

The Worker runs in Cloudflare's network, not your house, so it needs an HTTPS address for Home
Assistant: [Nabu Casa](https://www.nabucasa.com) remote access or a Cloudflare Tunnel. Only
entities listed in `settings.json` can be read or controlled through the dashboard.

### Connect it

1. **Address.** Use the external address you already open Home Assistant with away from home, for
   example `https://ha.example.com` from a Cloudflare Tunnel or `https://xxxx.ui.nabu.casa`. If that
   address sits behind Cloudflare Access (a login page), the Worker can't get past it. Add an Access
   policy that lets `/api/` through for a service token, or bypass Access for `/api/`, which still
   leaves Home Assistant's own token check in place.
2. **A user just for the dashboard.** In Home Assistant, open **Settings → People → Users → Add user**,
   for example "Frame". Leave **Administrator** off; it can still read states and switch lights,
   locks and scenes. Log in as that user, then open **Profile → Security → Long-lived access tokens →
   Create token**.
3. **The token**: put it in `secrets.json` as `HA_TOKEN`, then from the `dashboard` folder:

   ```bash
   npm run secrets
   ```

4. **The `home` section** in `settings.json`:
   - `url`: the address from step 1.
   - `rooms`: each with its `devices`, as `{ "entity": "light.kitchen", "name": "Kitchen" }`.
   - optionally `climate`, `media`, `cameras`, `scenes` and `alerts`. See `settings.example.json` and the
     table below.

   Add `"ha": "person.sam"` to each person who has a `person.` entity. Find entity ids in
   **Settings → Devices & services → Entities**. Then deploy:

   ```bash
   npm run deploy
   ```

5. **Check it.** The Home tab appears on the frame. **Status** in the display controls (hold the clock)
   says "Home Assistant connected", or shows its error: a wrong address, a token rejected
   (`HTTP 401`), or the address unreachable from the internet.

To add or remove devices later, edit `home` and deploy again. If the token is lost or leaked, delete
it under that user's **Profile → Security** and put a new one in with `npx wrangler secret put HA_TOKEN`.
To turn Home Assistant off, remove the `home` section and deploy; the Home tab disappears.

### What each entity becomes

| `settings.json` entry | Tile | Service calls |
| --- | --- | --- |
| `light.*`, `switch.*` | Light (dimmable when the light supports brightness) | `turn_on` (`brightness_pct`), `turn_off` |
| `cover.*` | Blind; `"garage": true` or `device_class: garage` makes it a garage door | `set_cover_position`, `open_cover`, `close_cover` |
| `lock.*` | Lock (hold to unlock, tap to lock) | `lock`, `unlock` |
| `climate` | Thermostat panel | `set_temperature`, `set_hvac_mode` |
| `media` | Now playing | `media_play_pause` |
| `scenes` | Scene buttons | `scene.turn_on` |
| `cameras` | Snapshots, refreshed every 20 s while the Home tab is open | `camera_proxy` |

`alerts` turns Home Assistant state into full-screen alerts on the frame. The frame polls every 10
seconds, so an alert can take up to 10 s to appear:

- `doorbell`: when the entity changes (a binary sensor or an `event.` entity), show the camera with
  hold-to-unlock.
- `leak`: when any listed sensor turns on, take over the screen. If `valve` is set (a `valve.*` or a
  `switch.*`), hold to shut off the water.
- `smoke`: when any listed smoke or carbon monoxide detector turns on, take over the screen and name
  the detectors going off. Detectors with `co` in their entity id, or with Home Assistant's
  `carbon_monoxide` device class, get the carbon monoxide wording. The frame only shows the alert;
  it doesn't replace the alarms themselves.
- `garageOpenMinutes`: show a banner when the garage has been open this long.

`energy` adds a line to the Home card: `cost` is a sensor (or a list, added up) with today's
spend, such as a smart meter's electricity and gas cost today. With `power` (W or kW now), the
line switches to the current draw while it's above `high` watts (3000 by default).

The Home card's second line is an **all clear**: it names the first thing that needs a look (a
door unlocked, the garage open, the water main off, leak or smoke sensors that have stopped
reporting, or a low battery on one of them) and reads "All clear" otherwise. Tap it for the list.
A battery counts when Home Assistant has a `sensor.<name>_battery` whose `<name>` starts one of the
alert entities (Zigbee sensors are usually named this way).

`display.awayOffMinutes` (top level of `settings.json`) turns the screen off once everyone Home
Assistant can place has been away that long, and back on when someone comes home, taps it, or an
alert fires. People whose state is unknown are left out. With kiosk 1.2 the backlight goes down
too; Android keeps running so the frame can wake by itself.

Press and hold the clock in the sidebar, or press **D**, for display controls. From there you can
preview ambient, night and screen-off modes, show each alert without touching the house, refresh
data, and check what's connected.

**Frames** in the display controls lists every wall display that has checked in (each does every
5 minutes): its dashboard and kiosk versions, Wi-Fi signal (kiosk 1.2) and when it was last seen.
One quiet for 15 minutes turns red there and shows a warning on the phone page. Only the kiosk
app (1.2 or later) checks in, so a phone or laptop showing the wall view never appears in the list.

**Naming a frame.** A frame is listed under its device model ("C-2") until you name it. Put the
name in the address the kiosk starts from, after the key:

```bash
scripts/set-kiosk-url.sh 'https://<your address>/?key=<DASHBOARD_KEY>&frame=Kitchen'
```

The kiosk opens that address at every start, so the name comes back even if the frame's storage
is cleared. A name has letters, digits and spaces, up to 40 characters; write a space as `%20`
(`&frame=Living%20room`). Renaming updates the frame's entry at its next check-in. After a move to
a new address a frame checks in as new (its id is stored per address); its old entry, same name and
quiet for 15 minutes, is removed then. Any other browser or screen can be listed the same way:
open its address once with `?frame=<name>`. Entries silent for 30 days drop off by themselves.

**Phone notifications when a frame goes quiet** (needs Home Assistant): list Home Assistant notify
services in `settings.json`, for example `"frames": { "notify": ["notify.mobile_app_pixel"] }`
(Home Assistant: **Developer tools → Actions**, search `notify.mobile_app`). Every 5 minutes the
Worker checks the list; a frame quiet for `quietMinutes` (20 by default, never less) gets one
"offline" notification and a "back" one when it checks in again, which replaces it on Android. It
goes through the same `HA_TOKEN` as everything else; a non-admin user may call notify. If the
house's internet is down, the Worker can't reach Home Assistant either, so that outage goes
unreported. **Test alerts → Frame notification** in the display controls sends a test.

After a deploy, frames reload themselves within about six minutes, waiting until nobody has
touched the screen for a minute.

## How it fits together

- `worker/index.js` contains the API, auth, D1/R2 access and the Home Assistant mapping.
  `worker/ics.js` expands recurring events with [ical.js](https://github.com/kewisch/ical.js), and
  handles exceptions, moved occurrences, cancellations and time zones.
- `js/sync.js` loads data and keeps it fresh: lists every 30 s, calendar every 5 min, weather every
  15 min, Home Assistant every 10 s (60 s in ambient and night mode). It saves the last copy on the
  device, so the frame starts instantly and keeps showing something during an outage. Changes on
  screen are optimistic and saved in the background. If a save fails, the frame says so and reloads
  the true state.
- Parsed calendars and the forecast are cached in D1 (10 and 15 minutes), so the feeds aren't
  fetched on every poll. If a feed fails, the last good copy is shown.
- Calendars are read-only. Events added with **+** on the frame are stored in D1 and only appear on
  the dashboard, not in Google Calendar.

## Local development

```bash
cp settings.example.json settings.json                               # then edit
cp secrets.example.json secrets.json                                 # then edit
npm run secrets -- --local                                           # writes .dev.vars, uploads nothing
npm run db:migrate:local
npm run build && npx wrangler dev --port 8787
```

Open `http://localhost:8787/?key=<DASHBOARD_KEY>`. For live UI reloading, keep `wrangler dev` running and also
run `npm run dev`. Vite proxies `/api` to it, and the cookie works on both ports.

## Costs and limits

Everything fits Cloudflare's free tier for one household: about 15k requests a day per screen at
these poll rates (the limit is 100k), D1 and R2 storage well under the free quotas. A
calendar with years of recurring events can exceed the free plan's 10 ms CPU limit when it's
re-parsed (once every 10 minutes at most). If you see `exceeded CPU` errors in
`npx wrangler tail`, use fewer or smaller calendars, or the $5/month Workers Paid plan.

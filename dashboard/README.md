# Home HQ dashboard

The family dashboard from the video, wired to real data. It runs as one Cloudflare Worker on **your
own** Cloudflare account (the free plan is enough). The Worker serves the page and a small API
behind it:

| On screen | Comes from |
| --- | --- |
| Calendar, Today lanes, "Next up" | Google Calendar secret ICS links (read-only), plus events added on the frame |
| Weather | [Open-Meteo](https://open-meteo.com) for your latitude/longitude (no API key) |
| Chores, stars, weekly streaks | Chore list in `family.json`; ticks are stored in Cloudflare D1 |
| Shopping list | Cloudflare D1, shared by every screen and phone that opens the dashboard |
| Photos (slideshow, home tile, ambient mode) | Uploaded from a phone at `/upload`; stored in Cloudflare R2 |
| Home tab, presence, doorbell/leak/garage alerts | Home Assistant REST API (optional) |

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

2. **Your family.** Copy both examples and edit them. Both files are gitignored.

   ```bash
   cp family.example.json family.json
   cp calendars.example.json calendars.json
   ```

   - `people`: names and colours. Set `"kid": true` for anyone who earns chore stars. Add
     `"ha": "person.x"` to show whether they're home.
   - `calendars.json`: in Google Calendar, open **Settings → (the calendar) → Integrate calendar →
     Secret address in iCal format**. Give each link the people it belongs to, or `"all"`. If the
     same invite appears on two calendars, it shows once with both people. To get a "Leave by"
     reminder, add `Travel: 15` (minutes) anywhere in an event's description. Anyone with one of
     these links can read that calendar, so they go up as a secret (step 3), never into the
     deployed code. If one leaks, **Reset** it on the same Google page and update the secret.
   - `chores`: `r` is the routine (`morning`, `after` or `evening` by default) and `who` is a
     person's id or `"any"`. Use `days` (`["mon", "thu"]`) for chores that aren't daily.
   - `home`: delete this section if you don't use Home Assistant; the Home tab then disappears.

3. **Secrets.** Choose a long random dashboard key, letters and digits only (`openssl rand -hex 24`)
   so it survives `adb shell`. Every screen and phone needs it once.

   ```bash
   npx wrangler secret put DASHBOARD_KEY
   npx wrangler secret put CALENDARS < calendars.json
   npx wrangler secret put HA_TOKEN      # only with Home Assistant: Profile → Security → Long-lived access tokens
   ```

   Secrets are encrypted at Cloudflare and can't be read back, even from the dashboard. After
   editing `calendars.json`, run the `CALENDARS` line again; no redeploy is needed.

4. **Deploy.**

   ```bash
   npm run deploy
   ```

   Wrangler prints your URL, for example `https://home-dashboard.<you>.workers.dev`. Open it once as
   `https://home-dashboard.<you>.workers.dev/?key=<DASHBOARD_KEY>`. The key moves into a cookie and
   disappears from the address bar.

5. **Point the frame at it.** From the repository root, with the frame on ADB:

   ```bash
   scripts/set-kiosk-url.sh 'https://home-dashboard.<you>.workers.dev/?key=<DASHBOARD_KEY>'
   ```

6. **Add photos.** On a phone, open `https://home-dashboard.<you>.workers.dev/upload?key=<DASHBOARD_KEY>`,
   pick who's adding them, and choose photos. They're shrunk and rotated on the phone (1920 px and
   960 px copies) and dated from EXIF, so "On this day" works.

After editing `family.json`, run `npm run deploy` again. Lists, ticks and photos live in D1 and R2
and aren't touched by a deploy.

## Home Assistant

The Worker runs in Cloudflare's network, not your house, so it needs an HTTPS address for Home
Assistant: [Nabu Casa](https://www.nabucasa.com) remote access or a Cloudflare Tunnel. Put that in
`home.url`. Only entities listed in `family.json` can be read or controlled through the dashboard.

| `family.json` entry | Tile | Service calls |
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
- `garageOpenMinutes`: show a banner when the garage has been open this long.

Press and hold the clock in the sidebar, or press **D**, for display controls. From there you can
preview ambient and night modes, show each alert without touching the house, refresh data, and
check what's connected.

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
cp family.example.json family.json                                   # then edit
printf 'DASHBOARD_KEY=dev\nHA_TOKEN=...\n' > .dev.vars                 # calendars: keep in family.json locally
npm run db:migrate:local
npm run build && npx wrangler dev --port 8787
```

Open `http://localhost:8787/?key=dev`. For live UI reloading, keep `wrangler dev` running and also
run `npm run dev`. Vite proxies `/api` to it, and the cookie works on both ports.

## Costs and limits

Everything fits Cloudflare's free tier for one household: about 15k requests a day per screen at
these poll rates (the limit is 100k), D1 and R2 storage well under the free quotas. A
calendar with years of recurring events can exceed the free plan's 10 ms CPU limit when it's
re-parsed (once every 10 minutes at most). If you see `exceeded CPU` errors in
`npx wrangler tail`, use fewer or smaller calendars, or the $5/month Workers Paid plan.

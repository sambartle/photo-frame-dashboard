# PF1007L January firmware, smaller eMMC: microSD marker route on macOS

This USB-C-only PF1007L on January `20260113` firmware reached root USB ADB through the
[microSD marker-file route](pf1007l-20260113-marker-file-report.md): no boot patch, no FEL, no
network step. It then got a full verified eMMC backup over ADB, the vendor apps disabled, and the
Home HQ kiosk as its Home app on WebView 106. Compared with the
[first marker-file report](pf1007l-20260113-marker-file-report.md):

- the route also worked on the **smaller 30,535,680-sector eMMC**, on a card that macOS formatted
  (FAT32, MBR, one partition);
- the **first cable was charge-only**: the frame powered up, but the Mac showed no `1f3a` device at
  all, during a full boot, until the cable was swapped;
- the stock **WebView 44 could not run a current web page** (details below). The
  [WebView 106 swap](allwinner-a33-pf1007l.md#6-upgrade-webview-before-using-the-kiosk) plus the
  Let's Encrypt roots fixed it.

Observed on 2026-10-21 from an Apple silicon Mac (Darwin 27.0.0), Android platform-tools 37.0.1,
compared against repository main at `f1e0820`. The setup was done by an AI agent (Claude Code) on
the owner's Mac, with the owner approving each write to the frame. One unit; check each value on
your own.

## Unit report

```text
About model / firmware: PF1007L / YHK.F-null-A33-1001-D1024-PF1007L-321-OS-AIMOR.0.20260113
AiMOR version: 6.0.78
Ports (DC jack, or USB-C only): USB-C only (no battery; the cable is the power switch)
Cable and port that gave USB data (or none): USB-A to USB-C data cable to the Mac. The first cable tried was charge-only (power, no USB device)
T3 USB IDs seen / adb devices output: 1f3a:1002 after the marker route; device, product astar_m86_8723cs, model AEEZO
T3b network ADB result (port 5555): not tested
T4 sunxi-fel version output (or skipped): skipped
T5 check-dump stage / chunks (or skipped): skipped
eMMC size in sectors: 30535680
Boot partition start sector: 172032 (mmcblk0p6, 65536 sectors)
Boot image SHA-256 (sector 172032, 31,028 sectors): d71c313ddaa4693948acb20af7740ccb56c88bf9376746a47fce2d00c14fc6a4 (measured on the device)
Route used and result: empty license.properties on a FAT32 microSD -> AiMOR tools screen -> five taps top left -> test app debugging "is closed" -> "is open" -> root USB ADB (uid=0, no su); persisted across reboots
Host OS: macOS (Darwin 27.0.0), Apple silicon
First failed step and its exact output: T3 with the first cable: no 1f3a device, `adb devices` empty. Fixed by a different cable
```

Build fingerprint: `AEEZO/astar_m86_8723cs/astar-m86_8723cs:6.0.1/MOB30R/20260113:eng/test-keys`.
`ro.adb.secure=0`, `ro.debuggable=1`, SELinux disabled.

## Getting ADB

1. The owner read the firmware string in Settings → About. The AiMOR version (`6.0.78`) does not
   identify the firmware: it is the same on January, April and May builds.
2. A 16 GB microSD that held an old single-board-computer image (three partitions, one of them
   Linux) was erased on macOS with `diskutil eraseDisk FAT32 AIMOR MBRFormat`, and an empty
   `license.properties` was created at its root. macOS left a `.Spotlight-V100` folder on the card,
   which it would not let us delete; the route worked anyway.
3. With AiMOR running, inserting the card opened the tools screen. Five taps in the top-left corner
   opened the test app, and the owner switched debugging from "is closed" to "is open".
4. The Mac still showed no USB device. With the frame on a different A-to-C cable, `adb devices`
   listed it at once as `1f3a:1002`, root. The debugging switch was flipped before the cable swap,
   so this unit does not show whether the switch or the cable came first.
5. `persist.sys.usb.config` read `mass_storage,adb`. Root USB ADB returned after each of the
   three reboots that followed. The card was still inserted for those reboots; ADB does not depend on it, since the
   setting lives in `/data`.

## The frame was online before root

The owner had joined the frame to Wi-Fi before the session. `busybox netstat -tn` showed two
established connections to the AiMOR server on TCP `7806` (see
[aimor-remote-root-shell.md](aimor-remote-root-shell.md)). `svc wifi disable` closed them, and Wi-Fi
stayed off until AiMOR was disabled.

## Backup

Full eMMC backup over root ADB, about an hour at 4.4 MB/s:

- `busybox dd` in 64 MiB chunks through `adb exec-out`. Each chunk was hashed on the device
  (`busybox sha256sum`) and on the host, and re-read on a size or hash mismatch.
- Three of 233 transfers came back short (8.7 MB and 18.4 MB of 64 MiB, then one empty reply), the
  same truncation the first marker-file report saw. Each retry matched.
- Checks: image size exactly 15,634,268,160 bytes; no `0xCC`-filled MiB; bootloader, env, boot,
  system, misc, recovery and frp re-read from the device and matched; gzip readback matched.
  `mmcblk0boot0` and `mmcblk0boot1` (4 MiB each) were saved and verified the same way.
- `/data` was mounted during the read, so userdata is not a consistent snapshot.

## Vendor apps and network audit

Rootless Launcher 3.9.1 (F-Droid, pinned hash) was installed first. The owner confirmed by hand that
the panel showed it and that Settings → Apps opened from it. Then these were disabled with
`pm disable`, written to `package-restrictions.xml` (`enabled="2"`) before rebooting, and still
disabled after the reboot:

| Package | Shown in Settings → Apps as | Location |
| --- | --- | --- |
| `com.efercro.os.aimor` | AiMOR | `/system/priv-app/launcher_aimor` |
| `com.DeviceTest` | DeviceTest(android4.4) | `/system/priv-app/DeviceTest` |
| `com.yhk.qeota` | OTA_YHK (`API_10-usaFrame-P-L_Yes-20240603`) | `/system/priv-app/frame_ota` |
| `com.android.gl2jni` | **Thomas's room** | `/system/priv-app/tomas/tomas.apk` |

"Thomas's room" is the OpenGL demo listed in the [PF1009 report](pf1007l-pf1009-20260417.md): one
activity, storage and wake-lock permissions only, no services. It was disabled because the owner
did not want it, not for security.

After that, read-only checks found nothing listening except ADB's own `127.0.0.1:5037`, and no
vendor processes. With Wi-Fi back on for a minute, the only traffic was DHCP, DNS and one probe to
the router: no `7806`.

## Stock WebView 44 cannot run a current page

The owner's page (a family dashboard on their own server, Let's Encrypt certificate) works in
desktop browsers. In the Home HQ kiosk on the stock WebView `44.0.2403.119`:

| Symptom on the panel | Cause |
| --- | --- |
| Buttons did nothing; the background image never loaded | Every inline script failed to parse: logcat showed `Uncaught SyntaxError: Unexpected token )` for each one. Chrome 44 has no arrow functions or `async`/`await`, so none of the page's JavaScript ran, including the part that loads the image |
| Most text black on the dark background | The theme colours are CSS custom properties (`var(--…)`), which Chrome 44 ignores, so text fell back to the default black |
| Layout off | No CSS `grid`, `clamp()`, `inset` or flexbox `gap` either |
| (Would have failed anyway) | Android 6 has no ISRG Root X1, so Let's Encrypt HTTPS fails in WebView ([building-for-the-frame.md](building-for-the-frame.md)) |

What fixed it:

1. **Let's Encrypt roots.** ISRG Root X1 and X2 from `letsencrypt.org/certs/`, checked by SHA-256
   fingerprint (the same values as `scripts/biuframe-setup.sh`), written as `6187b673.0` and
   `8794b4e3.0` (PEM plus `-text`) to `/system/etc/security/cacerts/`, `0644 root:root`. After this,
   the page loaded over HTTPS on WebView 44 too, still broken.
2. **WebView 106**, following
   [section 6](allwinner-a33-pf1007l.md#6-upgrade-webview-before-using-the-kiosk): the pinned
   LineageOS APK and its three `lib/armeabi-v7a/*.so` files staged in
   `/system/homehq-new-webview`, hashed on the device against the host, then the stock tree moved
   to `/system/homehq-stock-webview` and the new tree to `/system/app/webview`. `/system` had
   405 MB free. After a reboot, `dumpsys package com.android.webview` read `106.0.5249.126`, logcat
   had no `dlopen failed`, and the page rendered with working buttons, the background image and the
   right colours.

The kiosk was built with `dashboard/kiosk/build.sh` (Homebrew `openjdk@17`, build-tools 34.0.0,
platform android-34). The `temurin@17` cask needs `sudo`, so the formula was used instead.

## Kiosk notes

- Android 6 has no `cmd package set-home-activity`. After `--ez home true`, the owner picked
  Home HQ → Always in the Home chooser.
- At boot the kiosk showed "Can't reach the dashboard" for about 30 s
  (`ERR_INTERNET_DISCONNECTED`, then one `ERR_NAME_NOT_RESOLVED`), then loaded the page by itself.
- This firmware has no navigation bar. The Home HQ navigation service was enabled
  (`WRITE_SECURE_SETTINGS` granted, `enabled_accessibility_services`, `accessibility_enabled=1`).
  At the next boot the vendor `BackgroundManagerService` logged
  `not whitelist service Intent { cmp=com.wesbos.homehq/.NavigationService }`, but both settings
  were still set. Whether the floating buttons appeared was not checked.
- Log lines from just after boot were dated `01-01` until network time arrived (see the clock fix in
  [pf1007l-boot-fixes.md](pf1007l-boot-fixes.md), not installed here).
- The DHCP address changed at every boot. The MAC address was not checked.

# Rollei Smart Frame WiFi 100 (10.1" Frameo, RK3126, Android 6.0.1)

Record of one unit (white), bought from [Amazon Italy](https://www.amazon.it/dp/B0B9SNSWDY)
(listed as "Rollei Smart Frame WiFi 100", 10.1", 32 GB, 1280x800, Frameo), started 2026-10-19,
macOS host. Observations are kept separate from guesses. Unique identifiers (serial, MAC, IP) are
left out. One listing can ship more than one firmware build over time, so check yours against the Identity table.

A sibling of the [Rollei Smart Frame 107](rollei-smartframe-107.md): same vendor build family
(Harmony / ZhiHeXing, `F6010T`), an older board revision (`1001` instead of `1010`) and firmware
from four months earlier, with the same partition layout. The 107 route worked on this unit
unchanged, except that it runs the Home Assistant app as Home instead of the kiosk.

## Observations (read-only unless noted)

### Identity

| | |
| --- | --- |
| Brand / model | `Rollei` / `Frame` (`ro.product.device=Smart-Frame-WiFi-100-White`, manufacturer `Harmony`) |
| Firmware | `F6010T_ZhiHeXing_1001-V1.0.1202511071115.release-keys`, built 2025-11-07 (loader timestamp `2025-11-07_11:10:47`) |
| Fingerprint | `rockchip/rk312x/rk312x:6.0.1/MXC89K/user.wanghy.20251107.111414:user/release-keys` |
| SoC | Rockchip RK3126 (`ro.board.platform=rk312x`, `ro.hardware=rk30board`) |
| Android | 6.0.1, security patch 2016-07-05, `user` build, `ro.debuggable=0`, `ro.adb.secure=1` |
| SELinux | **Permissive** (`androidboot.selinux=permissive`) |
| Display | 1280x800, 160 dpi |
| Storage | eMMC (`storagemedia=emmc`), `mmcblk0` 30,556,160 KiB, userdata 29,134,848 KiB |
| WebView | `com.google.android.webview` 107.0.5304.36 |
| Wi-Fi | onboard, driver module `rk915`; works |
| SystemUI | `com.android.systemui` is **disabled**: no status or navigation bar |

### USB and ADB

- A **USB-C to USB-C** cable gave nothing: the frame did not appear in `ioreg` or
  `system_profiler SPUSBHostDataType` on the Mac. (On recent macOS, `SPUSBDataType` lists nothing
  at all; use `SPUSBHostDataType` or `ioreg`.)
- A **USB-A to USB-C** cable worked. `adb devices -l` showed `device` (authorized) straight away,
  `product:Smart-Frame-WiFi-100-White model:Frame`, with no prompt on the screen.
- Frameo has an ADB Access toggle under Beta, as on the 107. Whether it was on during the first
  connection was not recorded.
- `persist.sys.usb.config` and `sys.usb.config` are both `mtp,adb` (the 107 had `adb`). ADB came
  back after every reboot, including with Frameo disabled.
- `/data/misc/adb/adb_keys` exists (735 bytes) and is dated 2021-05-15 02:00, the same date as the
  factory key on the 107.

### Root

`adb shell su -c id` returns `uid=0(root) gid=0(root) groups=0(root) context=u:r:toolbox:s0`, with no
prompt. `cat /proc/cmdline` is denied to the shell user; it works through `su`.

### Software of interest

The system package list matches the 107's apps of interest: `net.frameo.frame`, `com.adups.fota`,
`com.adups.fota.sysoper`, `android.rockchip.update.service`, `com.cghs.stresstest`, `com.DeviceTest`,
`com.android.browser`. No third-party apps.

### Partition table

`mtdparts` on the kernel command line is identical to the
[107's](rollei-smartframe-107.md#partition-table-emmc-mmcblk0-512-byte-sectors) up to `userdata`
(loader sector `0x2B4000`, eMMC sector 2,842,624). `/proc/partitions` sizes for `mmcblk0p1` to
`p12` match. Only `userdata` (p13) is larger: 58,269,696 sectors instead of 58,236,928.

## Backup (2026-10-19, verified)

Same as the 107: eMMC sectors 0-2,842,623 (everything before `userdata`), 1,455,423,488 bytes raw,
365.3 MB gzipped, streamed with
`adb exec-out "su -c 'dd if=/dev/block/mmcblk0 bs=512 count=2842624 2>/dev/null'"`. Exact length,
no all-`0xCC` sectors, and the gzip readback hash equals the raw hash. Independent re-reads from the
frame matched the image for the loader area (sectors 0-16383), `uboot`, `misc`, `resource`,
`kernel`, `boot`, `recovery`, `backup`, `kpanic`, `system` and `radical_update`. `cache` and
`metadata` (mounted read-write) were not re-read; `userdata` was not backed up.

| Image | SHA-256 (whole partition) |
| --- | --- |
| `boot` (p5) | `b0705d2f2dc4ef58a65c31087a49159eca36805cdca6e177d36cc6be016851a1` |
| `recovery` (p6) | `eb4ede9389c7de8f49907121e6a9d7cb9b265b3d2eb14345104bbd3309acb23f` |
| `kernel` (p4) | `eb2ddeb4253c452451fc0d92068f9e2075f9857a65f8cddbf427213fcc4a808a` |

All three differ from the 107's, as expected for a different firmware build. Restore is untested.

## Changes made to the frame (2026-10-19)

All reversible package states in `/data`; nothing under `/system` or any flash partition was
written. Made after the verified backup. Run each command through `adb shell "..."`.

| Change | How | Undo |
| --- | --- | --- |
| Adups FOTA off | `su -c 'pm disable com.adups.fota; pm hide com.adups.fota'` | `su -c 'pm unhide com.adups.fota; pm enable com.adups.fota'` |
| Adups helper off | `su -c 'pm disable com.adups.fota.sysoper'` | `su -c 'pm enable com.adups.fota.sysoper'` |
| Rockchip updater off | `su -c 'pm disable android.rockchip.update.service'` | `su -c 'pm enable android.rockchip.update.service'` |
| Home Assistant installed | `adb install -r` of the Home Assistant **minimal** APK from the app's official [GitHub release 2026.8.4](https://github.com/home-assistant/android/releases/download/2026.8.4/app-minimal-release.apk), SHA-256 `8f58a7df71c61447d3370f5d5956a66e3523625dc4b51c8434bd166d3e731bea` (`io.homeassistant.companion.android.minimal`) | `adb uninstall io.homeassistant.companion.android.minimal` |
| Home Assistant as Home | In the app: Settings → Companion app → Device home screen → **Allow as home app** (enables the `io.homeassistant.companion.android.launch.LauncherAlias` component) | Turn it off in the same place |
| Frameo off | `su -c 'pm disable net.frameo.frame'` | `su -c 'pm enable net.frameo.frame'` (its data is untouched) |

Verified after reboot: `dumpsys package com.adups.fota` shows `enabled=2 hidden=true`,
`pm list packages -d` lists `com.adups.fota.sysoper` and `android.rockchip.update.service`, and no
Adups or Rockchip updater processes run. With Frameo disabled, the resumed activity at boot is
`io.homeassistant.companion.android.minimal/io.homeassistant.companion.android.launch.LauncherAlias`,
with no Home chooser, and ADB is still `device`.

### Home Assistant instead of the kiosk

- The minimal build's package name ends in `.minimal`: `monkey -p io.homeassistant.companion.android`
  finds nothing to run. The `full` build needs Google Play Services, which the frame does not have.
- The app's `minSdk` is 23, so it installs on Android 6.0.1.
- The owner's Home Assistant dashboard renders correctly in the stock WebView 107.
- Home Assistant has no two-finger escape menu like the kiosk. The way back to Android settings is
  ADB: `adb shell am start -a android.settings.SETTINGS`.

## Guesses (unverified)

- Whether `adbd` checks keys: the Mac was authorized with no prompt, as on the 107, but a second
  computer was not tried.
- Whether ADB is on without Frameo's Beta toggle: not recorded on this unit (on the 107 it was).
- Clock: probably no battery-backed clock, as on the 107 (`adb_keys` carries the same 2021-05-15
  02:00 date). Not checked across a power cut.

## Security notes for the owner

Same as the [107](rollei-smartframe-107.md#security-notes-for-the-owner): `su` gives any app root
without a prompt, anyone with a USB-A to USB-C cable appears to get a root shell, and the frame runs
Android 6.0.1 with a 2016 patch and SELinux permissive. Keep it on a guest or IoT network. The Home
Assistant session stored on the frame is readable by anyone with ADB, so use a dedicated,
limited Home Assistant user for it.

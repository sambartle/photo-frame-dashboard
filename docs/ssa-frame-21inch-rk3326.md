# SSA "Frame" 21-inch (Frameo, RK3326, Android 8.1)

Investigated 2026-10-20. A record of one owner's unit, not a flashing guide. Host: Linux
(x86_64), USB-A to USB-C data cable.

This 21.5" frame is the same **SSA RK3326** board family as the
[Akimart ZN-DP1002](akimart-zn-dp1002.md), but a distinct build with a different partition
layout (an extra `fotocube` partition). It is not documented elsewhere, so match the About
screen / fingerprint before following any other guide.

End result: Frameo and both vendor updaters disabled, the repo's
[kiosk app](../dashboard/kiosk/README.md) set as HOME showing a Home Assistant dashboard.
No flash write, system remount or system APK edit was needed.

## Identity from ADB

| Field | Observation |
| --- | --- |
| Sold as | "FRAMEO Digital Photo Frame 21.5 Inch, 1920×1080 FHD, dual WiFi, 32 GB" |
| Model / brand / manufacturer | `Frame` / `SSA` / `rockchip` (`ro.product.model` is just `Frame`) |
| Platform / board / hardware | `rk3326` / `rk30sdk` / `rk30board`, 4× Cortex-A35, 32-bit userspace |
| Android / API | 8.1.0 / 27, ABI `armeabi-v7a`, security patch 2020-06-05 |
| Firmware | `SSA_Frame_21inch-20260518` (build id `OC`, built 2026-05-18) |
| Fingerprint | `rockchip/rk3326_go/rk3326_go:8.1.0/OC/101714:user/release-keys` |
| Build flags | `ro.debuggable=0`, `ro.adb.secure=1`, SELinux permissive, verified boot `orange`, `ro.boot.flash.locked=0` |
| RAM / display | 976,784 KiB / 1920×1080, density 160 |
| Storage | logical NAND `rknand0`, 30,277,632 blocks (~28.9 GiB) |
| Root | shipped `/system/xbin/su`; **both `su -c <cmd>` and `su 0 <cmd>` return uid 0** (unlike the Akimart, which only accepts `su 0`) |
| WebView | `com.android.webview` 106.0.5249.126 (no swap needed; renders Home Assistant) |
| Frameo | `net.frameo.frame` v1.30.19 |
| Vendor updaters | `com.adups.fota`, `android.rockchip.update.service`; factory apps `com.cghs.stresstest`, `com.DeviceTest` |

## Cables and ADB access

- Frameo **Settings → About → Beta Program → ADB Access** must be on. Until it is, the frame
  does not enumerate as a USB device at all (the host sees repeated `device descriptor read`
  timeouts and `unable to enumerate`). After it is on, the frame enumerates as Rockchip ADB
  (`2207:0006`, product `Frame`).
- Needs a **USB-A to USB-C** data cable (same rule as the Akimart/PF1007L).
- The ADB authorization prompt appeared and was accepted.

## Logical NAND partition map

From `/sys/block/rknand0/rknand0p*/start` and `/dev/block/by-name`, in 512-byte sectors.
Partitions 1–16 are contiguous.

| Node | Name | Start | Size |
| --- | --- | --- | --- |
| rknand0p1 | uboot | 16384 | 8192 |
| rknand0p2 | trust | 24576 | 8192 |
| rknand0p3 | misc | 32768 | 8192 |
| rknand0p4 | resource | 40960 | 32768 |
| rknand0p5 | kernel | 73728 | 65536 |
| rknand0p6 | boot | 139264 | 65536 |
| rknand0p7 | recovery | 204800 | 262144 |
| rknand0p8 | backup | 466944 | 393216 |
| rknand0p9 | security | 860160 | 8192 |
| rknand0p10 | cache | 868352 | 786432 |
| rknand0p11 | system | 1654784 | 3932160 |
| rknand0p12 | **fotocube** | 5586944 | 73728 |
| rknand0p13 | metadata | 5660672 | 32768 |
| rknand0p14 | vendor | 5693440 | 786432 |
| rknand0p15 | oem | 6479872 | 262144 |
| rknand0p16 | frp | 6742016 | 1024 |
| rknand0p17 | userdata | 6743040 | 53812160 |

The `fotocube` partition (36 MiB) is the notable difference from the Akimart ZN-DP1002, which
has no such partition and places `metadata` at p12. Everything from `metadata` onward is shifted
by one partition number. Do not reuse the Akimart offsets. `userdata` starts at sector 6,743,040.

## Verified firmware backup

- Firmware region = sectors 0..6,743,039 (everything before `userdata`) = 3,452,436,480 bytes.
- **Transport:** `adb exec-out "su 0 dd ..."` streams LF→CRLF and corrupts binary (a 4096-byte
  read arrives as 4197 bytes), so a raw stream does not hash correctly. This `su` does the
  CRLF translation even though the Akimart's does not. Byte-exact data came from
  `su 0 dd ... of=/data/local/tmp/<name>.img` followed by `adb pull` (device and host SHA-256
  matched). `adb root` is blocked (`ro.debuggable=0`).
- Each partition node was dumped individually (p17 `userdata` excluded). Device vs host
  SHA-256 matched for all 17 images; no partition was `0xCC` filler; independent NAND re-reads
  of `uboot`, `boot` and `recovery` matched.
- Whole 32 MiB `boot` partition SHA-256:
  `3265239bd427755411ba06982bdc508b465609d1cd8d8a8e7967d63ced815cf9`.
- Byte counts and a gzip readback were not recorded, so treat this backup as not fully meeting
  [README rule 2](../README.md#rules-we-learned-the-hard-way). Delete the images from
  `/data/local/tmp` after the pull.

## Setup performed (2026-10-20)

Each change was reversible and needed no flash write; undo commands are listed.

| Change | Command | Undo |
| --- | --- | --- |
| Disable Adups FOTA | `pm disable-user --user 0 com.adups.fota` | `pm default-state --user 0 com.adups.fota` |
| Disable Rockchip updater | `pm disable-user --user 0 android.rockchip.update.service` | `pm default-state --user 0 android.rockchip.update.service` |
| Install kiosk | `adb install -r dashboard/kiosk/build/homehq.apk` | `adb uninstall com.wesbos.homehq` |
| Kiosk as HOME | `am start -n com.wesbos.homehq/.MainActivity --ez home true` then `cmd package set-home-activity com.wesbos.homehq/.Home` | `pm default-state --user 0 net.frameo.frame`, then `cmd package set-home-activity --user 0 net.frameo.frame/.ui.activities.AWaitForDeferredInitCompleted` |
| Dashboard URL | `scripts/set-kiosk-url.sh https://<your-dashboard>/` | re-run with a new URL |
| Disable Frameo | `pm disable-user --user 0 net.frameo.frame` | `pm default-state --user 0 net.frameo.frame` |
| Timezone | `setprop persist.sys.timezone <zone>` | set back (ships `America/Los_Angeles`) |

Frameo was disabled only after the kiosk was confirmed as HOME and the frame rebooted into it.
`pm disable-user` was followed by a ~30 s wait and a check of
`/data/system/users/0/package-restrictions.xml` (`enabled="3"`) before rebooting, per the
Akimart pitfall where an immediate reboot undid the disable.

## Quirks and notes

- **USB does not reliably re-enumerate after `adb reboot`.** On this unit the first reboot left
  the host with no USB device at all until the frame was fully power-cycled (wall adapter off/on)
  and the cable re-plugged; a later reboot re-enumerated on its own. Assume a power-cycle may be
  needed to get ADB back after a reboot.
- **CA store has ISRG Root X1** (`6187b673.0`), so Let's Encrypt sites load once the clock is
  correct. Before NTP syncs (a few seconds after Wi-Fi joins), HTTPS fails with a date error
  because the frame boots with a stale clock.
- **WebView 106** renders modern Home Assistant dashboards; no WebView swap was needed.
- Factory test apps (`com.cghs.stresstest`, `com.DeviceTest`) were left enabled here (the
  Akimart route also leaves them); they were not observed to interfere.

## Guesses, not confirmed

- The `fotocube` partition name suggests a photo-cube feature; its exact purpose and whether
  it must be present for boot was not investigated.
- Loader mode and firmware restore were not tested on this unit.

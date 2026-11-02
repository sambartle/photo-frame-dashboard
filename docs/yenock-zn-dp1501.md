# YENOCK ZN-DP1501 15.6-inch frame (SSA RK3326 board)

Investigated 2026-10-20. A record of one owner's unit, not a flashing guide. Host: macOS on Apple
silicon (USB-C ports only), USB ADB.

The board, partition map and vendor packages match the
[Akimart ZN-DP1002 (SSA RK3326)](akimart-zn-dp1002.md), on older firmware with a 1920x1080 panel
and WebView 61. Its `su` differs: it adds a carriage return to binary output, so a raw `dd` stream
is not a backup (see [Root and binary reads](#root-and-binary-reads)).

End result: the vendor WebView 61 replaced by WebView 138 in `/system`, the repo's
[kiosk app](../dashboard/kiosk/README.md) as HOME in portrait showing a Home Assistant dashboard
from a LAN server, Frameo and both vendor updaters disabled. No flash partition was written.

## Identity from ADB

| Field | Observation |
| --- | --- |
| About screen | Hardware brand and model `YENOCK ZN-DP1501`, Frameo v1.27.3 (54680) |
| Model / brand / manufacturer | `Frame` / `SSA` / `rockchip` |
| Platform / board | `rk3326` / `rk30sdk` |
| Android / API | 8.1.0 / 27, ABI `armeabi-v7a`, kernel 4.4.138 |
| Security patch | 2020-06-05 |
| Firmware | `SSA_Frame_20250814` |
| Fingerprint | `rockchip/rk3326_go/rk3326_go:8.1.0/OC/064459:user/release-keys` |
| Build flags | `ro.debuggable=1`, `ro.secure=1`, `ro.adb.secure=1`, SELinux permissive, verified boot `orange` |
| RAM / display | 976,888 KiB / 1920x1080, 210 dpi |
| Storage | logical NAND `rknand0`, 30,277,632 KiB; `/dev/block/by-name` present |
| WebView | `com.android.webview` **61.0.3163.98** in `/system/app/webview` (`webview.apk` plus `oat/arm/webview.{odex,vdex}`, no `lib/`) |
| Frameo | `net.frameo.frame` v1.27.3 in `/system/priv-app/Frameo`, never updated into `/data/app` |
| Vendor updaters | `com.adups.fota`, `android.rockchip.update.service` |
| Disabled from the factory | `com.android.systemui`, `com.android.nfc` (no navigation bar) |
| Time zone as shipped | `America/Los_Angeles` |
| `/system/bin/iotv` | not present (compare the [Runxion RK3126](runxion-zn-dp1002-rk3126.md)) |

The 16 partition sizes in `/proc/partitions` match the [Akimart map](akimart-zn-dp1002.md#logical-nand-partition-map)
exactly, including the 128 MiB recovery.

## Cables and ADB access

- Frameo Settings → About → **Beta Program** on, then **ADB Access**. The authorization prompt
  appeared on screen and was accepted.
- The Mac has only USB-C ports. Nothing enumerated until the frame was connected through a
  USB-C-to-A adapter and a **USB-A to USB-C** data cable, as on the Akimart.
- `persist.sys.usb.config` read `mtp,adb`; USB ADB stayed on after Frameo was disabled and after
  reboots.

## Root and binary reads

- `/system/xbin/su` gives `uid=0` with no prompt. Both `su 0 <cmd>` and `su -c "<cmd>"` work.
- **This `su` translates LF to CRLF.** A 4 KiB `adb exec-out "su 0 dd if=/dev/block/rknand0p6 bs=4096 count=1"`
  returned 4,197 bytes, and the hash did not match the on-device `sha256sum`. The Akimart's `su`
  does not do this.
- Piping through `base64` on the frame and decoding on the host gave exact bytes:
  `adb exec-out 'su -c "dd if=<dev> bs=524288 skip=<n> count=<m> 2>/dev/null | base64"'`, then
  strip `\r` and `\n` and decode. The 4 KiB probe then matched the on-device SHA-256.
- `su 0 sh -c '...'` over `adb exec-out` hung with no output; `su -c "..."` did not.
- Frameo itself (`u0_a11`) had two `su` child processes running.

## Verified firmware backup

- Capture: the first 8 MiB of `rknand0`, then each partition node p1–p15 in 64 MiB chunks over the
  base64 transport above. Each chunk had to decode to its exact length.
- Result: 16 regions, 3,414,687,744 bytes (the same total as the Akimart). Each region's SHA-256
  matched an on-device `sha256sum` of the same node and the gzip readback; no aligned 4 KiB block
  was all `0xCC`. About 622 MiB compressed, at about 1.5 MiB/s over USB.
- During partition 8 the frame dropped off USB and rebooted (uptime 5 minutes when it came back).
  The script stopped on the short chunk; a resumed run skipped the verified regions and finished.
  The cause was not found.
- Boot starts with a Rockchip `KRNL` wrapper. Entire 32 MiB boot partition SHA-256:
  `8c8730664c2bea9e01fe2a1dba290578675c8aa0bcf6e5904625e73ee7902e68` (differs from the Akimart's
  newer firmware).

This is a logical firmware capture, not a physical NAND image or a userdata snapshot. Restoration is
untested.

## WebView 138 in place of the vendor WebView 61

WebView 61 is too old for the Home Assistant frontend. The replacement followed the
[FRAME156 record](pastigio-frame156.md#webview-138-in-place-of-the-vendor-webview-106), with the
stock tree's hashes recorded first so the undo can be checked.

| File | SHA-256 |
| --- | --- |
| Stock `/system/app/webview/webview.apk` (61.0.3163.98) | `db1f9a147730a4893670ea98fc72ee8060fdc0b0861485bec8ba63405affbc3b` |
| Stock `oat/arm/webview.odex` | `352fb0ef5a90658d2fd812cfcd0e3d9e6d2898a789c06eba6496ec9688194a5c` |
| Stock `oat/arm/webview.vdex` | `b124df0a720926e48bbfc116fd96ce62aed9b8ab7ab828ad0c2b784f58643da0` |
| New `webview.apk` 138.0.7204.63 ARM (LineageOS LFS object; source as in [the FRAME156 record](pastigio-frame156.md#webview-138-in-place-of-the-vendor-webview-106)) | `b7268786318f404bdad53eaaec889619ff30100b935541a9e393e32efed3cf11` |
| New `lib/arm/libwebviewchromium.so` | `d217fc3847fad5cecc1f37ffa8461b95fc2bb32586f63f01285381239c11b03d` |
| New `lib/arm/libcrashpad_handler_trampoline.so` | `e16d7cd6d1669d6da68997099425501f8bb6d6f0ae3bb6c8dbbb0bc8e0f4441d` |

`/system` is `/dev/block/by-name/system` (`rknand0p11`) ext4 `ro`, no `/dev/block/dm-*`, 1.0 GB free.
> **Record, not a procedure.** The script is not in this repo.

A root script staged in `/data/local/tmp`:

1. checked the staged files and the stock tree against the hashes above, and refused if the
   staging or rollback path already existed;
2. remounted `/system` read-write and built `/system/webview-new-138` (root:root, 0755/0644,
   `u:object_r:system_file:s0`), then re-checked the hashes;
3. moved the stock tree to `/system/webview-stock-61` (outside any scanned app directory) and the
   new tree to `/system/app/webview`, checked the hashes again, ran `sync` and remounted read-only.
   Any failed check remounted read-only and stopped.

After `adb reboot`, `dumpsys webviewupdate` reported `com.android.webview, 138.0.7204.63` with
`codePath=/system/app/webview`, logcat showed no WebView load errors, and the kiosk rendered Home
Assistant. Undo (not run): remount read-write, move `/system/app/webview` aside, move
`/system/webview-stock-61` back, check its hashes against the table above, remount read-only, reboot.

## Kiosk, HOME and portrait

| Change | Command | Undo |
| --- | --- | --- |
| Disable FOTA | `pm disable-user --user 0 com.adups.fota` | `pm enable com.adups.fota` |
| Disable Rockchip updater | `pm disable-user --user 0 android.rockchip.update.service` | `pm enable android.rockchip.update.service` |
| Kiosk | `adb install` of `dashboard/kiosk`, `pm grant com.wesbos.homehq android.permission.WRITE_SECURE_SETTINGS`, URL saved with `scripts/set-kiosk-url.sh` | `adb uninstall com.wesbos.homehq` |
| Kiosk as HOME | `am start -n com.wesbos.homehq/.MainActivity --ez home true`, then `cmd package set-home-activity com.wesbos.homehq/.Home` | Pick another Home app, then `--ez home false` |
| Disable Frameo | `pm disable-user --user 0 net.frameo.frame` | `pm enable net.frameo.frame` |
| Time zone | `su -c "setprop persist.sys.timezone <zone>"`, `su -c "service call alarm 3 s16 <zone>"` | the same with `America/Los_Angeles` |

- `package-restrictions.xml` showed Frameo `enabled="3"` and the kiosk's HOME preference about
  3 s after the commands. The reboot was done after 30 s; afterwards the frame booted into the
  kiosk, and Frameo and both updaters were not running.
- With the `WRITE_SECURE_SETTINGS` grant, the kiosk's floating **Back / Dashboard** buttons appeared.
  They are the only navigation on this frame, since SystemUI is disabled.
- `service call alarm 3` without root returned a `SET_TIME_ZONE` permission error; with `su -c` it
  succeeded.
- **Portrait:** the kiosk declares `android:screenOrientation="sensorLandscape"`. Changing it to
  `sensorPortrait` in `dashboard/kiosk/AndroidManifest.xml` and reinstalling with `adb install -r`
  gave 1080x1920 (`SurfaceOrientation: 3` with the frame standing), and the Home Assistant login
  was kept. Not a repo change.
- After the screen was turned off with `input keyevent 26`, touching the panel did not wake it;
  `input keyevent 224` did. The kiosk holds the screen on, so this matters only if something turns
  the screen off.

## Motion sensor (PIR)

The case has a square opening where a PIR sensor would sit, and Frameo offered no motion-sensor
setting. Observations:

- Kernel driver `pir_sensor` (device-tree node `pir_sensor`, `status = okay`) owns gpio-121
  (`gpio3` pin 25, IRQ `pir_sensor`, edge) and logs `[ZBY] PIR pir_gpio_status = 0` every 5 s.
- `/dev/input/event0` (`GPIO`) reports only `KEY_WAKEUP`.
- Over two walk-away/walk-up tests with the screen on and one with the screen off for 3 minutes,
  gpio-121 read `hi` throughout, the IRQ count stayed 0, the log stayed 0, and no `KEY_WAKEUP`
  arrived. The screen did not wake.
- `/sys/bnd/pir_sensor_status` (mode 0777) reads 0; writing 1 did not change it. In
  `/proc/kallsyms`, `pir_sensor_store_bnd` is 8 bytes long, so the write handler appears empty.
  Writing 1 to `/sys/bus/platform/devices/pir_sensor/pir_sensor` only logged
  `pir_sensor_store() pir_gpio_status = 0`.
- Frameo's `MotionSensorHandler` uses Android's proximity sensor. The HAL
  (`/vendor/lib/hw/sensors.rk30board.so`) lists a proximity sensor that expects `/dev/psensor` or an
  input device named `proximity`; neither exists.

## Boot screens

- The boot logo is `logo.bmp` / `logo_kernel.bmp` (identical, 1920x1080, 8 bpp) in the `resource`
  partition (`RSCE`), next to `rk-kernel.dtb`. Not changed.
- `/system/media/bootanimation.zip` holds four parts at 870x432 on white.
  `/system/lib/libbootanimation.so` contains `/oem/media/bootanimation.zip` and
  `/oem/media/shutdownanimation.zip` as well as the `/system/media` paths, and a Rockchip boot
  video path `/data/local/bootanimation.ts` with `persist.sys.bootvideo.enable`. `/oem` is a
  separate ext4 partition (`rknand0p14`, 104 MB free) with no `media/` folder. Not changed.

## Guesses, not confirmed

- The PIR module is probably not fitted on this unit: a pin that stays high with no edges fits a
  pull-up and an empty footprint. The opening is probably shared with models that have it.
- The USB drop during the backup was probably a power issue: the frame rebooted rather than just
  disconnecting.
- A zip at `/oem/media/bootanimation.zip` would probably replace the boot animation without
  editing `/system`, if the library checks it first as AOSP 8.1 does. Not tried.

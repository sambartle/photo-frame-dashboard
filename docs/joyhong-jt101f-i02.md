# Joyhong 10.1" Frameo frame (`JT101F-I02`, Allwinner A33, Android 6.0.1)

Record of one unit, started 2026-10-12. Observations are kept separate from guesses. Unique
identifiers (serial, MAC, IP) are left out; they live in the ignored `backups/` folder.
Host: macOS on Apple silicon.

**Short version:** this frame ships with **root ADB over Wi-Fi on port 5555**, enabled in
`/system/build.prop`. No USB, boot patch, FEL or SD card is needed. Find the frame's IP in
Settings → Wi-Fi and run `adb connect <ip>:5555`.

## Observations (read-only unless noted)

### Identity

| | |
| --- | --- |
| Label / model | `JT101F-I02` (`ro.product.device=JT101F-I02`, `ro.product.model=JT101F_I02`) |
| Manufacturer / brand | `joyhong` / `Frameo1` |
| Firmware | `JT101F-I02_A33M_20260107-1352_V02` |
| Fingerprint | `joy/astar_ococci/astar-ococci:6.0.1/MOB30R/20260107:user/test-keys` |
| SoC | Allwinner A33 (`ro.board.platform=astar`, `ro.hardware=sun8i`), 32-bit ARMv7 |
| Kernel | Linux 3.4.39, built 2026-01-07 |
| Android | 6.0.1, security patch 2016-07-05 |
| Display | 1280x800, 160 dpi |
| RAM / storage | about 1 GB RAM, 29 GB eMMC (`mmcblk0`), `/data` (`UDISK`) 27 GB |
| WebView | `com.android.webview` 106.0.5249.126 in `/system/app/webview` (already current for this repo's Vite target) |
| SELinux | Permissive |
| Wi-Fi | Espressif ESP8089 over SDIO (`esp8089` module, SDIO ID `6666:1111`). Works. Bulk ADB transfers ran at 0.5 to 1 MB/s |

This is the same SoC as the [PF1007L](allwinner-a33-pf1007l.md), and the boot partition starts at the
same sector (172032), but it is a different vendor build (Joyhong, Frameo home app, no AiMOR). Do
not assume PF1007L boot image hashes or offsets beyond what is listed here.

### USB

Nothing enumerated on the Mac over USB-C with two different cables: no USB device, and no USB
events in the macOS kernel log. A USB-A to USB-C cable was not tried. Network ADB made it unnecessary.

What the frame reports with the USB-C cable to the Mac:

- `/sys/class/script/dump` for `usbc0`: `usb_port_type 2` (OTG), `usb_detect_type 1`,
  `usb_id_gpio PH8`, `usb_det_vbus_gpio "axp_ctrl"`.
- `/sys/class/power_supply`: `ac` online 1, `usb` online 0. The PMIC sees the input as AC, not USB VBUS.
- `/sys/devices/platform/sunxi_usb_udc/otg_role` stays `0` (no role). `sys.usb.config=adb`, gadget state `DISCONNECTED`.
- Reading `/sys/devices/platform/sunxi_usb_udc/usb_device` (it switches the controller to device mode and prints
  `device_chose finished!`) produced no USB device on the Mac, and `otg_role` read `0` again immediately afterwards.

Guess, not verified: the USB-C port feeds only the PMIC's AC input and its data lines do not reach the A33 OTG port.

### ADB and root

- `/system/build.prop` line 28: `service.adb.tcp.port=5555`. `adbd` listens on `0.0.0.0:5555` from boot.
- `/default.prop`: `ro.secure=1`, `ro.debuggable=1`, `persist.sys.usb.config=adb`. `ro.adb.secure=1`.
- `adbd` runs as root: `adb shell id` → `uid=0(root) ... context=u:r:su:s0`. `/system/xbin/su` and
  `/system/xbin/daemonsu` are present (SuperSU-style, 75 KB each).
- `/data/misc/adb/adb_keys` holds one key that ships with the frame. It is not the host's key.
- **ADB does not check keys.** A host with a freshly generated key, never seen by the frame, got a
  root shell at once over Wi-Fi, and no prompt appeared on the screen. In practice, anything on the
  same network can get a root shell on this frame.
  Keep it on an isolated or guest network, and never on a network shared with untrusted devices.
- `adbd` serves one TCP client at a time. A second host shows the frame as `offline` until the first
  disconnects. This is easy to mistake for an authorization prompt.
- Listening TCP ports: only `5555` (adbd) and `127.0.0.1:5037`.

### Software of interest

| Package | Location | Notes |
| --- | --- | --- |
| `net.frameo.frame` v1.32.12 | `/data/app`, not `/system` | Slideshow app and the only **HOME** activity. Cloud connected. |
| `com.waophoto.fota` 1.0 | `/system/priv-app/Fota` | Vendor OTA updater. Has `INTERNET`, `INSTALL_PACKAGES` and `REBOOT`. Disable before relying on root ADB. |
| `com.joyhong.test` 2.0.33 | `/system/priv-app/Test` | Factory test app. |
| `jp.co.omronsoft.openwnn` | `/system/app/OpenWnn` | Japanese IME. |

No launcher other than Frameo and no browser are installed. `com.android.systemui` ships disabled
(`enabled="2"` in `package-restrictions.xml` before any change), so there is no status bar or navigation bar.

### Other hardware

- Sensors: `mir3da` accelerometer, and an "ambient temperature" sensor that is the SoC thermal sensor
  (`sunxi-ths`). No light, proximity or motion sensor.
- Input devices: `gslX680` touchscreen, `sunxi-ir` (an IR receiver input, not tested), `sunxi-keyboard`
  (buttons), `axp22-supplyer` (power key).
- Camera: the camera service reports 2 devices, but there is no `/dev/video*` node. Probably a generic
  HAL configuration with no camera fitted.
- USB-A socket: USB 2.0 host (EHCI/OHCI). `android.hardware.usb.host` is declared. Modules for
  USB Ethernet are loaded (`asix`, `cdc_ether`, `mcs7830`, `qf9700`) and `ethernet-service.jar` is
  present. A USB Ethernet adapter was not tested.
- No RTC battery: after every reboot the clock starts at 1970-01-01 until network time syncs, about
  a minute after boot on this network.

### Partition table (eMMC `mmcblk0`, 512-byte sectors, 61,071,360 sectors total)

From `/sys/block/mmcblk0/*/start`. The kernel command line lists the same names.

| Partition | Name | Start | Size (sectors) |
| --- | --- | --- | --- |
| p2 | bootloader | 73728 | 65536 |
| p5 | env | 139264 | 32768 |
| p6 | boot | 172032 | 32768 |
| p7 | system | 204800 | 2097152 |
| p8 | misc | 2301952 | 32768 |
| p9 | recovery | 2334720 | 65536 |
| p10 | cache | 2400256 | 524288 |
| p11 | metadata | 2924544 | 32768 |
| p12 | private | 2957312 | 32768 |
| p13 | frp | 2990080 | 1024 |
| p14 | empty | 2991104 | 31744 |
| p15 | alog | 3022848 | 81920 |
| p16 | media_data | 3104768 | 32768 |
| p1 | UDISK (`/data`) | 3137536 | 57933824 |

`mmcblk0boot0` and `mmcblk0boot1` are 4 MiB each.

## Backup

Done over network ADB as root (2026-10-12). Files are in the ignored `backups/` folder.

- `emmc-0-3137536.img.gz`: eMMC sectors 0 to 3,137,536, everything before `UDISK`. 1,606,418,432 bytes raw,
  377 MB gzipped. The SHA-256 of the raw stream equals the gzip readback hash.
- No 1 MiB block is entirely `0xCC` (827 of 1,532 are all zero).
- Fresh reads match the backup for `bootloader`, `env`, `boot`, `recovery`, `frp`, the first 64 MiB of
  `system` and 32 MiB from the middle of `system`.
- `mmcblk0boot0` and `mmcblk0boot1`: 4 MiB each, saved separately.
- `UDISK` (`/data`, 573 MB used of 27 GB) was saved as a `tar` of the mounted filesystem, not as a raw image.

At about 0.5 to 1 MB/s over the ESP8089 Wi-Fi, the raw image took about 40 minutes.

Boot image: Android boot header, page size 2048, kernel 10,191,044 bytes, ramdisk 4,779,533 bytes,
29,248 sectors in total from sector 172032.
SHA-256 of those 29,248 sectors: `f294ef858752f69a3f25d61fd625e5b5970e96852c40f513a943e77005e95c1f`.
SHA-256 of 31,028 sectors from sector 172032 (the length the PF1007L template uses):
`3b77d1227a0e2b7013ad99be7189b9abaccd3c75932ba89dfcf2c9cb5a6cd24d`.

## Setup done on this unit (2026-10-12)

All over network ADB, after the backup above. Each step has an undo.

| Step | Command | Undo |
| --- | --- | --- |
| Disable the vendor updater | `pm disable com.waophoto.fota` | `pm enable com.waophoto.fota` |
| Install the kiosk from [`dashboard/kiosk`](../dashboard/kiosk) | `adb install -r homehq.apk` | `pm uninstall com.wesbos.homehq` |
| Make the kiosk the Home app | `pm disable net.frameo.frame` (later removed, see below) | `pm enable net.frameo.frame` |

The kiosk used here was built with three local changes:

- An extra `MAIN` + `HOME` intent filter in `AndroidManifest.xml`, so it starts at boot as the Home app.
- [#10](https://github.com/wesbos/photo-frame-dashboard/pull/10): the two-finger exit opens another launcher if one is installed.
- [#9](https://github.com/wesbos/photo-frame-dashboard/pull/9): retry failed main-frame loads. This was
  not enough on its own on this frame. At boot, DNS fails for about 15 seconds. After that, the page fails
  with SSL error 4 (date invalid), because the clock is still at 1970. That goes to `onReceivedSslError`,
  not `onReceivedError`, so the kiosk stayed on the error page. The local build also cancels SSL errors
  and retries when the failing URL is the main page URL. The retry reloads the main URL, not the
  failing URL, and only one retry is pending at a time. With that build, the dashboard loaded on its own
  after a cold boot, once the clock had synced.

### Certificate store

The stock store (`/system/etc/security/cacerts`, 157 roots from 2016) has no Let's Encrypt roots. The
dashboard's mock photos from `fastly.picsum.photos` (chain: YR2 → Root YR → ISRG Root X1) failed with SSL
error 3 (untrusted), and the photo tile stayed black. The dashboard itself (Cloudflare) verified against
both stores.

There is no updatable CA package on Android 6. The CA APEX arrived in Android 14. The store was replaced
with the AOSP one from [`platform/system/ca-certificates`](https://android.googlesource.com/platform/system/ca-certificates)
at `45c7f199cb11b08f6d1ae2b75da25e53140a0c7d` (2025-02-10). It uses the same `<subject_hash_old>.0` PEM format:

- 149 files. Every one parses, and every filename matches `openssl x509 -subject_hash_old`. One is expired.
- `6187b673.0` (ISRG Root X1) and `8794b4e3.0` (ISRG Root X2) fingerprints match the ones pinned in
  `scripts/biuframe-setup.sh`.
- Compared with stock: 91 files removed, 82 added.
- Before installing, `openssl s_client -CAfile` against each store, on the host: `home-dashboard.wesbos.workers.dev` OK with both,
  `fastly.picsum.photos` fails with stock (code 20) and is OK with AOSP.

```sh
# staged in /data/local/tmp/cacerts.new, then as root:
cd /system/etc/security && mount -o remount,rw /system
cp -r /data/local/tmp/cacerts.new cacerts.new
chown -R 0:0 cacerts.new && chmod 0755 cacerts.new && chmod 0644 cacerts.new/*
chcon -R u:object_r:system_file:s0 cacerts.new
mv cacerts cacerts.stock && mv cacerts.new cacerts
sync && mount -o remount,ro /system
```

After a reboot, the on-device MD5s match the AOSP files, and there were no SSL errors in the kiosk log.
The photo tile loads. Undo: swap `cacerts.stock` back into place.

> **eMudhra (October 2026).** Eight eMudhra intermediate CAs had weak keys. Browsers block them
> through updates that a frame's WebView never gets. They chain to `75680d2e.0` (AAA Certificate
> Services, in stock Android 6 stores) and `b74d2bd5.0` (emSign ECC Root CA - G3, in newer AOSP
> stores). Distrust them without a `/system` write. As root, copy each one present into
> `/data/misc/user/0/cacerts-removed/` (folder `system:system` 0755, files 0644), then restart the
> kiosk. To undo, delete the copies. Tested on two PF1007L units
> ([#229](https://github.com/wesbos/photo-frame-dashboard/issues/229)).

### Removing Frameo and vendor apps

Each file was copied to the host before deletion, and its MD5 on the device matched the copy:

| Removed | Notes |
| --- | --- |
| `net.frameo.frame` | `pm uninstall` removed the `/data/app` update and data. Then the system copy `/system/priv-app/CloudPhotoFrame.apk` (64 MB) was deleted. |
| `/system/priv-app/Fota` | `com.waophoto.fota` |
| `/system/priv-app/Test` | `com.joyhong.test` and its `lib/arm` RenderScript libraries |
| `/system/media/bootanimation.zip` | Frameo boot animation. Android falls back to the stock "android" animation. |

After a reboot, none of these packages are listed. `com.android.systemui` was re-enabled
(`pm enable com.android.systemui`), so the status bar and navigation bar are back. Rootless Launcher 3.9.1
(F-Droid, SHA-256 as in [allwinner-a33-pf1007l.md](allwinner-a33-pf1007l.md)) was installed as a second
Home app, so the kiosk's two-finger exit has somewhere to go. The first boot with two Home apps shows the
chooser. Picking the kiosk with "Always" stuck across later reboots.

### Boot splash

The first image at power-on is `bootlogo.bmp` on the `bootloader` partition (FAT16), and it shows the Frameo logo.
It is 800x1280, 24-bit, bottom-up, with the artwork rotated 90° counter-clockwise because the panel is portrait.
The same partition also holds `bat/`, `font24.sft`, `font32.sft` and `magic.bin`. They were left alone.

It was replaced with a same-size image that uses the original 54-byte header unchanged.
**Copy the original `bootlogo.bmp` off the frame first.** A bad write to this partition can stop the
frame from booting. Method:

```sh
mkdir -p /data/local/tmp/bl
mount -t vfat -o rw /dev/block/by-name/bootloader /data/local/tmp/bl
cp /data/local/tmp/new-bootlogo.bmp /data/local/tmp/bl/bootlogo.bmp && sync && umount /data/local/tmp/bl
```

Read back after `drop_caches` from a read-only mount, the MD5 matches, and the frame booted normally
afterwards. The owner confirmed that the new splash shows the right way up at power-on.

## Report

```text
About model / firmware:   JT101F-I02, JT101F-I02_A33M_20260107-1352_V02 (Frameo home app, not AiMOR)
AiMOR version:            not installed
Ports (DC jack, or USB-C only): USB-C (power) and a USB-A host socket, no DC jack
Cable and port that gave USB data (or none): none, two USB-C cables tried on macOS
T3 USB IDs seen / adb devices output: nothing over USB
T3b network ADB result (port 5555): open, root shell, product astar_ococci
T4 sunxi-fel version output (or skipped): skipped
T5 check-dump stage / chunks (or skipped): skipped
eMMC size in sectors:     61071360
Boot partition start sector: 172032
Boot image SHA-256 (sector 172032, 31,028 sectors): 3b77d1227a0e2b7013ad99be7189b9abaccd3c75932ba89dfcf2c9cb5a6cd24d
Route used and result:    stock network ADB, root out of the box
Host OS:                  macOS (Apple silicon)
First failed step and its exact output: none
```

## Second unit (C01 badge)

Record of one unit, started 2026-10-16. Observations are kept separate from guesses. Unique
identifiers (serial, MAC, IP) are left out. Host: Windows 11.

**Short version:** same firmware image as the I02 above — identical build fingerprint — just a
different model-name badge (`C01` vs `I02`). Root ADB over Wi-Fi on port 5555, no key check, exactly
as documented above. The USB test was inconclusive (see below).

### Identity (C01)

| | |
| --- | --- |
| Label / model | `JT101F-C01` (`ro.product.device=JT101F-C01`, `ro.product.model=JT101F-C01`) |
| Fingerprint | `joy/astar_ococci/astar-ococci:6.0.1/MOB30R/20260107:user/test-keys` — identical string to I02's |
| eMMC size | 61,071,360 sectors — identical to I02 |
| Partition table | same names, start sectors and sizes as I02's table (bootloader, env, boot, system, misc, recovery, cache, metadata, private, frp, empty, alog, media_data, then `UDISK` at sector 3,137,536) |
| Installed packages | `net.frameo.frame`, `com.waophoto.fota`, `com.joyhong.test`, `jp.co.omronsoft.openwnn` — same set as I02 |
| SELinux | Permissive |
| `/data` usage at receipt | 336 MB used of 27.2 GB free — looked like a fresh/unused unit |

### USB (C01)

**Inconclusive.** The report describes the cable two ways: here the frame was on the USB-A end, and
in the Report block the USB-A end went into Windows. If the frame's USB-A *host* socket was used, this
test says nothing about the USB-C port. As written:
Tried a USB-A-to-USB-C cable, frame on the USB-A end, a Windows 11 laptop on the USB-C end.
Windows played its device-connect chime on plug-in, but: `adb devices` showed nothing, no new
entry appeared in `Get-PnpDevice` (checked both before and after an unplug/replug), and
`setupapi.dev.log` recorded no new device section for that time window. Whatever triggers the
connect sound is not a real USB enumeration. If the frame's USB-C port was used, this matches the I02's result.

### ADB and root (C01)

Confirmed exactly as [above](#adb-and-root): `service.adb.tcp.port=5555` is set in
`/system/build.prop`, and `adbd` runs as root with no key check over the network.
`adb connect <ip>:5555` then `adb shell id` returns `uid=0(root)`, immediately, no prompt on
the frame's screen. Keep it on an isolated network: anything on the same network gets a root shell.

### Boot image hash differs from I02, despite the identical fingerprint string

Both units report the same `ro.build.fingerprint`, but the boot partition's actual bytes are
not identical between the two:

| Sectors from 172032 | I02 (reported) | C01 (this unit, measured) |
| --- | --- | --- |
| 29,248 (Android header + kernel + ramdisk) | `f294ef858752f69a3f25d61fd625e5b5970e96852c40f513a943e77005e95c1f` | `69dcbd74d60b3d0a2a6d27c81dbbe2a26a9da1f8c2dcb982e06477162a3ceefd` |
| 31,028 (the length the PF1007L template uses) | `3b77d1227a0e2b7013ad99be7189b9abaccd3c75932ba89dfcf2c9cb5a6cd24d` | `7f619245e7c88aab5399ec673d2a592f89b811cf978615042aec32a71e050ae3` |

Worth knowing if anyone writes a boot-image-hash-based guard for this device family: the build
fingerprint string alone does not guarantee byte-identical boot partitions across model-name
badges, even from the same vendor and the same build date. A likely cause is a model string baked
into the ramdisk's `default.prop` (`ro.product.model` differs: `JT101F-C01` vs `JT101F_I02`), not
a kernel or app difference.

(Only this sub-range's hash is published, per the repository's rule not to publish a whole-eMMC
hash as it would double as a device identifier. A full pre-modification backup was taken and its
SHA-256 verified after transfer, but is not included here.)

### Setup done on this unit (2026-10-16)

All over network ADB, after a verified backup of the pre-`UDISK` eMMC region and both eMMC boot
partitions (`mmcblk0boot0`/`boot1`). Each step has an undo.

| Step | Command | Undo |
| --- | --- | --- |
| Build the kiosk | `build.ps1` from `dashboard/kiosk/`, on Windows, with JDK 17 (Temurin) and Android `build-tools;34.0.0` + `platforms;android-34` (command-line tools only, no Android Studio) | n/a — local build output |
| Install the kiosk | `adb install -r homehq.apk` | `pm uninstall com.wesbos.homehq` |
| Make the kiosk Home, keep Frameo as fallback | `adb shell am start -n com.wesbos.homehq/.MainActivity --ez home true`, then `adb shell am start -a android.intent.action.MAIN -c android.intent.category.HOME` to raise the chooser, then tapped **Home HQ** → **Always** on the frame's screen | pick another Home app in Settings → Apps → Default apps, then the first command again with `--ez home false` |
| Disable the vendor updater | `pm disable com.waophoto.fota` (fine on this A33 build; on the A133 [C-2 calendar](joyhong-c2-a133.md#the-vendor-fota-boot-hook-read-this-before-disabling-anything) the same command crashes every app at boot) | `pm enable com.waophoto.fota` |

`cmd package set-home-activity` is not available on this Android 6 build (`/system/bin/sh: cmd:
not found`), same as the PF1007L/BIUFRAME units the kiosk README already calls out — the chooser
route was needed here too.

After these steps, `/data/system/users/0/package-restrictions.xml` shows:

```xml
<preferred-activities>
    <item name="com.wesbos.homehq/.Home" match="100000" always="true" set="2">
        <set name="net.frameo.frame/.ui.activities.AWaitForDeferredInitCompleted" />
```

confirming the Home preference stuck and that Frameo is retained in the set as the other option.
Pressing the Home key opens `com.wesbos.homehq/.Home` directly. The kiosk loaded the repository's
hosted demo dashboard (its compiled-in default URL) over the frame's Wi-Fi with no further changes
needed — no certificate-store patch was required for that hosted page.

This is also, as far as this report's author found, the first worked end-to-end report of
`dashboard/kiosk/build.ps1` (the Windows build path) against a real unit; the kiosk README
documents the script but had no linked unit report.

### Report (C01)

```text
About model / firmware:   JT101F-C01, joy/astar_ococci/astar-ococci:6.0.1/MOB30R/20260107:user/test-keys
Ports (DC jack, or USB-C only): USB-C (power) and a USB-A host socket, no DC jack
Cable and port that gave USB data (or none): none, USB-A-to-USB-C cable into a USB-A port on Windows 11
T3 USB IDs seen / adb devices output: nothing; Windows played a connect chime but no PnP entry, no setupapi.dev.log entry
T3b network ADB result (port 5555): open, root shell, product astar_ococci, no key check
eMMC size in sectors: 61071360
Boot partition start sector: 172032
Boot image SHA-256 (sector 172032, 31,028 sectors): 7f619245e7c88aab5399ec673d2a592f89b811cf978615042aec32a71e050ae3 (differs from I02's, see above)
Route used and result: stock network ADB, root out of the box, same as JT101F-I02
Host OS: Windows 11
First failed step and its exact output: none
```

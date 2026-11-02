# SOMY M10R7 10.1" (FLYRUIT box, Frameo, Allwinner A33 `astar_xr819`, Android 6.0.1)

Record of one unit, tested on 2026-10-21. Host: macOS on a personal Mac (a managed work Mac
blocked unknown USB devices and was not used for the frame). Observations are kept separate from
guesses. The serial, MAC addresses, eMMC CID and the patched boot hash (it contains the owner's
ADB key) are left out.

**Short version:** the USB-C port gave no USB device at all, and network ADB was closed, so no
stock ADB route was found. The repository's [SD-card route](allwinner-a33-sdcard-adb-wifi.md)
worked from the TF slot after one change: U-Boot had to run the eMMC at **4-bit, 26 MHz**. A
boot ramdisk patch then gave key-only ADB over Wi-Fi, and the shipped `su 0` gives UID 0. The
[kiosk](../dashboard/kiosk/README.md) runs as Home with WebView 106.

## Identity

| Item | Observed value |
| --- | --- |
| Box / About screen | Box says FLYRUIT. Frameo About shows `DPF M10R7` |
| Listing | [Amazon US B0F33714J4](https://www.amazon.com/dp/B0F33714J4?tag=webo080-20). Listings may change hardware |
| Brand / model | `ro.product.brand=SOMY`, `ro.product.model=M10R7` |
| Firmware | `ro.build.display.id=M10R7_20260313` |
| Fingerprint | `Allwinner/astar_xr819/astar-xr819:6.0.1/MOB30R/20260313:eng/test-keys`. `ro.build.type` is `user` |
| Properties | `ro.secure=1`, `ro.config.low_ram=true` |
| SELinux | Permissive |
| WebView | 106.0.5249.126 |
| Frameo | Updated itself to `v1.32.16_-_OTA_test` (80321) after the owner joined the beta program |
| SystemUI | `com.android.systemui` disabled (listed by `pm list packages -d`); no navigation bar |

### Closest relatives in this repo

- [Pastigio / SOMY ZC002](pastigio-zc002.md): same brand, platform and firmware date
  (`ZC002_20260313`). The boot image length (14,911,488 bytes), kernel size (10,165,848 bytes),
  ramdisk slot and recovery length (15,583,232 bytes) match the ZC002 values, and so do the
  partition starts below. The boot image hash does not.
- [SOMY M10R5](https://github.com/wesbos/photo-frame-dashboard/issues/177): same brand and
  naming, `astar_xr819`. That unit enumerated over USB but stayed `unauthorized`.
- The [second Pastigio unit](pastigio-zc002.md#route-u-needed-4-bit-26-mhz-emmc) also needed
  4-bit 26 MHz eMMC.

## No stock ADB route found

| Test | Result |
| --- | --- |
| Frameo Settings → About → Beta Program → ADB access | Turned on |
| macOS, known-good USB-A to USB-C cable | No new device in `system_profiler SPUSBDataType`; the listing before and after plugging in was identical. `adb devices -l` empty |
| Toggling ADB access with the cable in | No change |
| TCP 5555 on the frame's LAN address | Closed (the frame answered ping) |

Guess, not verified: the USB-C port is wired for power only, as suspected on the
[Joyhong JT101F-I02](joyhong-jt101f-i02.md). USB was not tested from Windows or Linux, and FEL
over USB was not tried.

## SD-card route

The [macOS steps](allwinner-a33-sdcard-adb-wifi.md#macos) were followed with a 16 GB card.
The screen stays dark while the card's U-Boot runs.

### The stock build could not read the eMMC

With the unchanged `scripts/a33-sdboot/` build (8-bit eMMC), `a33-status.txt` read:

```
a33_stage=finished
emmc_dev=ok
p1_size=35d6000
p1_start=412000
st_00=FAIL first read
```

U-Boot found the eMMC and read the partition table, but the first 64 MiB read failed.

### 4-bit 26 MHz worked

Rebuilt from the same pinned source with one device-tree change in
`arch/arm/dts/sun8i-a33-sinlinx-sina33.dts`, `&mmc2`:

```diff
-	bus-width = <8>;
+	bus-width = <4>;
+	max-frequency = <26000000>;
```

The compiled DTB showed `bus-width = <0x04>` and `max-frequency = <0x18cba80>`. With that card,
the dump finished in under 45 minutes and `card-macos.py backup` verified all 32 chunks.

Note for macOS: `card-macos.py clean` only accepts the build that is on the card. Run it before
rebuilding, or put the old build back first. Copying files to the card failed with
`Operation not permitted` until the terminal app was given access to removable volumes (Privacy
& Security).

### Partitions

| | Start (sectors) | Size (sectors) | Notes |
| --- | --- | --- | --- |
| p1 | 4268032 | 56451072 | Type `0x0b` in the MBR. `/data` starts here on the ZC002 and 102K too |
| p2 | 73728 | 65536 | |
| p3 | 1 | 4128768 | Extended |
| p5 | 139264 | 32768 | |
| p6 | 172032 | 32768 | boot (`ANDROID!` image) |
| p7 | 204800 | 2097152 | |
| p8 | 2301952 | 32768 | |
| p9 | 2334720 | 65536 | recovery (`ANDROID!` image) |
| p10 | 2400256 | 1572864 | |
| p11–p16 | 3973120–4235264 | | small partitions, not examined |

### Boot and recovery images

| | Boot (p6) | Recovery (p9) |
| --- | --- | --- |
| Length | 14,911,488 B | 15,583,232 B |
| SHA-256 | `529ef1ee32e546e847f532c640922800d05edff986bb819f6dd9fa38c3c650be` | `7c65f521a048b35fbcfe80b6328baad71ee91d9f60147674462ead12d7de32f5` |
| Kernel / ramdisk | 10,165,848 / 4,741,147 B, page 2048, no second or dt | 10,165,848 / 5,413,571 B |
| Command line | `vmalloc=384M` | `vmalloc=384M` |
| `default.prop` | `ro.secure=1`, `ro.debuggable=0`, `persist.sys.usb.config=none` | also `ro.adb.secure=1`, `persist.sys.usb.config=adb` |

`patch-boot.py`'s cpio writer reproduced the stock ramdisk byte for byte, and the header's boot
id matched.

### Patch and write

The patch is the one in [section 2 of the SD-card guide](allwinner-a33-sdcard-adb-wifi.md#2-what-the-patch-changes):
`ro.adb.secure=1`, `service.adb.tcp.port=5555`, `on boot` → `start adbd`, and one `/adb_keys`
line. At the time, copies of `patch-boot.py` and `build-write.sh` were edited with this unit's
length (14,911,488 bytes, 29,124 sectors) and hash (`529ef1ee…`). Don't do that: `build-write.sh`
now lists this image as tested, and `patch-boot.py` takes
`--boot-len 14911488 --expect-sha256 529ef1ee32e546e847f532c640922800d05edff986bb819f6dd9fa38c3c650be`.

p6 starts at sector 172032 (`0x2a000`), as on the PF1007L, so `boot-write.cmd.in` is unchanged.
The new ramdisk compressed to 4,727,586 bytes, smaller than the stock 4,741,147, so it fits the
existing slot. The report showed `kernel region identical: True` and
`header identical except size/id: True`.

The write was run with the 4-bit card: `result=OK_WRITTEN_AND_VERIFIED`, `h_before` the stock
hash above. The restore files were kept.

## After the patch

- `adb connect <ip>:5555` with the owner's key: `adb shell id` is UID 2000,
  `context=u:r:shell:s0`. Still works after a reboot.
- `su 0 id` gives UID 0, `context=u:r:shell:s0`, no prompt (shipped setuid-root `su`).
- `su 0` can't read `/data/system/users/0/package-restrictions.xml` (`Permission denied`). Guess,
  not verified: it keeps only `CAP_SETUID`/`CAP_SETGID`, as on the
  [second Pastigio unit](pastigio-zc002.md#su-0-from-adb-has-no-capabilities).
  `su 1000` (the `system` user, which owns the file) can read it, and can write
  `/data/misc/user/0/`. `dumpsys package preferred` shows the preferred Home without root.
- At runtime `persist.sys.usb.config=mtp,adb`, `sys.usb.config=adb`, `init.svc.adbd` running.

## Vendor software

| Package / process | Notes |
| --- | --- |
| `com.adups.fota` (`/system/app/FotaUpdate`) | Adups OTA client, running at boot. **Disabled** with `su 0 pm disable com.adups.fota` so an update can't replace the patched boot image |
| `net.frameo.frame` (`/data/app`) | **Disabled** after the kiosk was Home (see below). HOME before the kiosk. Its process was the parent of two root `/system/bin/sh` processes, as on the [Skyrhyme 168](skyrhyme-168.md). All established internet connections belonged to its UID (HTTPS to Cloudflare, DigitalOcean and Google addresses, one plain HTTP connection) |
| `com.along.factorytest`, `com.along.table`, `com.softwinner.dragon*` | Factory test apps in `/system/app`; not running |
| `com.softwinner.fireplayer` | User-installed media player |
| `sayeye` | Running init service; not examined |

No AiMOR app and no `iotv`-style daemon were found.

## Kiosk

- Built with `dashboard/kiosk/build.sh` and installed over Wi-Fi ADB.
- Navigation service enabled with `settings put secure enabled_accessibility_services
  com.wesbos.homehq/.NavigationService` and `accessibility_enabled 1`, after granting
  `WRITE_SECURE_SETTINGS`. Checked by hand on the panel: the two-finger menu opens, **Android
  settings** opens Settings, and the floating **Dashboard** button returns to the kiosk.
- With `ro.config.low_ram=true`, one visit to Settings left no `am_kill` or `am_proc_died` events
  for the kiosk. Not tested over longer use.
- Home set with the Android 6 chooser (`--ez home true`, then **Home HQ** → **Always**). After a
  reboot, `mFocusedActivity` was `com.wesbos.homehq/.Home`; Frameo did not take Home back.

## HTTPS to `workers.dev`: ISRG Root X1 in the user store

A dashboard on the owner's own `*.workers.dev` address showed "Can't reach the dashboard". That
address's certificate chain was YE1 → Root YE → ISRG Root X2, and Android 6's store has no ISRG
root, so WebView rejected it. The repo's hosted demo (`wesbos.workers.dev`) loaded fine because
its chain goes through GTS Root R4 to GlobalSign Root CA, which the frame trusts. Cloudflare's
Access login page (`*.cloudflareaccess.com`) also chains to GlobalSign.

Fixed as on the [Frameo 114K](frameo-114k-a33.md#https-lets-encrypt-root-in-the-user-store), in
the **user** store, no `/system` write:

| Item | Value |
| --- | --- |
| Source | <https://letsencrypt.org/certs/isrgrootx1.pem>, SHA-256 fingerprint checked against the 114K page |
| File | `/data/misc/user/0/cacerts-added/6187b673.0`, written with `su 1000` (folder created), mode 0644 |
| Result | After a kiosk force-stop the dashboard loaded. ISRG Root X2 was not needed |
| Undo | `su 1000 rm` the file, force-stop the kiosk |

## Frameo disabled

`su 0 pm disable net.frameo.frame`, after the owner had checked by hand that the kiosk's
two-finger menu reaches Android Settings and its floating Dashboard button returns. As the
[Skyrhyme 168](skyrhyme-168.md) page warns, the change reaches
`package-restrictions.xml` some seconds later; the reboot waited until
`su 1000 grep` showed `enabled="2"` for `net.frameo.frame`. After the reboot:
`mFocusedActivity` was `com.wesbos.homehq/.Home`, no Frameo process was running, and Wi-Fi ADB
still worked (it comes from the boot patch, not from Frameo's ADB toggle). Undo:
`su 0 pm enable net.frameo.frame`.

## Network notes

- After one power cycle the frame's Wi-Fi details listed only IPv6 addresses. The dashboard kept
  loading over IPv6, but nothing answered at the old IPv4 address. A little later the frame
  answered ping and ADB at that address again; the cause was not found. Give the frame a fixed
  address (DHCP reservation, or a static IP in Android's Wi-Fi settings).
- With the boot patch, `adbd` accepts only the key in `/adb_keys`, and with SystemUI disabled
  there is no prompt for others. Observed once, not retested: after a second computer (whose key
  was not authorised) ran `adb connect`, the owner's computer got a bare `failed to connect` until
  the second computer ran `adb disconnect` and `adb kill-server`; that computer's ADB server had
  kept the refused connection as `unauthorized` and kept retrying it.

## Not tested

- USB from Windows or Linux, FEL over USB, a full-eMMC backup (only the first 2 GiB was dumped).
- The restore script on this unit.
- Long-term low-RAM behaviour, screen density.

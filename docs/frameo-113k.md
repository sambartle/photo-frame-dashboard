# Frameo 10.1" `113K` frame (RK3126, Android 6.0.1, firmware `113K_user_frameo_202607201039`)

Record of two units with the same firmware. Observations are kept separate from guesses. Unique
identifiers (serials, MAC addresses, ADB keys) are left out.

- **Unit 1** was set up on Linux on 2026-10-16 and reported in
  [#161](https://github.com/wesbos/photo-frame-dashboard/pull/161), which was closed without being
  merged. Its findings are summarized in [Unit 1: setup reported in #161](#unit-1-setup-reported-in-161).
- **Unit 2** was read and set up on macOS 26.6.2 (Apple silicon, platform-tools 36.0.0) on
  2026-10-21: read-only first, then a verified backup, then the changes in
  [Unit 2: setup performed](#unit-2-setup-performed), all in `/data`.

**Short version:** the same `incar` RK3126 platform build and eMMC partition layout as the
[Tibuta `TID10`](tibuta-tid10.md), [YIAISIGN `10X1`](yiaisign-10x1.md) and
[Uhale `102KZ`](uhale-102kz.md). Both units have the same boot partition hash. Stock WebView is
already 107 and both Let's Encrypt roots are already installed, so the
[Home HQ kiosk](../dashboard/kiosk/README.md) needs no `/system` changes. ADB comes from Frameo's
Beta Program settings. After a reboot it is `unauthorized`: in the one boot log captured, a root
`pm` call disabled SystemUI about 20 seconds after boot, so the authorization prompt could not open.
Toggling ADB access off and
on brings a prompt that closes itself and allows the computer once, so **Always allow** cannot be
ticked; appending the computer's public key to `/data/misc/adb/adb_keys` as root fixed it for good.
The shipped SuperSU `su` gives root to any caller without asking, and Frameo itself keeps two root
shells open.

## How it relates to the known RK3126 frames

| | This frame (`113K`) | Tibuta `TID10` | Uhale `102KZ` | YIAISIGN `10X1` |
| --- | --- | --- | --- | --- |
| Model / manufacturer | `113K` / `incar` | `TID10` / `incar` | `102KZ` / `incar` | `10X1` / `incar` |
| Build fingerprint | `…/user.fyl.20170927.202757:userdebug/test-keys` | same | same | same |
| Partition layout | `userdata` at sector 2,846,720 | same | same | same |
| Home app | Frameo (`net.frameo.frame` v1.31.18) | Frameo | Uhale (`com.zeasn.frame`) | Biu Frame (`com.shenju.biuframe`) |
| How ADB is enabled | Frameo Settings → About → Beta Program → ADB access, then toggle it after each boot, or add the host key to `adb_keys` once | Frameo Settings → ADB access | On, stays `unauthorized` | On out of the box |
| Stock WebView | 107.0.5304.36 | 107.0.5304.36 | 44 | 44 |
| Let's Encrypt roots | Pre-installed (`6187b673.0`, `8794b4e3.0`) | Added during setup | Added during setup | Added during setup |
| Wi-Fi driver | AICSemi AIC8800 (`aic8800_fdrv`, `aic8800_bsp`) | AIC8800 (`aic8800_fdrv`) | Not recorded | Realtek SDIO |

## Identity

Both units, unless noted.

| Item | Observed value |
| --- | --- |
| `ro.product.model` / `brand` / `manufacturer` | `113K` / `rockchip` / `incar` |
| `ro.product.device` / `ro.board.platform` / `ro.hardware` | `rk312x` / `rk312x` / `rk30board` |
| Build fingerprint | `rockchip/rk312x/rk312x:6.0.1/MXC89K/user.fyl.20170927.202757:userdebug/test-keys` |
| Display ID | `113K_user_frameo_202607201039`, built Mon Jul 20 10:39 CST 2026 |
| Android / ABI | 6.0.1, SDK 23, security patch 2016-11-01 / `armeabi-v7a`, SELinux `Permissive` |
| `ro.secure` / `ro.debuggable` / `ro.adb.secure` | `1` / `0` / `1`. `ro.build.type=user`; `ro.config.low_ram` unset |
| Kernel | Linux 3.10.0, built 2026-07-20 |
| USB, Android running | `2207:0006`, manufacturer string `incar`, product string `113K` |
| eMMC | 61,071,360 sectors of 512 bytes (about 29.1 GiB) |
| RAM / swap | 1 GB (`MemTotal: 1021240 kB`), 128 MB zram |
| Display | 1280 × 800, 160 dpi |
| Stock WebView | `com.google.android.webview` 107.0.5304.36 (`versionCode=530403610`) in `/system/app/webview` |
| Stock CA certificates | `6187b673.0` (ISRG Root X1) and `8794b4e3.0` (ISRG Root X2) in `/system/etc/security/cacerts/` |
| Boot partition (`mmcblk0p5`, 28,672 sectors) | SHA-256 `dc8d2d44a4a1b11c510fde7ab1bb5348868428b20f2f0bfc41556b3c1c28ceba`, SHA-1 `edab6205c599cb4151b9f08b12684afa0a62c5e4`, the same on both units. Unit 1 also reports that the 12,664,832-byte image inside it has SHA-1 `b59a6ef9da78f35944a09233a038e70070fb9b04`, matching `MTD:boot:12664832:b59a6ef9…` in `/system/bin/install-recovery.sh` |
| Time zone | `America/New_York` (`persist.sys.timezone` and `ro.frameo.default.timezone`) on unit 2 |

### Vendor apps

`pm list packages -f` outside `com.android.*` on unit 2; none were disabled as found:

| Package | Path | What it is |
| --- | --- | --- |
| `net.frameo.frame` | `/system/priv-app/newFrameo` | Frameo v1.31.18, the HOME app |
| `com.adups.fota` | `/system/app/FotaUpdate` | Adups FOTA over-the-air updater (v5.28 on unit 1); runs at boot |
| `com.DeviceTest` | `/system/app/DeviceTest` | Factory test app; runs at boot as the system user |
| `android.rk.RockVideoPlayer` | `/system/app/RkVideoPlayer` | Rockchip video player |
| `com.svox.pico` | `/system/app/PicoTts` | Text to speech |
| `com.google.android.webview` | `/system/app/webview` | WebView 107 |

No `/system/bin/iotv`, the hidden root program found on the
[Runxion RK3126](runxion-zn-dp1002-rk3126.md#hidden-root-agent-iotv). The `init` scripts in the
boot ramdisk define no service outside the usual Rockchip and AOSP set. `bplus_helper`, `akmd` and
`getbootmode` are defined but their programs are not on `/system`.

## Cables, ADB and root

### Cables

- Both units have a single USB-C port.
- USB-C to USB-C did not enumerate on either host: no kernel USB event on Linux (unit 1), nothing
  in `ioreg -p IOUSB` on macOS (unit 2). A USB-A to USB-C data cable enumerated at once as
  `2207:0006`. This matches the [Tibuta `TID10`](tibuta-tid10.md) and
  [Uhale `102KZ`](uhale-102kz.md#why-the-biuframe-route-stops-at-adb).

### Why ADB is `unauthorized` after a reboot

ADB access is Frameo → **Settings → About → Beta Program** (on) → **ADB access** (on). Unit 2 was
already set this way when it was first plugged in.

Unit 2's log after a reboot, with the cable already in:

```text
UsbDebuggingManager: Received public key: <host key>
ActivityManager: Unable to start service Intent { cmp=com.android.systemui/.usb.UsbDebuggingActivity (has extras) } U=0: not found
UsbDebuggingManager: unable to start customAdbPublicKeyConfirmation … as an Activity or a Service
```

The "Allow USB debugging?" prompt is SystemUI's `UsbDebuggingActivity`, and on unit 2 **SystemUI
was disabled about 20 seconds after boot**. Only one boot log was captured, so whether this happens
on every boot is not confirmed:

- `package-restrictions.xml` has `<pkg name="com.android.systemui" enabled="2" enabledCaller="shell:0" />`:
  a `pm disable` run as root.
- The log shows `Force stopping com.android.systemui … pkg changed` 19 s after boot, next to two
  processes that had already exited, while no ADB command was running. Frameo (which holds root
  shells) and `com.DeviceTest` (whose boot receiver starts 2 s earlier) were both running.
- An hour earlier, before a reboot, `pm list packages -d` was empty, so SystemUI is enabled again
  at some point.

So the host key arrives, the prompt has nowhere to open ("not found"), and `adb devices` stays
`unauthorized`. Toggling **ADB access** off and on with the cable in makes USB reconnect, the key is
sent again, and this time `UsbDebuggingActivity` starts. Unit 1 reported the same sequence:
`unauthorized`, then `device` after the toggle.

### The prompt closes itself

The prompt started four times on unit 2, and the computer became `device` each time:

| When | What the owner saw | Prompt on screen (log) |
| --- | --- | --- |
| First connection | No prompt | About 90 ms, then Frameo back in the foreground |
| After an adb server restart | No prompt | About 90 ms, the same |
| After a reboot, toggle | A prompt; tapped accept | Not measured |
| After a reboot, toggle, trying to tick **Always allow** | Could not tick it | About 180 ms |

No touch was logged for the short ones, and nothing in the log shows what answers them. The
computer is allowed **once**: its key was never added to `adb_keys`, and after a reboot it was
`unauthorized` again.

### `adb_keys` and a factory key

`/data/misc/adb/adb_keys` on unit 2 held exactly one key, written before the clock was set (dated
1969). It is not the owner's key: its comment names a different user and host, most likely a
machine at the factory. Whoever holds its private key can use ADB on this unit, and so get root,
without a prompt. Whether other units ship with the same key was not checked.

What fixed ADB for good on unit 2 was appending the computer's public key, as root, the same thing
**Always allow** would do:

```sh
adb shell "su -c 'cat /data/misc/adb/adb_keys > /data/misc/adb/adb_keys.bak'"   # undo: copy it back
adb push ~/.android/adbkey.pub /data/local/tmp/host.pub
adb shell "su -c 'cat /data/local/tmp/host.pub >> /data/misc/adb/adb_keys; rm /data/local/tmp/host.pub'"
```

Check that the existing file ends with a newline first, so the new key starts on its own line.
Appending keeps the file's owner (`system:shell`), mode (`0640`) and SELinux label
(`adb_keys_file`). After `adb reboot` the frame was `device` 12 s after boot, with no prompt and
no toggle, and it still is with Frameo disabled. Do this **before** disabling Frameo: the ADB access
switch goes with it.

### Root

- `adb shell su -c id` and `su 0 id` return `uid=0(root)` immediately, with no prompt. SuperSU's
  `su` and `daemonsu` (`/system/xbin`, 133,472 bytes each) run without a manager app, so **any app
  can get root without asking**.
- `adb root` is not available (`ro.debuggable=0`); use `su`.
- **Frameo uses root.** On unit 2, the Frameo process (uid 10010) had two `su` children and
  `daemonsu:10010` held two root `sh -` shells for it, as on the
  [Skyrhyme 168](skyrhyme-168.md).
- **`daemonsu` restarts every ~5 s.** `init` defines `service daemonsu /system/xbin/daemonsu
  --auto-daemon` without `oneshot`, and `dmesg` shows a new start every 4.6–5.7 s, as on the
  [Uhale `102KZ`](uhale-102kz.md#daemonsu-is-what-remounts-system). Each start remounts `/system`;
  the ext4 mount count went from 2,795 to 2,850 in a few minutes.

### Network

- Unit 2, offline (Wi-Fi on, no network joined): the only listening TCP socket was IPv4
  `0.0.0.0:51161`, owned by Frameo (uid 10010). It would be reachable from the local network once
  Wi-Fi is joined. What it serves was not examined.
- After the setup below, online: no listening sockets at all, and the kiosk was the only app with a
  TCP connection.

### Microphone, camera and USB host (unit 2)

| | Observed |
| --- | --- |
| Microphone | None. `AudioRecord` (16 kHz mono, `MIC` source, run as root through `app_process`) opens, but after a short burst at the start every sample is the constant −1019, also with `tinymix` **Capture MIC Path** set to **Main Mic** while recording. Same result as the [Uhale `102KZ`](uhale-102kz.md) |
| Camera | None. `dumpsys media.camera`: `Number of camera devices: 0`; no `/dev/video0`; no lens on the case |
| USB host | `android.hardware.usb.host` is declared, and `uvcvideo` and `snd-usb-audio` are among the registered USB drivers. The only port is the USB-C port in device mode (`force_usb_mode` 0, automatic). A USB webcam or microphone through an OTG adapter or forced host mode was not tried |

## Partition layout

From `/sys/block/mmcblk0/mmcblk0p*/start` and `size`, in 512-byte sectors. The same on both units,
and identical to the [YIAISIGN `10X1`](yiaisign-10x1.md#partition-layout) and
[Tibuta `TID10`](tibuta-tid10.md#partition-layout):

| Node | Name | Start | Sectors |
| --- | --- | --- | --- |
| `mmcblk0p1` | `uboot` | 16,384 | 8,192 |
| `mmcblk0p2` | `misc` | 24,576 | 8,192 |
| `mmcblk0p3` | `resource` | 32,768 | 32,768 |
| `mmcblk0p4` | `kernel` | 65,536 | 24,576 |
| `mmcblk0p5` | `boot` | 90,112 | 28,672 |
| `mmcblk0p6` | `recovery` | 118,784 | 65,536 |
| `mmcblk0p7` | `backup` | 184,320 | 131,072 |
| `mmcblk0p8` | `cache` | 315,392 | 262,144 |
| `mmcblk0p9` | `metadata` | 577,536 | 32,768 |
| `mmcblk0p10` | `kpanic` | 610,304 | 8,192 |
| `mmcblk0p11` | `system` | 618,496 | 2,097,152 |
| `mmcblk0p12` | `radical_update` | 2,715,648 | 131,072 |
| `mmcblk0p13` | `userdata` | 2,846,720 | 58,224,640 |

## Backup (unit 2, verified)

Everything before `userdata`, read-only, before any change:

```sh
adb exec-out "su -c 'dd if=/dev/block/mmcblk0 bs=1048576 count=1390 2>/dev/null'" \
  | tee >(shasum -a 256 > stream.sha256) | gzip -1 > backups/<frame>/emmc-0-2846720.img.gz
```

`count=1390` MiB is exactly 2,846,720 sectors; check `/sys/block/mmcblk0/mmcblk0p13/start` on your
own unit first.

- 1,457,520,640 bytes, as expected; 451 MB compressed; 4 minutes over USB 2.0.
- The gzip readback SHA-256 matched the stream SHA-256.
- No aligned 4 KiB block consisted entirely of `0xCC`.
- On-device `md5sum` re-reads matched the backup for 12 of 13 regions: the area before `uboot`,
  and `uboot` through `radical_update` except `system`.
- **`system` never re-reads the same while `daemonsu` runs.** A full second read differed in 204 of
  262,144 4 KiB blocks: block 0 (the ext4 superblock: mount count, mount time, kbytes written), 202
  blocks inside the ext4 journal (inode 8, blocks 164,391–167,389), and block 176 in the inode table,
  where only the `ctime` of inodes 2008 and 2010 changed. Those are `/system/xbin/daemonsu` and
  `/system/xbin/su`. No file contents differed. To get matching reads, stop the loop first
  (`su -c 'stop daemonsu'`, as the 102KZ notes do); not tried here.

This is a logical capture of everything before `userdata`, not a `userdata` snapshot. Restoring it
has not been tested.

## A hang, and the way out (unit 2)

An ADB test with a second, newly generated host key never got past `offline`: no
`Received public key` line was logged for it, so no prompt was shown. After a second attempt the
frame stopped answering ADB, then hung completely: the slideshow froze, touch did nothing, the
frame disappeared from USB, and it stayed frozen with the cable unplugged. So the frame kept running
without USB power.

What worked: pressing the **reset pinhole** with the USB cable unplugged brought up **Android
recovery**; **Reboot system now** returned to Frameo. `boot`, `recovery` and `misc` hashed the same
afterwards. Do not choose **Wipe data/factory reset** there unless you mean it.

The backup above was taken before this, and nothing had been written to the frame.

## Unit 2: setup performed

> **Record, not a procedure.** Done by hand on one unit, one step at a time, each approved by the
> owner, after the verified backup. Everything is in `/data`; `/system` is untouched.

| Step | Command | Result | Undo |
| --- | --- | --- | --- |
| Save the computer's ADB key | See [`adb_keys` and a factory key](#adb_keys-and-a-factory-key) | `device` right after boot without a prompt | Copy `adb_keys.bak` back |
| Disable the updater and test app | `su -c 'pm disable com.adups.fota'`, `su -c 'pm hide com.adups.fota'`, `su -c 'pm disable com.DeviceTest'`, one per `adb shell` | `enabled="2"` (Adups also `hidden="true"`) in `package-restrictions.xml` a few seconds later. Both processes kept running until the next reboot. Chaining the three with `;` inside one `su -c` printed nothing and changed nothing | `pm unhide`, `pm enable` |
| Install a fallback launcher | `adb install` Rootless Pixel Launcher 3.9.1, SHA-256 checked against [`scripts/biuframe-setup.sh`](../scripts/biuframe-setup.sh) | Installed | `adb uninstall amirz.rootless.nexuslauncher` |
| Install the kiosk | `dashboard/kiosk/build.sh` on macOS (JDK 17, build-tools 34.0.0, platform 34), `adb install` | Home HQ 1.1; the default demo dashboard rendered in WebView 107 | `adb uninstall com.wesbos.homehq` |
| Navigation buttons | `pm grant com.wesbos.homehq android.permission.WRITE_SECURE_SETTINGS`; `settings put secure enabled_accessibility_services com.wesbos.homehq/com.wesbos.homehq.NavigationService`; `settings put secure accessibility_enabled 1` | Service bound, and still bound after reboots | `pm revoke`; `settings delete` both |
| Kiosk as Home | `am start -n com.wesbos.homehq/.MainActivity --ez home true`, then the Home chooser (`am start -a android.intent.action.MAIN -c android.intent.category.HOME`) → **Home HQ** → **Always** on the panel | `com.wesbos.homehq/.Home` in `preferred-activities` | Pick another Home app; `--ez home false` |
| **Way back, by hand** | Two-finger hold → Android settings → Apps → floating **Dashboard** | Worked, done by the owner on the panel before Frameo was disabled | |
| Disable Frameo | `su -c 'pm disable net.frameo.frame'`, `su -c 'pm hide net.frameo.frame'` | `hidden="true" enabled="2"` saved within 3 s (checked before any reboot); its port 51161 gone | `pm unhide`, `pm enable`, then pick Frameo as Home |
| Wi-Fi | Joined on the panel from the kiosk's **Open Wi-Fi settings** | Dashboard loaded | Forget the network |
| Reboot test | `adb reboot` | ADB `device` after ~22 s with no prompt; Home HQ in front; Wi-Fi rejoined; clock correct from network time; navigation service bound; no Frameo, Adups or DeviceTest process | |

The screen timeout was already "never" (`screen_off_timeout=2147483647`), so nothing was changed for
that. SystemUI stays disabled (see above), so there is no status or navigation bar; the kiosk's
floating buttons cover that.

## Unit 1: setup reported in #161

Not repeated on unit 2. Summarized from
[#161](https://github.com/wesbos/photo-frame-dashboard/pull/161), which has the full commands and
undo steps. Everything was done in `/data`, with `/system` untouched, and without a full eMMC backup:

- `com.adups.fota` and `com.DeviceTest` disabled (`pm disable`, plus `pm hide` for Adups). The
  already-running Adups process had to be killed once; it did not come back.
- Rootless Pixel Launcher 3.9.1 and Firefox 143.0.4 installed, checked against the SHA-256 hashes in
  [`scripts/biuframe-setup.sh`](../scripts/biuframe-setup.sh).
- The Home HQ kiosk built with `dashboard/kiosk/build.sh` and installed, with the floating navigation
  service. The way back to Android settings was checked by hand on the panel before Frameo was
  disabled.
- Home HQ chosen as the default Home app on the screen, then Frameo disabled and hidden.
- **Gotcha:** `pm disable net.frameo.frame` followed by `adb reboot` 2 s later was lost, because
  `/data/system/users/0/package-restrictions.xml` had not been written yet. Check that the file shows
  `hidden="true" enabled="2"` for the package before rebooting. The
  [Runxion notes](runxion-zn-dp1002-rk3126.md#setup-performed) saw the same.

## Guesses, not confirmed

- The prompts that closed by themselves may have been answered by Frameo, which holds root shells
  and owns the ADB access setting, or by something in this build's SystemUI. Nothing in the log
  shows which. Whether any computer, not only one that has been accepted once, gets in that way was
  not established: the second-key test above hung before reaching the prompt.
- Frameo is the likeliest source of the root `pm disable com.android.systemui` at boot, and of
  enabling it again when ADB access is toggled. `com.DeviceTest` is the other candidate. Whether
  SystemUI is still disabled at boot now that both are disabled was not checked: it was already
  saved as disabled.
- The frame keeps running with USB unplugged, which suggests an internal battery. The case was not
  opened.

## Not tested

- Whether the factory key in `adb_keys` can be removed safely, and what then happens. It was left in
  place on unit 2.
- Stopping the `daemonsu` restart loop at boot (a `/system` change on the
  [`102KZ`](uhale-102kz.md#daemonsu-is-what-remounts-system)).
- What Frameo serves on TCP port 51161.
- `qemu.hw.mainkeys=0` for a navigation bar (it worked on the `TID10` and `10X1`, not on the
  `102KZ`).
- Network ADB (`adb tcpip 5555`).
- USB host mode: an OTG adapter, or `force_usb_mode` set to 1 (host), which drops USB ADB until it
  is set back or the frame reboots.
- Rockchip loader mode. On the related `102KZ` it is the reset pinhole held while connecting USB.
- Restoring the backup.

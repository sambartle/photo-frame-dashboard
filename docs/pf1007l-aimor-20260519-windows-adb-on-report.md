# PF1007L / AiMOR `20260519`: root ADB on out of the box, setup from Windows

One AiMOR-branded PF1007L, set up on 2026-10-19 from Windows 11 with Git Bash. It needed no
access route: USB ADB was already on and root, like #148. Everything after that followed the
existing guides. This report records what matched, what differed, and two measurements (mic and
boot fixes).

## Unit

```text
Sold as: AiMOR
Firmware (ro.build.yhk.id): YHK.F-null-A33-1001-D1024-PF1007L-FL-AIMOR-OS.0.20260519
Android model / product / device: AEEZO / astar_m86_8723cs / astar-m86_8723cs
Fingerprint: AEEZO/astar_m86_8723cs/astar-m86_8723cs:6.0.1/MOB30R/20260519:eng/test-keys
Android: 6.0.1, SDK 23, armeabi-v7a, security patch 2016-07-05
Stock WebView: 44.0.2403.119
Wi-Fi: aic8800_fdrv loaded
Host: Windows 11, Git Bash, platform-tools adb
```

## Observed

### ADB

- At first connection, with a USB-A to USB-C data cable, `adb devices -l` listed the frame as
  `device`. Windows showed `1f3a:1002` with two interfaces: mass storage and ADB.
- `adb shell id` returned `uid=0(root)`. `ro.secure=0`, `ro.adb.secure=0`, `ro.debuggable=1`,
  SELinux `Disabled`.
- `/data/property/persist.sys.usb.config` already held `mass_storage,adb`. Its origin is unknown;
  the frame had never been on Wi-Fi in our hands. The same was seen in the
  [January ADB-on report](pf1007l-windows-20260113-adb-on-report.md).
- `/system/xbin/su` is setuid root, but with root ADB it was not needed. This `su` rejects `su -c`
  (`invalid uid/gid '-c'`), so scripts written for the Rockchip frames' `su -c '…'` fail here.
- USB ADB survived several reboots and a power-cycle, including after AiMOR was disabled.

### Layout and backup

- Boot partition at sector 172032. Boot image SHA-256 (31,028 sectors):
  `9a6e2456952f3dc2b99e64ea021321397bdc824364b5c8b42f503f847261630a`, the known `20260519` image.
- `UDISK` (`/data`) is `mmcblk0p1`, starting at sector 4,366,336.
- Android's `/sys/block/mmcblk0/size` reported **30,769,152** sectors, 8,192 (4 MiB) fewer than the
  30,777,344 that Android reported on other larger-eMMC units
  ([January ADB-on report](pf1007l-windows-20260113-adb-on-report.md#full-emmc-backup-over-adb)).
  Whether this is a different eMMC is not known.
- Backup over root ADB: everything before `UDISK` (2,235,564,032 bytes) with `/sbin/busybox dd`,
  stream SHA-256 compared with the gzip readback, then env, boot, system and recovery re-read and
  compared. Also `mmcblk0boot0`, `mmcblk0boot1`, `mmcblk0gp0`, each read twice, and a tar of `/data`.
  About 8 minutes over USB 2. This is not a full raw eMMC image (`UDISK` was saved as a file tar),
  so it does not meet the repository's backup rule.

### Before going online

- A factory Wi-Fi network (SSID and PSK) was saved in `/data/misc/wifi/wpa_supplicant.conf`, as on
  #172. We removed the `network={}` block with Wi-Fi off. The frame had not joined it.
- `kill_background_services=1`, `kill_background_services_list` unset.

### Setup that worked

All over USB, in this order, with AiMOR never online:

1. Disabled `com.yhk.qeota`, `com.DeviceTest` and `com.android.gl2jni` (`/system/priv-app/tomas`,
   a GL test app with two launcher activities and no services). All showed `enabled="2"` in
   `package-restrictions.xml` before any reboot.
2. WebView 106.0.5249.126 swap as in
   [section 6 of the PF1007L guide](allwinner-a33-pf1007l.md#6-upgrade-webview-before-using-the-kiosk),
   whole stock tree moved aside. After a reboot `dumpsys package` showed 106 and a page rendered.
3. ISRG Root X1, GTS Root R1 and GTS Root R4 were all **absent**. Added as `6187b673.0`,
   `f013ecaf.0` and `5acf816d.0`, checked against the SHA-256 values in the
   [Uhale guide](si006-uhale.md). An HTTPS dashboard then loaded.
4. A custom WebView kiosk was installed and shown on screen, then AiMOR disabled. The kiosk became
   the only Home app; no chooser appeared at the next boot.
5. [Boot fixes](pf1007l-boot-fixes.md): `install.sh check` and `apply` passed with `WIFI_DEFER=1`,
   `POWER_FIX=0`, `NTP_SERVER=time.google.com`. `check` noted no AXP22x control file. After a
   power-cycle the log showed `Wi-Fi started at uptime 43.06s` and the MAC changed from the
   driver's random `88:00:33:77:…` to the configured one. On the home network the frame got an
   address, NTP answered and `/data/local/frame-lasttime` was written.

After joining Wi-Fi: no `:7806` connection, no AiMOR or updater process, nothing listening on 5555.

### `adb reboot`

The first `adb reboot` (after the WebView swap) came back normally. The second, right after
`install.sh apply`, did not: Windows kept the composite USB device but neither interface, and
`adb devices` stayed empty, including after `adb kill-server`. A power-cycle booted the frame into
the kiosk with the fixes active. Unplugging and replugging the USB cable at the PC brought ADB back.
This matches the "`adb reboot` hangs" note in [start here](pf1007l-start-here.md#then-set-it-up).

### Microphone

`getUserMedia` worked in WebView 106 (Android grants the input), but no mic signal was found:

- Default capture path: noise around −72 to −75 dBFS after removing the DC offset. The raw RMS
  read about 0.011 (about −39 dBFS), which was all DC offset.
- Loopback test: 1.5 s of quiet, then 1.5 s of a 1 kHz WebAudio tone at media volume 8/8 through
  the speaker. The owner heard the tone in the room. The mic level rose by 0 to 3 dB at most, the
  same as with no mic.
- The same test with codec controls set by hand (a minimal static ALSA control tool, because the
  firmware has no `tinymix`): `Audio analog main mic` on, `Analog cap test disable mic1` off,
  `Audio analog headsetmic` on, `Audio linein record` on, and `Audio speaker out` on with
  `speaker volume control` at 63. No combination raised the level when the tone played. With the
  MIC2 and line-in paths the floor dropped to about −94 dBFS.
- During capture the HAL left `Audio analog main mic` at 0.

The small hole on the frame's edge is the ambient light sensor: covering it changes the
auto-brightness. Guess: no microphone is fitted, consistent with #156.

## Not tested

- U-Boot, FEL or any boot write (not needed).
- Repeated power-cut boots with the boot fixes, beyond the one power-cycle above.

# MONOCUS WF105T (10.1" Frameo, BMY-106, RK3126, Android 6.0.1)

Record of one unit, bought from [Amazon US, B0HBQ5N8NL](https://www.amazon.com/dp/B0HBQ5N8NL?tag=webo080-20)
and configured on 2026-10-17 using macOS (Apple silicon). **Frameo settings shows model `WF105T`**;
Android's model is `Frame` and product/device is `BMY-106`. Match the fingerprint below, not just
the retail name. Unique identifiers, dashboard URLs and app data stay in private, ignored records.

**Result:** working USB ADB, shipped root, a verified original main-eMMC backup, WebView 44 replaced
with 106, Rootless Launcher as fallback, and Home HQ as Home. The owner confirmed SharpTools
sign-in, physical Settings/Apps access and floating Dashboard return. Sign-in survived reboot.
Persistent Wi-Fi ADB was then verified across another reboot with USB physically unplugged.
No boot patch, Loader access or Frameo firmware update was needed during this conversion.

## Identity

| | Observed |
| --- | --- |
| Sold as / Frameo settings model | MONOCUS 10.1" Frameo touchscreen, 16 GB / `WF105T` |
| Android model / brand / manufacturer | `Frame` / `Share-Your-Moments` / `BaiMeiYou` |
| Product / device | `BMY-106` / `BMY-106` |
| Firmware | `BMY_F606-RK915A_Frameo_V1.0.1202402191139.release-keys` |
| Fingerprint | `rockchip/rk312x/rk312x:6.0.1/MXC89K/user.liubc.20240219.113841:user/release-keys` |
| SoC | Rockchip RK3126, four ARMv7 cores; identified through kernel/sysfs, physical marking not inspected |
| Platform / hardware | `rk312x` / `rk30board`, 32-bit `armeabi-v7a` |
| Android | 6.0.1, API 23, security patch 2016-07-05, `user` build |
| Security properties | `ro.secure=1`, `ro.debuggable=0`, `ro.adb.secure=1`; SELinux permissive |
| RAM / main eMMC | `MemTotal: 1023552 kB`; 30,777,344 sectors of 512 bytes (15,758,000,128 bytes) |
| Display | Android landscape 1280x800, density 160, no overrides |
| Stock WebView | `com.android.webview` 44.0.2403.119, `/system/app/webview/webview.apk` |
| Stock Home | `net.frameo.frame/.ui.activities.AWaitForDeferredInitCompleted`, Frameo v1.20.12 (37660) |
| SystemUI / fallback | `com.android.systemui` disabled (`enabled=2`); no alternate Home installed |

Read-only Wi-Fi ADB checks on 2026-10-19 identify RK3126 more specifically than the generic
`rk312x` Android property: `/proc/cpuinfo` reports `Hardware: Rockchip RK3126`,
`/sys/devices/system/cpu/soc` returns `rk3126`, and `/proc/device-tree/compatible` contains
`rockchip,rk3126`. The boot log agrees. The exact silicon suffix is not established.

## USB ADB and root

In Frameo settings, enable **Beta program**, then ensure **ADB access** is enabled. The owner
recalls ADB already being on after enabling Beta; whether that is the default is unverified.
The working cable combination was not recorded. The owner saw no USB authorization prompt;
rejection of an unfamiliar host key was not established.

```sh
adb devices -l                         # select this unit explicitly if several are connected
adb -s <serial> shell getprop ro.build.fingerprint
adb -s <serial> shell su -c id          # uid=0(root)
```

Ordinary `adb shell` is UID 2000; shipped `/system/xbin/su` provides root without a prompt through
a SuperSU-style daemon. No root exploit or recovery entry was needed. USB ADB returned automatically
after the setup reboots. Stock `persist.sys.usb.config=adb`; initially neither TCP-port property
was set and no ADB listener on 5555 was found.

## Partition layout and backup

512-byte eMMC sectors, as exposed under `/sys/block/mmcblk0/`:

| Partition | Name | Start sector | Size (sectors) |
| --- | --- | --- | --- |
| p1 | uboot | 16,384 | 8,192 |
| p2 | misc | 24,576 | 8,192 |
| p3 | resource | 32,768 | 32,768 |
| p4 | kernel | 65,536 | 24,576 |
| p5 | boot | 90,112 | 24,576 |
| p6 | recovery | 114,688 | 65,536 |
| p7 | backup | 180,224 | 131,072 |
| p8 | cache | 311,296 | 262,144 |
| p9 | metadata | 573,440 | 32,768 |
| p10 | kpanic | 606,208 | 8,192 |
| p11 | system | 614,400 | 2,097,152 |
| p12 | radical_update | 2,711,552 | 131,072 |
| p13 | userdata | 2,842,624 | 27,934,720 |

The firmware-prefix layout matches the [Rollei Smart Frame 107](rollei-smartframe-107.md#partition-table-emmc-mmcblk0-512-byte-sectors),
but this unit has a smaller disk and userdata partition. It differs from both the BIUFRAME and
[YIAISIGN](yiaisign-10x1.md#partition-layout). `userdata` starts at sector **2,842,624**, so the
prefix before it is **1,455,423,488 bytes**. Do not reuse another unit's fixed backup length or
partition offsets. `biuframe-setup.sh` has no MONOCUS profile: the WebView and launcher methods
were adapted to this identity, rather than running another device's `apply`. Its default swap, CA
and system-navigation changes were not part of this setup.

Before app or system-file changes, the full main eMMC and a separate prefix before userdata were
captured over root ADB. Verification passed: exact raw byte counts, SHA-256/gzip readback, no full
`0xCC` filler blocks, and independent rereads of ten static partitions matching the capture.
`cache`, `metadata` and `userdata` were live and not independently compared; this is not an atomic
filesystem snapshot. Hardware boot0/1 regions were not exposed; RPMB was not captured.

Separate archives preserved Frameo data/media/APK, the original WebView directory including `oat/`,
and signed-in Home HQ data. App-data archives matched independent file reads while the respective
processes were paused and then resumed. Dumps, app data and whole-disk hashes stay private.

## Setup and verification

### WebView 44 to 106

Used the ARMv7 replacement method in the [BIUFRAME guide](biuframe-setup-guide.md), after backing
up the original WebView directory and APK. The replacement has a different signer, so a normal
signed app update is not suitable. The change replaced `/system/app/webview/webview.apk`, removed
old `oat/`, and extracted the replacement APK's three ARM libraries into `lib/arm/`, with root
ownership, directories 0755 and files 0644. This records the completed change, not a supported
MONOCUS installer.

Pinned downloads used:

| Asset | Source | SHA-256 |
| --- | --- | --- |
| WebView 106.0.5249.126, ARMv7 | [LineageOS, commit `4b0ae494a7dd`](https://raw.githubusercontent.com/LineageOS/android_external_chromium-webview_prebuilt_arm/4b0ae494a7dd/webview.apk) | `e2edc1f89ec1608b169da9e7ffc037190b70c7825f0be29694f4cae719980580` |
| Rootless Pixel Launcher 3.9.1 | [F-Droid](https://f-droid.org/repo/amirz.rootless.nexuslauncher_30911.apk) | `7fa44d560dc4577374d45176220de2c0b00a71e09d6d148cdea4e0a52d38404a` |

Each replacement file matched device readback; `/system` was returned read-only. Reboot activated
106.0.5249.126 and SharpTools email/phone sign-in worked. Original `.apk.bak`, directory archive and
checksum-guarded rollback commands were retained privately. Android, kernel, boot/recovery and CA
certificates were unchanged; no zram tuning or `build.prop` navigation patch was applied.

### Kiosk, fallback and navigation

Installed Rootless Pixel Launcher 3.9.1 as fallback and a local Home HQ 1.1.1 build with a configured
start URL and return-to-start-page actions. This records that build, not a retest of later upstream
kiosk changes.

Used the existing [Home HQ navigation service](../dashboard/kiosk/README.md#frames-without-home-or-back-buttons)
with `WRITE_SECURE_SETTINGS`. Stock SystemUI was left disabled. Before disabling Frameo, the owner
physically tested: hold two fingers for the menu → Android Settings → Apps → floating Dashboard
button. Rootless Launcher was also explicitly launched, with an Android Home intent returning to
the kiosk. The navigation service was verified bound after reboot.

### Vendor packages and final Home choice

These packages were **disabled-user**, retaining their APKs and data:

| Package | Stock version | State after reboot |
| --- | --- | --- |
| `net.frameo.frame` | v1.20.12 (37660) | `enabled=3`, no process |
| `com.adups.fota` | 5.24 | `enabled=3`, no process |
| `com.adups.fota.sysoper` | 5.3.7 | `enabled=3`, no process |
| `android.rockchip.update.service` | 1.8.1 | `enabled=3`, no process |

The operation was `pm disable-user --user 0 <package>` through shipped root; functional undo is
`pm enable <package>` through root. This restores enabled behavior, not the original default flag
(`enabled=0`). No vendor APK or data was deleted; native vendor daemons were not audited.

Android 6 lacks `cmd package set-home-activity`; enable the kiosk's Home alias and use the native
chooser, as in the [kiosk guide](../dashboard/kiosk/README.md#start-at-boot).
**Disabling Frameo changed the Home candidates and invalidated the earlier Always selection.**
Selecting Home HQ → Always again with the final two candidates (Home HQ and Rootless) fixed it.
A Home intent then opened Home HQ directly, and reboot preserved the choice and signed-in dashboard.

`dumpsys package preferred-xml` omits the `always` attribute on this build. The on-disk
`/data/system/users/0/package-restrictions.xml` can contain both `always=false` and `always=true`
entries for the same component; check the actual `always=true` entry and allow time for the delayed
write before rebooting. The chooser may show an app list or **Use Home HQ as Home** with **Always**.

To return to Frameo without deleting kiosk data: re-enable Frameo, turn off Home HQ's Home alias
(`--ez home false`), open the Home chooser and choose Frameo → Always. Updaters can be re-enabled
individually. To remove automatic navigation repair, revoke `WRITE_SECURE_SETTINGS` before disabling
the accessibility service, preserving any other services. These rollback steps were recorded but
not exercised; a factory reset was not tested as an undo.

## Optional persistent Wi-Fi ADB (tested)

Stock TCP ADB was off. After the owner approved network access, these operations enabled it:

```sh
adb -s <serial> shell "su -c 'setprop persist.adb.tcp.port 5555'"
adb -s <serial> tcpip 5555
adb connect <frame-ip>:5555
adb -s <frame-ip>:5555 shell getprop ro.build.fingerprint
```

The owner then physically unplugged USB, leaving wall power connected. A reboot issued over TCP
returned to working TCP ADB with a new boot ID, Home HQ foreground, navigation bound and vendor
packages still disabled. After boot, `persist.adb.tcp.port` was `5555` while
`service.adb.tcp.port` was empty: the persistent value alone sufficed. No boot hook, boot-image or
`/system` edit was needed. USB configuration remained `adb`; disabling USB ADB was not required.
A DHCP reservation helps keep the endpoint predictable; verify identity before writes, not just IP.

Post-reboot checks included:

```sh
adb -s <frame-ip>:5555 shell getprop sys.boot_completed       # 1
adb -s <frame-ip>:5555 shell getprop persist.adb.tcp.port      # 5555
```

Host-key enforcement remains unverified: the Mac connected, but a separate no-key handshake probe
was inconclusive. No authentication settings or keys were changed. With shipped root, restrict
network access to trusted management hosts on an isolated network; `ro.adb.secure=1` is not proof
that unfamiliar hosts are rejected.

Functional undo (recorded, not exercised):

```sh
adb -s <frame-ip>:5555 shell "su -c 'setprop persist.adb.tcp.port -1; setprop service.adb.tcp.port -1'"
adb -s <frame-ip>:5555 usb
# Wi-Fi ADB disconnects. Reconnect USB and verify 5555 is no longer listening, including after reboot.
```

The original port properties were unset; `-1` disables TCP functionally rather than restoring
exactly absent properties.

## Diagnostic lessons and limits

- Bundled toybox `pidof` returned all PIDs even for a nonexistent process name; cause not diagnosed.
  Use actual names in `ps` or `busybox1.11 pidof`, which distinguished the missing and running names.
- Force-stop of Frameo while it was Home immediately restarted it. A brief SIGSTOP/SIGCONT pause
  kept it quiescent for its archive; resume even if capture fails. Built-in `busybox1.11 tar` handled
  long paths rejected by stock tar; old gzip required `gzip -d` with stdin rather than combined `-dc`.
- Boot started with the clock in 2021; stock network synchronization corrected it with Frameo and
  the updaters disabled. Offline cold-start clock behavior was not tested.

Not tested: physical Loader entry, firmware restoration, app-data restore, WebView rollback,
functional undo, suspend behavior or long-duration unattended stability. Android 6 with a 2016
patch and permissive SELinux remains an old platform; replacing WebView does not update the OS.

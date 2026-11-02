# QCREA YYD-1156 / YYD-1006Y (Frameo, RK3326-S, Android 8.1)

Report from one owner-operated unit, tested on 2026-10-19 with an Apple silicon Mac
running macOS. Bought from [Amazon Germany, B0F3X9QMPD](https://www.amazon.de/dp/B0F3X9QMPD).
Match the board and firmware below: a listing or the Android model alone is not enough.

**Verified result:** a dashboard starts automatically after reboot and complete power removal.
Authenticated WLAN ADB works after both. The route was UART → stock U-Boot USB mass storage
(UMS) → verified eMMC backup → offline addition of the owner's public ADB key. Android,
U-Boot and the kernel were retained. Custom early artwork and an Android boot animation work.
A local kiosk adaptation turns the backlight off and wakes on a physical screen tap.

This is a record, not a universal flash recipe. The offline userdata writer and artwork
installer were generated against this unit's private backups and are not included.
The [FRAME157 report](pastigio-frame157.md) describes a related RK3326 ADB-key route, but its
loader entry, storage layout and firmware are different.

## Identity

| Item | Observed value |
| --- | --- |
| Frameo About: hardware brand and model | `QCREA YYD-1156` |
| Frameo application | `v1.32.16 (80320)`; Beta Program and ADB Access enabled |
| Android model / firmware | `DP105F` / `YYD.DP105L.v2023101717` |
| Board silkscreen | `YYD-1006Y V1.0`, `szyyd.com` |
| Board sticker | `DP105L 1+16 2.4GWIFI` |
| SoC marking | Rockchip `RK3326-S`, physically inspected |
| Android / ABI | 8.1.0, API 27 / `armeabi-v7a` (32-bit userspace) |
| Kernel | Linux 4.4.138, October 17, 2023 build |
| U-Boot | 2017.09, October 17, 2023 build |
| RAM | 1 GB DDR3; boot log reports 333 MHz |
| eMMC user area | 30,777,344 × 512-byte sectors = 15,758,000,128 bytes |
| Display | 1920×1200, 240 dpi, landscape 16:10; LT9211 bridge in boot log |
| Stock WebView | `com.android.webview` 61.0.3163.98 |
| USB in Android | `2207:0006`, product `DP105F` |
| Root / SELinux | Shipped `/system/xbin/su`, `su -c id` returns uid 0 / permissive |
| ADB properties | `ro.secure=1`, `ro.adb.secure=1`, `ro.debuggable=0` |

A network controller guessed “Samsung Galaxy A5”. That was not the hardware identity.
The reported Android density is a UI scaling setting, not a measurement of panel PPI.
At normal zoom with `width=device-width, initial-scale=1`, expect a 1280×800 CSS viewport
and device pixel ratio 1.5. Android reported a full 1920×1200 application window; the CSS
viewport size is derived from density, not a recorded JavaScript measurement.

## Attempts before opening the frame

- Enabling Frameo's ADB Access left USB ADB `unauthorized`. No approval dialog appeared.
  Replugging, rebooting, toggling ADB and restarting the host server did not resolve it.
- Three keyboard attempts initially appeared unsuccessful. Typing eventually worked with
  the Mac USB connection disconnected. Android keyboard/language settings were reachable,
  but the attempted shortcuts did not provide a usable route to Android Settings or ADB approval.
- Holding the power button while connecting power/USB did not establish a usable hardware
  Loader-entry route on this unit. The owner saw the normal Frameo boot sequence.
- The cause of the missing authorization UI was not proven. Do not assume SystemUI is
  disabled merely because another Frameo model behaves that way.
- Several connector/cable arrangements were tried. A working USB data connection was eventually
  established, but the record does not support a general USB-C-to-C or USB-A-to-C compatibility
  claim. USB host and device operation appeared to interfere during the keyboard attempts.

## UART and stock U-Boot

The enclosure was opened to reach the board. Three small pads marked **G, RX, TX** were
identified below the Wi-Fi area, near the flash. Use the printed labels, not an assumed
left-to-right ordering. Device TX measured **3.285 V relative to G** at idle.

A DSD TECH SH-U09B3 adapter (CP2102N, USB-C) worked at **1,500,000 baud, 8N1**, without
hardware flow control. Use 3.3 V UART logic, not an RS-232 interface. Connections:

| Frame pad | Adapter |
| --- | --- |
| G | GND |
| TX | RX |
| RX | TX |

Leave the adapter's VCC pin disconnected; power the frame from its normal supply.
Disconnect power and USB before soldering or removing the wires.

DDR, U-Boot and early kernel output were readable. **Ctrl+C** interrupted the autoboot
sequence and produced the stock U-Boot prompt, even though its countdown was `0`.
`help` and `printenv` worked. Do not save environment changes to achieve this.

At the U-Boot prompt, the tested command was:

```text
ums 0 mmc 0
```

This exposed the eMMC user area as a USB mass-storage disk to macOS. Stock U-Boot's `ums` is
**writable**: the computer can write to the frame's eMMC on its own. Don't open Disk Utility or any
partition tool while it is attached, and leave UMS with Ctrl+C as soon as the read finishes. macOS offered to
initialize an unreadable disk: choose **Ignore**, not Initialize. Identify the new disk
by its exact byte size and partition table; never reuse someone else's `/dev/diskN`.
Ctrl+C left UMS, and `boot` continued the normal Android startup. No replacement U-Boot
or kernel was needed.

### Why serial output did not become an Android shell

The captured DTB has both `fiq-debugger` and `serial@ff160000` set to `status = "disabled"`.
Although the kernel command line names `ttyFIQ0`, no usable Android console responded at
1,500,000 or 115,200 baud. The disabled nodes explain the observation; early boot output
alone does not prove an Android root shell is available. The DTB was not changed.

## Backup and offline ADB authorization

The stock Rockchip USB read path returned plausible low-address data but `0xCC` filler in
higher probes, including sectors 65,536 and 139,264. It was rejected as a backup source.
UMS reads through stock U-Boot provided the usable capture instead.

Before writing anything, the complete **15,758,000,128-byte eMMC user area** was captured:

- Primary and secondary GPT checksums were checked.
- The capture was checked for filler and independently compared with **48 device rereads**.
- A compressed durable copy was decompressed and checked against the original byte count and
  SHA-256. Whole-disk hashes and dumps remain private.
- Android was not running during the UMS capture. This covers the eMMC **user area**;
  separate eMMC boot hardware areas and RPMB were not captured by this procedure.

On macOS, raw-disk access also encountered privacy restrictions: an elevated helper alone
could not read the disk. The owner ran the reviewed helper from a Terminal with the required
access. Do not interpret a host permission error as evidence that the frame needs formatting.

### Recorded GPT layout

Android exposed the eMMC as `mmcblk2`; the following values are 512-byte sectors
in the user area, read from this unit’s GPT. Rediscover the device and parse its GPT
before using any offset. U-Boot’s `mmc 0` numbering is not Android’s block numbering.

| Partition | Name | Start sector | Sector count |
| --- | --- | --- | --- |
| p1 | `uboot` | 16384 | 8192 |
| p2 | `trust` | 24576 | 8192 |
| p3 | `misc` | 32768 | 8192 |
| p4 | `resource` | 40960 | 32768 |
| p5 | `kernel` | 73728 | 65536 |
| p6 | `boot` | 139264 | 65536 |
| p7 | `recovery` | 204800 | 131072 |
| p8 | `backup` | 335872 | 229376 |
| p9 | `security` | 565248 | 8192 |
| p10 | `cache` | 573440 | 786432 |
| p11 | `system` | 1359872 | 3145728 |
| p12 | `metadata` | 4505600 | 32768 |
| p13 | `vendor` | 4538368 | 786432 |
| p14 | `oem` | 5324800 | 262144 |
| p15 | `frp` | 5586944 | 1024 |
| p16 | `userdata` | 5587968 | 25189312 |

### What changed in userdata

The private, guarded procedure was:

1. Extract userdata using **this capture's GPT**, retaining an untouched original.
2. Replay the ext4 journal on a working copy before editing it.
3. Preserve existing lines and add only the owner's **public** ADB key to
   `/misc/adb/adb_keys` inside the userdata filesystem. Android mounts that as
   `/data/misc/adb/adb_keys`. Never copy the private `adbkey` to the frame.
4. Preserve the expected file metadata: uid **1000**, gid **2000**, mode **0640**, and
   `security.selinux = u:object_r:adb_keys_file:s0`. The parent directory was mode `02750`.
5. Check the resulting filesystem and read the key file back. Include journal and accounting
   changes when deriving the block diff; writing only the file's data blocks is insufficient.
6. Check the target size and the current bytes of **every** changed range, then write and
   reread those ranges while Android is still stopped in UMS.

The final change was **15 ranges totaling 69,632 bytes**, including filesystem metadata.
Those are observations, not values to reuse on another frame. No `boot`, `system`, U-Boot,
DTB or adbd authentication setting was patched to obtain ADB. A complete firmware restore
has not been tested; verified backups and verified targeted writes are not the same test.

After returning to Android, the new host key authenticated and `su -c id` returned root.
The root service is shipped in the firmware (`/vendor/bin/rootservice` is started after
`sys.boot_completed=1`). The local kiosk later also invoked `su` without an on-screen prompt.
ADB authorization therefore does not make arbitrary installed apps trustworthy.

### ADB host key selection on macOS

An isolated ADB server was useful when checking keys. With platform-tools 37.0.1,
`ANDROID_USER_HOME` did not select the intended ADB key; **`ADB_VENDOR_KEYS` did** when set
on the process starting the server. For example, use the public/private key pair you
actually authorized, protect the private key, and select a separate server port:

```sh
ADB_VENDOR_KEYS=/absolute/path/to/adbkey adb -P 5038 start-server
adb -P 5038 devices -l
```

An already-running server retains its key configuration. Starting another client with a
different environment does not change that server's keys.

## Persistent, authenticated WLAN ADB

The stock `/init.rk30board.rc` already handles `persist.internet.adb.enable`:
`1` sets `service.adb.tcp.port` to `5555` and restarts adbd; `0` sets it to `0` and restarts
adbd. Once authorized USB ADB and shipped `su` are available, the tested enable command is:

```sh
adb shell "su -c 'setprop persist.internet.adb.enable 1'"
adb connect FRAME_IP:5555
adb -s FRAME_IP:5555 shell id
```

Replace `FRAME_IP` with the frame's address; use `-P 5038` too if using the isolated host
server above. Always use `-s` when USB and WLAN transports coexist.

The setting survived reboot and complete power removal. `ro.adb.secure` remained `1`.
A raw unauthenticated ADB connection received an **AUTH token**, not an authorized shell.
Keep this service on a trusted LAN; do not expose it through router port forwarding.
Undo while you still have a working connection:

```sh
adb -s FRAME_IP:5555 shell "su -c 'setprop persist.internet.adb.enable 0'"
```

The TCP connection will drop when adbd restarts. USB needed a physical data-cable replug
following some reboots, even though Android had finished booting. WLAN avoided that issue;
it could briefly report `offline` while Wi-Fi and authentication were returning.

## Kiosk, TLS and WebView

The repository's WebView kiosk was adapted locally, installed and selected as the default
HOME using the [kiosk guide](../dashboard/kiosk/README.md#start-at-boot). The saved page loaded
automatically after an ADB reboot and after disconnecting both USB and mains power, waiting
10 seconds, then reconnecting **only mains power**. The owner also confirmed normal boot
after removing the UART wires. Stock Android was retained; a Linux replacement was not tested.

- The driver advertises multitouch slots, but the two-finger menu gesture was unreliable
  in physical use. A **72×48 dp Menu button**, 12 dp from the bottom-left edges, reliably opened
  the existing controls. The companion kiosk change makes this button opt-in with
  `--ez menu_button true`; it does not add device-specific power commands to the shared kiosk.
- A locally trusted dashboard certificate chain needed its own CA in the kiosk's Android
  network-security configuration. The CA was scoped to the dashboard domain, and the
  chain/hostname were verified. TLS error handling continued to cancel invalid connections.
  No private hostname or CA is included here.
- Android initially had an old clock. Setting the correct time resolved the date problem;
  automatic time was already enabled. Reliable clock retention over long power removal
  has not been established.
- **Stock WebView 61 remained installed.** The owner confirmed dashboard rendering, but a
  JavaScript syntax error in a CSRF-related script remained. Dashboard write actions were
  not verified. A newer WebView was staged but not activated: do not read this as a
  successful WebView upgrade or proof that every modern website works.
- Replacing the APK can disturb the preferred HOME selection. Reassert the Home alias and
  preferred activity, allow Android to save them, and verify startup again.

## Screen off with touch wake, rather than suspend

A real Android sleep test with `input keyevent 223` produced `mWakefulness=Asleep` and
`Display Power: state=OFF`. Remote `input keyevent 224` woke it, but the owner could **not**
wake it by briefly pressing the rear Power button. The local menu therefore no longer uses
real suspend. This is a result on this unit, not a claim about every RK3326 frame.

The tested alternative is the backlight's `bl_power` attribute:

```sh
# On this board only; keep the restore command and a working ADB connection ready.
adb shell "su -c 'echo 4 > /sys/class/backlight/backlight/bl_power'"
# Undo / wake:
adb shell "su -c 'echo 0 > /sys/class/backlight/backlight/bl_power'"
```

The local kiosk keeps `FLAG_KEEP_SCREEN_ON`, covers the page with a full-screen black,
clickable native view and writes `4` from a background worker. A tap restores `0` and removes
the cover. The wake tap is consumed rather than activating a dashboard button underneath.
Off/on writes are serialized to prevent a rapid tap racing the off command. The adaptation
also requests restoration on Activity resume, pause and destruction; resume handles a
subsequent launch after process death. These lifecycle paths are implementation details,
not separately completed crash-recovery tests.

Readback showed `bl_power=4` then `0`, with Android **Awake** throughout. The owner physically
confirmed that tapping the dark screen restores the dashboard, and WLAN ADB remained usable
during the test. This turns off the **backlight**, not the CPU or whole device; power savings
and overnight connectivity were not measured.

A separate local shutdown option runs `reboot -p` only after confirmation. The confirmation
and cancel path were tested; **actual full shutdown through that option was not tested**.
A mains power cycle is the verified cold-start path. Hardware-specific root controls are
reported here, not added unconditionally to every supported kiosk.
Related work: [PR #198](https://github.com/wesbos/photo-frame-dashboard/pull/198) implements a
separate, opt-in Browser Mod screen-control integration; it was not installed on this frame.

## Replacing both startup visuals

Two distinct assets were changed, with originals backed up before either write:

| Stage | Location / format on this firmware |
| --- | --- |
| Early static artwork | `logo.bmp` entry in the 16 MiB Rockchip `resource` partition |
| Android animation | `/system/media/bootanimation.zip` |

The original `resource` image has an `RSCE` header and entries for `rk-kernel.dtb`, `logo.bmp`
and `logo_pcba.bmp`. The original main BMP is **1920×1200, 24-bit**, 6,912,054 bytes. Its pixels
were stored upside down relative to the intended display, so the replacement was rotated
180° before packaging. This is separate from the upright Android PNG frames.

For identification, the original resource partition SHA-256 was
`113be5ef5fec884faa0b4241b851b5eb2bdc7e6076ad333ab461b5b147ca9694`.
The original boot-animation ZIP SHA-256 was
`55482521df7588a5755fecfc7c8034ae826c57f3fdd675ecb709484ba6770742`.
These are firmware-asset hashes, not a whole-disk hash.

The recorded main-logo allocation started at **sector 202 within resource**, with
**13,501 sectors** including padding. A private installer checked the original full-resource
hash, entry geometry, staged payload hashes and block-device target before writing only that
allocation. It preserved the RSCE header, entry table, DTB, factory logo and every byte outside
the main-logo allocation. Full-resource readback matched the expected patched image.
Do not apply those offsets to a different image without parsing and validating its entries.

For the Android animation, the tested final ZIP uses **stored/uncompressed entries**, 81 PNG
frames at **960×600**, and this description:

```text
1920 1200 15
p 0 0 loop
```

`loop/00000.png` through `loop/00080.png` form a 5.4-second repeating animation. Android scales
the textures to the full 1920×1200 display. Smaller textures reduce decoded-frame memory
compared with 81 full-resolution frames. The owner confirmed the static and moving phases,
including the corrected neutral background and outward-moving colour wave.

The ZIP was staged on `/system` under a temporary name, assigned root ownership and mode
`0644`, checked, then renamed into place. `restorecon` restored its context; `/system` was
remounted read-only after verification. Originals and the preceding custom version remain
available for rollback. The rollback design restores the saved logo allocation and original
ZIP with the same geometry/hash guards, ownership and context; a full firmware restore was
not performed. No bootloader code, kernel or DTB was replaced for this visual change.

Two tool differences mattered when preparing the private installer:

- Android's shell rejected a helper function named `hash`; renaming it `file_sha256` worked.
- This firmware's `dd` rejected `conv=notrunc`. The installer verified a **block-device** target
  and used its supported `bs`, `seek` and `count` arguments instead, followed by full readback.
  Do not copy that substitution to a regular-file output.

No vendor assets, proprietary artwork, APKs, keys, raw logs or firmware dumps accompany this
report. Firmware restoration, another OS, other firmware variants, long-term suspend/wake
behaviour and long-term unattended operation remain unverified.

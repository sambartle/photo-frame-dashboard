# PF1007L 20260410: temporary root ADB through AiMOR

Tested on one **PF1007L / AiMOR 6.0.78 / April 20260410** frame on 2026-10-11,
using an Apple silicon Mac. This route starts the existing ADB daemon through
AiMOR's vendor command connection. It does not flash a boot image or enable
permanent ADB. The temporary connection ended at the next frame reboot.

Try stock USB ADB and stock network ADB first, as described in
[pf1007l-start-here.md](pf1007l-start-here.md). This is an additional option for
the exact firmware below when those tests fail.

> **This is a bootstrap, not the route to keep.** It gives one temporary root
> session that ends at the next reboot, needs a DNS redirect of the vendor host,
> and leaves you leaning on an unencrypted vendor command channel. Once you have
> any root session (this route, Route U or Route S), the stronger maintenance
> setup is **persistent, key-authenticated Wi-Fi ADB**: patch the boot ramdisk to
> add your host's `adb_keys`, keep `ro.adb.secure=1`, and start `adbd` on
> `service.adb.tcp.port=5555`. Then maintenance is just `adb connect <frame-ip>:5555`
> from one authorised machine, with no DNS changes and no vendor channel, surviving
> reboots. Route S's ramdisk patch does exactly this; for this firmware it needs the April builder
> ([unit G](allwinner-a33-sdcard-adb-wifi.md#14-april-20260410-firmware)), and
> [#64](https://github.com/wesbos/photo-frame-dashboard/pull/64) (not merged) shows the same on another
> Allwinner A33 Android 6 unit. Reserve the frame's
> (preferably pinned) Wi-Fi MAC in DHCP so the address is stable. Confirm an
> unknown host is actually refused before trusting the key check. Read
[aimor-remote-root-shell.md](aimor-remote-root-shell.md) and the repository's
[backup, approval and privacy rules](../README.md#rules-we-learned-the-hard-way).
The tested session already had a verified private backup. Once you have access,
back up your own unit before installing packages or changing system files.

## 1. Tested unit

| Item | Observed value |
| --- | --- |
| About model | PF1007L |
| Android model / hardware | `AEEZO` / `sun8i` (Allwinner A33 family) |
| Firmware | `YHK.F-null-A33-1001-D1024-PF1007L-321-OS-AIMOR.0.20260410` |
| AiMOR | `com.efercro.os.aimor`, 6.0.78 (code 78) |
| Launcher APK SHA-256 | `abc4e274940e21729de7b9dbaf1f7969efdf427955d0c4881a319611942fb65d` (matches PR #3's January APK) |
| Android / display | 6.0.1, API 23 / 1280 × 800, density 160 |
| Stock WebView | 44.0.2403.119 |
| Ports | USB-C only, TF slot, button |
| eMMC | 30,777,344 sectors (15,758,000,128 bytes), from private backup |
| Boot partition | p6, start sector 172032, 65,536-sector partition, from private backup |
| Boot image | 15,886,336 bytes; hash below is the 31,028-sector image, not the whole partition |
| Boot image SHA-256 | `8ffc2a7d95972422b97ecf7e82da7002011bdacedcbfcc74dd52ae871b98a24e` |
| Successful access | `adb -s <frame-ip>:5555 shell id` returned `uid=0(root)` |

The firmware hash matches the April reports in [#13](https://github.com/wesbos/photo-frame-dashboard/pull/13)
and [#17](https://github.com/wesbos/photo-frame-dashboard/issues/17). Those reports
use different access routes; this unit's successful command did not write boot
or system storage. Host-only parsing rechecked the partition information and
boot hash in the saved backup when preparing this contribution.

USB attempts on this Mac showed transient `1f3a:efe8` FEL recovery enumeration,
then a black screen. A data path that enumerated a phone did not produce usable
normal Android USB ADB on the frame. Normal boot worked with its wall supply;
the precise cause of the Mac-connected failure was not established. Stock TCP
5555 refused connections. TCP 8086 was a separate paired WLAN file service,
not a verified ADB endpoint.

## 2. Why the command hostname matters

AiMOR sends command **12009** to `FileUtils.runCommand`, which starts `su`.
The existing [root-shell findings](aimor-remote-root-shell.md#4-code-path)
describe that handler. This firmware's backed-up optimized DEX code was inspected
before the live test. The one command sent was:

```sh
setprop service.adb.tcp.port 5555; stop adbd; start adbd
```

The connection is unencrypted TCP **7806**. The selected host on this unit was
**`imsconnect.efercro.com`**. The app also contains `iwsconnect.efercro.com`, but
that is the mode-0 host. An initial decompiler output misleadingly showed a zero
initializer. Fallback disassembly recovered the call to
`AndroidUtil.getBuildPropServerMode()`; the absent saved
`persist.sys.es_frame.server` property defaults to **mode 2**. After access, a
live property read was also empty. Redirecting only `imsconnect.efercro.com`
produced the real login and successful ADB connection.

The command sets only a runtime port property and restarts `adbd`. It does not
install keys, change authentication settings, or persist the port across boots.
Root ADB connected without an authorization prompt on this unit. This is root
access on the network; keep the session short and limited to your own frame.

On 2026-10-12, a host SHA-256 check of the captured launcher APK confirmed the
hash in the table matches the January APK reported in PR #3. The APK contains
no DEX files; its executable code is stored separately in
`oat/arm/launcher_aimor.odex`. APK equality corroborates the earlier finding but
does not prove that the optimized code or complete firmware is identical.
The command path was independently inspected in this unit's optimized code
and then verified by the successful live temporary-ADB session above.

## 3. Enable temporary Wi-Fi ADB

> **While this access is active, port 5555 is root ADB with no key check, open to every device on
> your network.** Do it on a network you control, keep the session short, finish the lock-down in
> [aimor-remote-root-shell.md](aimor-remote-root-shell.md) section 8 in the same session, and reboot
> the frame to close the port when you are done.

Use these steps only on a frame you own or have permission to administer. Python 3 and Android platform tools (`adb`) are required. The helpers use only the Python standard library. Start with a working AiMOR home screen and normal wall-supply power. A disabled AiMOR package cannot make this connection. If you already replaced Home, re-enable it through your working launcher's Android Settings first. If your launcher or kiosk can't reach Android Settings by touch, see [section 6](#6-lockout-after-disabling-aimor-and-offline-recovery).

1. Record the frame's current IP, the Mac's LAN IP, and the existing DNS settings. Keep any device backup, credentials and identifiers private. Define the current addresses in each terminal; the following values are examples:

   ```sh
   task_mac_ip=192.168.50.10
   task_frame_ip=192.168.50.20
   task_router_ip=192.168.50.1
   ```

2. Check for existing listeners on ports 53 and 7806. Do not stop unrelated services:

   ```sh
   lsof -nP -iUDP:53 -iTCP:53 -iTCP:7806
   python3 scripts/aimor-network-adb/test-protocol.py
   python3 scripts/aimor-network-adb/test-dns.py
   python3 scripts/aimor-network-adb/server.py --dry-run
   ```

3. Obtain the owner's approval for the exact runtime command above, then in one terminal, start the one-shot command listener for the verified frame:

   ```sh
   /usr/bin/python3 scripts/aimor-network-adb/server.py \
     --bind "$task_mac_ip" --frame-ip "$task_frame_ip" --seconds 600
   ```

   It accepts only that peer, waits for login command 110009, and sends the fixed temporary ADB command once. It does not decode or log login contents. The outer header is 110019; protobuf field 4 holds command 12009 and field 5 the shell text. Heartbeat command 101 is echoed. A transmitted command is not proof that ADB started.

4. In another terminal, start the temporary DNS proxy **before changing DNS**:

   ```sh
   sudo /usr/bin/python3 scripts/aimor-network-adb/dns.py \
     --bind "$task_mac_ip" --hostname imsconnect.efercro.com \
     --allow-client "$task_frame_ip" --allow-client "$task_mac_ip"
   ```

   If an outbound TCP 7806 block is already in place, the frame must be allowed to reach the temporary host listener on that port. Keep the public vendor destination blocked.

   Prefer a DNS setting affecting only the frame. If the router intermediates DNS, additionally allow only its verified address with `--allow-client "$task_router_ip"`. In the tested Google Home setup, DNS was set to Custom, primary = Mac LAN IP, secondary blank. Router-wide DNS also affects other devices; record and restore its original mode and servers.

   Only the selected command hostname is redirected. Unrelated queries are forwarded to public resolvers; the selected host's AAAA query returns no address. The default host is `imsconnect.efercro.com`; `--hostname iwsconnect.efercro.com` is for a separately verified mode-0 unit. The helper does not change DNS settings itself. After binding port 53 through sudo it drops privileges to the invoking Mac user.

   The tested Mac had a separate TCP 53 listener. `--udp-only` avoided disturbing it; that option does not provide DNS over TCP. Use it only after verifying UDP queries reach this helper. Homebrew Python was blocked by the Mac firewall; `/usr/bin/python3` was already allowed. Diagnose the actual firewall/listener state if requests time out.

5. Verify both the helper and the frame's actual resolver path:

   ```sh
   dig -b "$task_mac_ip" @"$task_mac_ip" imsconnect.efercro.com A +short
   dig -b "$task_mac_ip" @"$task_mac_ip" example.com A +short
   # If the router is the frame's DNS resolver:
   dig @"$task_router_ip" imsconnect.efercro.com A +short
   dig @"$task_router_ip" imsconnect.efercro.com AAAA +short
   ```

   The command-host A answer must be the Mac address. An unrelated hostname should still resolve publicly. A direct helper lookup alone does not prove the frame uses it. Confirm the expected source appears in helper events.

6. Reconnect Wi-Fi or reboot the frame to trigger a fresh AiMOR connection. Re-read its IP afterward. If it changed, restart the command listener with the new verified address and update the DNS allowlist. For a sudo DNS process, an optional `--clients-file diagnostics/aimor-network-adb/clients.json` reloads a small JSON array of verified addresses on each request; replace the file atomically rather than adding an entire subnet. Explicit `--allow-client` entries remain allowed, so avoid retaining a stale frame there when using a reloadable file.

   A reconnect is only needed to trigger the first login. On one January `20260113` unit the
   reconnect raced `adbd`: `runtime_adb_command_sent` appeared, but port 5555 never opened after
   the toggle. Re-arming `server.py` for the frame's new address and letting AiMOR's own retry loop
   reconnect — without touching Wi-Fi — delivered the command again and ADB came up. After the
   command is sent, leave Wi-Fi alone until `adb connect` succeeds or fails. The same unit reached
   the listener through a router local-DNS record (as in #117) instead of `dns.py`; the router is
   the frame's DNS server through DHCP, so no per-frame DNS setting was needed.

7. After the helper reports transmission, verify ADB and identity:

   ```sh
   adb connect "$task_frame_ip:5555"
   adb -s "$task_frame_ip:5555" get-state
   adb -s "$task_frame_ip:5555" shell id
   adb -s "$task_frame_ip:5555" shell getprop ro.hardware
   adb -s "$task_frame_ip:5555" shell getprop ro.build.version.release
   adb -s "$task_frame_ip:5555" shell getprop ro.build.display.id
   adb -s "$task_frame_ip:5555" shell getprop persist.sys.es_frame.server
   ```

   Expect `device`, UID 0, `sun8i`, Android 6.0.1 and the exact firmware above. A timeout, `unauthorized`, or an open TCP socket alone does not pass. Stop on an identity mismatch.

8. Restore original DNS **before stopping the DNS helper**, then verify public vendor and unrelated resolution. Stop only these task-owned helpers. The command listener exits after its one-shot session. Temporary ADB remains available until the frame reboots, so complete installation before that reboot.

## 4. After access: the existing dashboard

The verified result of this guide is temporary root ADB on the matching firmware.
The repository already supplies [`dashboard/`](../dashboard), a Vite dashboard
with sample data, and [`dashboard/kiosk/`](../dashboard/kiosk), its fullscreen
Android WebView app. Follow the existing
[backup and launcher steps](allwinner-a33-pf1007l.md#4-back-up-before-modifying-android)
before replacing Home or disabling AiMOR. Use `adb -s <frame-ip>:5555` wherever
the older USB examples use `adb -d`.

The dashboard build targets Chrome 106. This unit's stock WebView was 44, so
obtaining ADB alone does not prove that the dashboard renders. The existing
[WebView replacement guide](allwinner-a33-pf1007l.md#6-upgrade-webview-before-using-the-kiosk)
and [kiosk guide](allwinner-a33-pf1007l.md#7-build-the-fullscreen-kiosk-and-serve-the-demo-over-usb)
cover the next steps. They require their own backups and verification. The USB
serving example needs a working USB connection; a Wi-Fi-only setup needs a page
reachable from the frame over the LAN instead.

A different local replacement was installed during this unit's session and
survived reboot. The upstream dashboard, WebView 106 replacement and permanent
ADB were not tested on this unit and are not added by this contribution. If you
disable AiMOR, its vendor connection closes and this access route is unavailable
until you re-enable it. Reboot ends temporary ADB even if the replacement software
still works.

> **Update 2026-10-12:** checking for "a usable replacement Home" is not enough. That replacement
> was a fullscreen kiosk whose only exit was a two-finger hold. It locked this unit out the day
> after AiMOR was disabled. Before you disable AiMOR, check by hand that you can reach
> **Android Settings → Apps → AiMOR**. See [section 6](#6-lockout-after-disabling-aimor-and-offline-recovery).

## 5. Report and validation

```text
About model / firmware: PF1007L / YHK.F-null-A33-1001-D1024-PF1007L-321-OS-AIMOR.0.20260410
AiMOR version: 6.0.78 (code 78)
Launcher APK SHA-256: abc4e274940e21729de7b9dbaf1f7969efdf427955d0c4881a319611942fb65d (independently checked; matches PR #3)
Ports (DC jack, or USB-C only): USB-C only, TF slot, button
Cable and port that gave USB data (or none): A-to-C data path verified with a phone; transient FEL on Mac, no usable normal Android USB ADB
T3 USB IDs seen / adb devices output: transient 1f3a:efe8; adb list empty
T3b network ADB result (port 5555): refused before the vendor-channel command
T4 sunxi-fel version output (or skipped): usb_bulk_recv() ERROR -1: Input/Output Error during transient FEL; no successful identity query in this test
T5 check-dump stage / chunks (or skipped): not used for this network access route; private full backup already existed
eMMC size in sectors: 30,777,344
Boot partition start sector: 172032 (read from backup)
Boot image SHA-256 (sector 172032, 31,028 sectors): 8ffc2a7d95972422b97ecf7e82da7002011bdacedcbfcc74dd52ae871b98a24e
Route used and result: one vendor-channel runtime command; root ADB over Wi-Fi verified; DNS restored; ADB ended after reboot
Host OS: macOS, Apple silicon
First failed step and its exact output: USB ADB absent; FEL version query failed as recorded above
```

Before publication, the two host-only test scripts passed with both the host
Python and Apple's `/usr/bin/python3`: **8 tests** per interpreter. Tests cover a
known byte vector, fragmented/malformed frames, wrong-peer rejection, login
gating, exactly one dispatch, the default production hostname, reloadable
allowlists, and real loopback UDP/TCP DNS. `server.py --dry-run` reports a 73-byte
packet with `network_contact=false`. No frame is contacted by these checks.

The live test separately verified `device`, UID 0, `sun8i`, Android 6.0.1 and the
exact firmware, then restored DNS and stopped both temporary helpers. A packet
transmission alone was not treated as success. Private dumps, login contents,
serials, MACs, Wi-Fi settings, whole-eMMC hashes and replacement-app source are
excluded from this contribution.

## 6. Lockout after disabling AiMOR, and offline recovery

Observed on the same unit on 2026-10-12, using an Apple silicon Mac.

**How it happened.** The guide's next steps were followed: a kiosk was installed as Home, and
AiMOR was disabled after the kiosk was shown on screen. The kiosk's only touch exit was a two-finger hold
of 1.5 s, and it never triggered on the panel. After a reboot, temporary ADB was gone. With AiMOR
disabled, the Wi-Fi route above could not run.

**Routes that did not get back into Android Settings on this unit:**

| Route | Result |
| --- | --- |
| Two-finger hold in the kiosk | Never triggered. See the [kiosk note](allwinner-a33-pf1007l.md#7-build-the-fullscreen-kiosk-and-serve-the-demo-over-usb) and [PR #40](https://github.com/wesbos/photo-frame-dashboard/pull/40) |
| Android Back | No SystemUI, so no navigation bar (see [start here](pf1007l-start-here.md)) |
| USB keyboard Esc | The firmware maps Esc to Back, but the single USB-C port is needed for power |
| On-screen keyboard | The host temporarily served a page with a text field. Long-pressing the space bar opened the input-method chooser and then **Language & input**. That screen had no up/back arrow, so it was a dead end |
| Router DNS redirect plus reboot | DNS worked, but a disabled AiMOR never connected |
| USB to the Mac | As in section 1, no usable Android ADB |

**What worked: a read-only look, then one sector written offline.**

1. The SD card with the FEL stub
   ([section 2 of the PF1007L guide](allwinner-a33-pf1007l.md#2-use-an-sd-card-for-stable-fel-if-adb-is-absent)) put the A33 into FEL at power-on.
   It was connected through a USB-A-to-C adapter on a rear Mac port; a hub was unreliable. Unplug
   for five seconds between attempts.
2. A U-Boot was loaded into RAM over FEL. It exposed **only the eMMC**, read-only, as USB mass
   storage. That was the setup that worked; attempts that also exposed the SD card never showed
   the disk. In earlier backups of this unit, lowering the RAM U-Boot's clock to 480 MHz made USB
   reads stable.
3. `/data/system/users/0/package-restrictions.xml` on the data partition showed AiMOR with
   `enabled="2"`. The ext4 journal was copied to the host and replayed locally. This confirmed that
   no pending transaction touched the block holding that file.
4. A U-Boot script checked that the sector still held the expected bytes, then wrote **one
   512-byte sector**. The change restored AiMOR's entry to its default state. A readback checked the
   file, its inode and the whole 4 KiB block. The rule-1 owner approval was given for this exact
   write.
5. After removing the card and booting on wall power, Android showed a Home chooser. Picking AiMOR
   brought back its vendor connection, and the Wi-Fi route in section 3 worked again.

The scripts used hard-coded this unit's sector offsets, so they are not included. The guarded
check/apply/restore pattern for a one-sector write is in
[PR #49](https://github.com/wesbos/photo-frame-dashboard/pull/49) (`scripts/a33-sdboot/sector-write.cmd.in`).
For this file, the target sector has to be found from your own unit's ext4 metadata. It can also
move whenever Android rewrites the file.

**What to do instead:**

- Prefer persistent key-authenticated Wi-Fi ADB (see the note at the top of this
  file) over repeating this temporary route. With a stable `adb connect <frame-ip>:5555`
  in place, you never need the DNS redirect or the vendor channel again, and you can
  neutralise AiMOR by blocking its traffic (TCP 7806) instead of disabling the package. Treat that as
  a stopgap: AiMOR still runs `setenforce 0` at every start and trusts any HTTPS certificate on its
  other vendor ports. Disable it once you can get back in without it.
- Before you disable AiMOR, check by hand on the panel: kiosk → Android Settings → Apps → AiMOR.
  Some builds hide disabled apps there (#69), so this check alone is not enough: have persistent ADB first.
- Give the kiosk a way out that needs one finger, such as a corner button revealed by a single tap.
  On this unit, such a button appeared after an ADB-injected tap. It has not yet been checked by
  hand, which is the test that counts.
- If you would rather leave AiMOR enabled for now, keep TCP 7806 blocked on the router, as in
  [aimor-remote-root-shell.md](aimor-remote-root-shell.md) section 8. That stops the vendor's root
  command channel. The local redirect in section 3 still works if the frame can reach the host on 7806.
- With both launchers enabled, Android 6 asks which Home to use. This firmware has no
  `cmd package set-home-activity`, so choose **Always** on the panel.

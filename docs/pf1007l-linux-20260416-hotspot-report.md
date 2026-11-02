# PF1007L / AiMOR 6.0.78 / 20260416 from Linux: T3c through the computer's own hotspot

One USB-C-only unit on April `20260416` firmware, set up from Ubuntu 24.04. Access went the same
way as the [macOS report](pf1007l-macos-20260416-report.md) (#190): no stock ADB, then
[T3c](pf1007l-start-here.md#t3c-temporary-adb-through-the-aimor-connection) and
`persist.sys.usb.config` for root USB ADB with no boot patch. What is new here:

- **The router's DNS could not be changed** (Orange Livebox 6). T3c ran on an isolated WPA2
  hotspot from the Linux computer instead, with no internet and no change to the home network.
- AiMOR also looks up **`imsphotoframe.efercro.com`**.
- A full eMMC backup over USB ADB that meets the [backup rule](../README.md#rules-we-learned-the-hard-way).
- The frame shipped with a saved factory Wi-Fi network, **`YHK-03`**.
- The kiosk, built on Ubuntu from apt packages, as Home with a LAN page; the boot fixes, tested on
  a wall charger.
- A fix for `scripts/set-kiosk-url.sh`, whose read mode printed nothing on this firmware.

## Unit report

```text
About model / firmware: PF1007L, YHK.F-null-A33-1001-D1024-PF1007L-321-OS-AIMOR.0.20260416
AiMOR version: 6.0.78
Ports (DC jack, or USB-C only): USB-C only
Cable and port that gave USB data (or none): USB-A to USB-C cable in a direct USB-A port of a desktop PC
T3 USB IDs seen / adb devices output: 1f3a:efe8 for about 3 s at power-on, then about 20 s later 1f3a:1000 "Android" with one mass-storage interface (08/06/50, two empty LUNs), no ADB interface. `adb devices -l` empty.
T3b network ADB result (port 5555): refused (nc -vz -w 3), on the hotspot below
T4 sunxi-fel version output (or skipped): skipped
T5 check-dump stage / chunks (or skipped): skipped
eMMC size in sectors: 30,777,344
Boot partition start sector: 172032 (p6, 65,536 sectors)
Boot image SHA-256 (sector 172032, 31,028 sectors): bef19d67da122b8034670fcd73483c916ef30c6112b9503025a2a05f11d5dbc9 (31,032 sectors: fc4d22d2d595817e3b3de14bc44715f3a91ebb004233ca1017e703dbcd64514d)
Route used and result: T3c on a hotspot from the computer (server.py unchanged; DNS from the hotspot's own dnsmasq instead of dns.py) gave root ADB over Wi-Fi about 4 s after the frame joined; then persist.sys.usb.config=mass_storage,adb; after a cold boot USB 1f3a:1002, adb -d shell id -> uid=0(root)
Host OS: Ubuntu 24.04 (Linux 6.8), adb 34.0.4 from apt
First failed step and its exact output: T3b: "nc: connect to <frame-ip> port 5555 (tcp) failed: Connection refused"
```

Fingerprint: `AEEZO/astar_m86_8723cs/astar-m86_8723cs:6.0.1/MOB30R/20260416:eng/test-keys`,
`ro.build.display.id` `astar_m86_8723cs-eng 6.0.1 MOB30R 20260416 test-keys.1`. Both boot hashes
match the `20260416` row of the firmware table. Partition starts: bootloader 73728, env 139264,
boot 172032, system 237568, misc 2334720, recovery 2400256, cache 2465792, UDISK 4366336. The
1f3a:efe8 at power-on was not tried as FEL. The OTA app (`com.yhk.qeota`) is
`API_10-usaFrame-P-L_Yes-20240603` and `com.DeviceTest` is `YHKSign_20250303`.

## T3c on the computer's hotspot

The Livebox 6 doesn't let the owner change the DNS server it hands out, and AiMOR's Wi-Fi screen
has no **Modify network** (as in #190), so neither the router nor the frame could point DNS at the
computer. The computer was wired to the Livebox and its Wi-Fi card was free, so it ran its own
Wi-Fi network for the frame. NetworkManager's shared mode starts a dnsmasq for DHCP and DNS on that
network, and that dnsmasq answered for the vendor hosts. `dns.py` wasn't needed.

Use **WPA2-Personal only**: per the owner, this frame does not join WPA3 or WPA2/WPA3 mixed networks.
The commands, on Ubuntu 24.04 with Wi-Fi interface `wlp5s0` (yours may differ):

```sh
# 1. Nothing on the hotspot reaches the internet or the home network (in memory until reboot)
sudo nft -f - <<'EOF'
table inet pf1007l_isolate {
  chain forward {
    type filter hook forward priority -10; policy accept;
    iifname "wlp5s0" drop
    oifname "wlp5s0" drop
  }
}
EOF

# 2. The hotspot's dnsmasq answers every *.efercro.com name with the computer's hotspot address
printf '%s\n' 'address=/efercro.com/10.42.0.1' 'log-queries' |
  sudo tee /etc/NetworkManager/dnsmasq-shared.d/pf1007l-aimor.conf

# 3. A WPA2-only hotspot (CCMP, PMF off), 2.4 GHz
sudo nmcli connection add type wifi ifname wlp5s0 con-name pf1007l-hotspot autoconnect no \
  ssid <hotspot-name> 802-11-wireless.mode ap 802-11-wireless.band bg 802-11-wireless.channel 6 \
  wifi-sec.key-mgmt wpa-psk wifi-sec.proto rsn wifi-sec.pairwise ccmp wifi-sec.group ccmp \
  wifi-sec.pmf disable wifi-sec.psk '<password>' \
  ipv4.method shared ipv4.addresses 10.42.0.1/24 ipv6.method disabled
sudo nmcli connection up pf1007l-hotspot

# 4. When the frame joins, read its address from the DHCP log and start the one-shot listener
journalctl -f -t dnsmasq-dhcp            # wait for DHCPACK(wlp5s0) <frame-ip>
python3 scripts/aimor-network-adb/server.py --bind 10.42.0.1 --frame-ip <frame-ip> --seconds 600
```

The owner joined the frame to the hotspot from AiMOR's Wi-Fi screen. Two seconds after it got its
address, AiMOR looked up `imsconnect.efercro.com` and `imsphotoframe.efercro.com` in the same
second (both answered with 10.42.0.1), connected to TCP 7806, logged in (`110009`, 418-byte
payload) and got the command. Port 5555 was
open at once, and the identity checks from the
[procedure](pf1007l-20260410-network-adb.md#3-enable-temporary-wi-fi-adb) passed about 4 s after
the frame got its address. Then `setprop persist.sys.usb.config mass_storage,adb` (the old value
was `mass_storage`); the frame re-enumerated as `1f3a:1002` at once. The hotspot was taken down
right after, and a cold boot closed 5555. After T8 the hotspot, the dnsmasq file and the nft table
were deleted:

```sh
sudo nmcli connection delete pf1007l-hotspot
sudo rm /etc/NetworkManager/dnsmasq-shared.d/pf1007l-aimor.conf
sudo nft delete table inet pf1007l_isolate
```

Observed and suggested:

- **No internet is needed for T3c.** The login and the command came from the computer alone.
- **`address=/efercro.com/` covers every vendor host**, not only the command host that `dns.py`
  redirects. What AiMOR uses `imsphotoframe.efercro.com` for was not checked; with no internet it
  reached nothing.
- **Watch for a new address.** The frame joined once here, but its MAC is random (see the
  start-here hardware notes), so if it reconnects, restart `server.py` with the new `--frame-ip`
  from the next `DHCPACK`.
- **Run the helpers as the procedure shows, not with `python3 -I`.** `-I` leaves the script's own
  folder off the import path: `server.py` and `test-protocol.py` then fail with
  `ModuleNotFoundError: No module named 'proto'`, and `test-dns.py` gets Ubuntu's
  `python3-dnspython` package as `dns` instead of the repository's `dns.py`.
- **Remove the hotspot network from the frame** once it is on the home Wi-Fi (`wpa_cli -i wlan0
  remove_network <id>`, `save_config`), or anyone who copies its name and password gets the frame.

## Backup over USB ADB, meeting the backup rule

The full eMMC (15,758,000,128 bytes) was read before any other change, at about 9.6 MB/s over USB
ADB (about 27 minutes):

1. 59 chunks of 256 MiB with `/sbin/busybox dd` (the stock `dd` returns nothing past 2 GiB, as
   #190 found). Each chunk was read twice at the same time: once to the computer, once into
   `/sbin/busybox md5sum` on the frame. The byte count and both MD5s had to match. No retries were
   needed.
2. The whole image's byte count and SHA-256 (kept private), and a scan for 1 MiB blocks that are
   all `0xCC`: none.
3. Independent re-reads with the stock toolbox `dd` of the first 73,728 sectors and of the
   bootloader, env, boot, system, misc and recovery partitions, all below 2 GiB, each compared with
   the same range of the image: all matched.
4. `gzip -1`, then a decompress and SHA-256 compare.

`/data` was mounted during the read, so its part of the image is crash-consistent only.

## Lock-down, WebView and kiosk

- **T8** as in #190: Rootless Launcher 3.9.1 (SHA-256 matched the guide), then
  `com.efercro.os.aimor`, `com.yhk.qeota` and `com.DeviceTest` disabled (`enabled="2"` at once).
  After a cold boot: Rootless was Home, nothing listened on 7806, 5555 or 8086, USB root ADB worked.
- **Factory Wi-Fi network.** The frame shipped with a saved WPA-PSK network named `YHK-03`, so it
  would join any access point with that name and the factory password. It was removed with
  `wpa_cli remove_network` and `save_config`, with a Wi-Fi restart.
- **WebView 106** per [section 6 of the guide](allwinner-a33-pf1007l.md#6-upgrade-webview-before-using-the-kiosk),
  with the stock tree also kept as a tar on the computer. `/system` had 288,336 KiB free after the
  swap. After a cold boot the kiosk loaded the owner's page with it.
- **Kiosk** built on Ubuntu 24.04 with no Android Studio or `sdkmanager`:
  `sudo apt install openjdk-17-jdk-headless google-android-build-tools-34.0.0-installer
  google-android-platform-34-installer`, then `ANDROID_HOME=/usr/lib/android-sdk bash kiosk/build.sh`.
  The installer packages downloaded the SDK parts without asking anything. The page is the owner's
  own LAN server over plain HTTP, so no CA roots were needed. The kiosk used about 61 MB (PSS),
  with about 630 MB of 1 GB free.
- **Home:** `--ez home true`, then the Home chooser, **Home HQ** and **Always** (Android 6 has no
  `cmd package set-home-activity`). `package-restrictions.xml` then held the preferred activity
  with `always="true"`.
- **Way back:** as the kiosk README warns, the offline screen's **Open Wi-Fi settings** left no
  way back once the frame was connected (no nav bar; the owner found no way out on that screen).
  `input keyevent 4` over USB returned to the kiosk. The two-finger menu worked. After the owner
  turned on **Home HQ navigation**, the floating buttons worked. The vendor
  `BackgroundManagerService` logs `package not in whitelist: com.wesbos.homehq` on this firmware
  too, so `WRITE_SECURE_SETTINGS` was granted as the kiosk README suggests.
- **Wi-Fi:** the owner set the Livebox to WPA2 only; the frame joined it (WPA2-PSK, CCMP).

## Boot fixes

[pf1007l-boot-fixes.md](pf1007l-boot-fixes.md) over USB ADB: `check`, `apply` and `verify` passed
with `MAC` empty (made from the serial), `WIFI_DEFER=1`, `POWER_FIX=0` and
`NTP_SERVER=time.google.com`. The Livebox 6 does not answer NTP: an SNTP request from the computer
got no reply in 3 s, while `time.google.com` answered at stratum 1.

Before the fixes the address changed even without a reboot: the Wi-Fi restart that removed a saved
network brought a new random MAC and a new DHCP address. The kiosk had been installed while the
clock still read 1970 (no network yet, no clock battery).

After one power cycle on the PC's USB port, `verify` passed: the configured MAC replaced the
driver's random `88:00:33:77:…` before association, and the clock was right. Uptime timeline:

| Uptime | Event |
| --- | --- |
| 33.4 s | Kiosk on screen as Home, retrying (`ERR_INTERNET_DISCONNECTED`) |
| 41.9 s | `frame-wifidefer`: Wi-Fi started |
| 45.4 s | `wpa_supplicant` started with the configured MAC |
| 51.2 s | Wi-Fi connected; kiosk retried and loaded the page |
| 51.4 s | Clock set by Android's own SNTP. `frame-timesync` logged nothing, so its answer agreed within 1 s; `/data/local/frame-lasttime` was written 2 s later |

The owner then moved the frame to a wall charger away from the computer and unplugged and
replugged it once: both boots reached the page with no taps.

## `set-kiosk-url.sh` read mode

`scripts/set-kiosk-url.sh` with no URL read the kiosk's preferences with `su -c`. This firmware's
`su` is AOSP's, which rejects `-c` (`su: invalid uid/gid '-c'`), and `adb shell` is already root,
so the script printed nothing. It now reads directly when `adb shell` is root, then tries
`su -c`, then `su 0 sh -c` for AOSP's `su`.

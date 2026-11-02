# PF1007L / AiMOR `20260519` on macOS: 12 MHz Route U, then the full kiosk setup

One PF1007L bought on Amazon.de (sold as "Anna Bella 10.1"") went from stock to the Home HQ
kiosk in one session from an Apple-silicon Mac: Route U with the 12 MHz low-power U-Boot,
then the WebView 106 swap, the three CA roots, the kiosk as Home app and the
[boot fixes](pf1007l-boot-fixes.md). This is a unit report, not a new recipe: each step
followed the existing guides, and their checks still apply to your unit.

The repository's default 8-bit build was **not tried** on this unit. Because #189 and #98
(same firmware, same eMMC size) needed the 12 MHz build, it was the first build loaded.

## Report

```text
About model / firmware:   PF1007L; YHK.F-null-A33-1001-D1024-PF1007L-FL-AIMOR-OS.0.20260519
                          fingerprint AEEZO/astar_m86_8723cs/astar-m86_8723cs:6.0.1/MOB30R/20260519:eng/test-keys
AiMOR version:            6.0.78 (never updated)
Ports (DC jack, or USB-C only): USB-C only, TF slot
Cable and port that gave USB data: the cable in the box gave no USB device (charge-only, as on
                          #129, #141, #148, #172). An Elgato USB-C to USB-A data cable with a
                          USB-A (female) to USB-C adapter worked, first on a Studio Display port,
                          then on a powered CalDigit Element Hub (its USB 2.0 side) for the backup
T3 USB IDs seen / adb devices output: 1f3a:1000 "Android" (mass storage only), adb devices empty
T3b network ADB result (port 5555): skipped (owner kept the frame off Wi-Fi)
T4 sunxi-fel version output: AWUSBFEX soc=00001667(A33) 00000001 ver=0001 44 08 scratchpad=00007e00 00000000 00000000
T5 check-dump stage / chunks: skipped
eMMC size in sectors:     30,777,344
Boot partition start sector: 172032 (env 139264, system 237568, recovery 2400256)
Boot image SHA-256 (sector 172032, 31,028 sectors):
                          9a6e2456952f3dc2b99e64ea021321397bdc824364b5c8b42f503f847261630a
Route used and result:    Route U, 12 MHz low-power U-Boot + START STOP -> 1f3a:1002, adb -d shell id = uid=0(root)
Host OS:                  macOS (Apple silicon)
First failed step and its exact output: none
```

## Route U

| Step | Observed |
| --- | --- |
| FEL card | 32 GB Intenso microSDHC in a UGREEN USB-C reader. Factory MBR, FAT32 at sector 8192, so `fel-card-macos.py` accepted it without reformatting. Backup, then the 8 KiB stub write: `Exactly 8192 bytes changed at byte offset 8192. Readback verified.` |
| U-Boot build | v2025.10 + `pf1007l-uboot.patch` + [START STOP](patches/pf1007l-v2025.10-start-stop.patch) + [12 MHz low-power](patches/pf1007l-v2025.10-linux-12mhz.patch), built in Docker on a disposable source copy as in the [Linux report](pf1007l-20260519-linux-report.md). The generated `.config` had `CONFIG_SUNXI_NO_PMIC=y`, `CONFIG_SYS_CLK_FREQ=408000000` and `# CONFIG_AXP221_POWER is not set` (the #150 check) |
| SPL check | `build-uboot.sh`'s check misreads the `0xFF` padding of this variant, as in the Linux report. Checked by hand instead: eGON length `0x4000`, last code byte `0x3f26`, `__image_copy_end` `0x3f28` (warm-up SPL `0x3f38`), all below the unchanged `0x5e00` limit |
| U-Boot over FEL | DRAM trained on the first load from a cold start; the warm-up SPL was not needed. Both disks appeared within seconds: "UMS disk 1" was the eMMC, 15,758,000,128 bytes, `Media Read-Only: Yes` |
| Backup | `sudo caffeinate -dims … emmc-macos.py backup-resume`: 15 segments, each read twice from the disk and once from the file, no dropout, a little under two hours through the powered hub. 379 MB gzip |
| T6 and inspection | `inspect-emmc-backup.sh`: larger eMMC, partition starts as expected, boot hash matches the `20260519` row, `/data/property/persist.sys.usb.config` absent and `build.prop` `persist.sys.usb.config=mass_storage`, so the `mass_storage` hook applies (#81 does not) |
| `boot-patch.py` | Ramdisk slot 4,853,760 bytes at +10,143,744; ranges `[191844, 201324)` and `[172032, 172034)`, the same as #24, #36, #98 and #189. The only file that differs between the two ramdisks is `init.sun8i.usb.rc` (checked by extracting both) |
| Guarded write | The 12 MHz U-Boot, the four payloads over FEL (about 285 kB/s) and `write-boot.scr`. The eMMC came back read-only about 12 s after `Starting U-Boot`, now as "UMS disk 0" under a new disk number (the write script exposes only the eMMC) |
| Verify | `verify-resume`: `Verified: the eMMC equals the backup plus exactly the planned boot patch.` |
| Boot | Card out, cold boot: `1f3a:1002`, `uid=0(root)`, the fingerprint above, `sys.boot_completed` 1 |

## After root

The router blocked the frame while it booted. Then, in this order:

- **T8:** Rootless Launcher 3.9.1 installed and checked by hand on the panel (visible, Settings →
  Apps reachable), then `com.efercro.os.aimor`, `com.yhk.qeota` and `com.DeviceTest` disabled.
  All three showed `enabled="2"` in `package-restrictions.xml` before the power cycle, and after
  it they were still disabled with no processes and no `:7806` connection. The two saved Wi-Fi
  networks were removed with `wpa_cli remove_network` and `save_config`; none came back after the
  reboot.
- **WebView 106:** swapped as in [section 6 of the PF1007L guide](allwinner-a33-pf1007l.md#6-upgrade-webview-before-using-the-kiosk),
  with every staged and live file compared byte for byte with the host copy. `/system` had
  408,560 KiB free beforehand. The first boot afterwards finished normally on the powered hub
  with no Wi-Fi network saved. In the kiosk the log showed
  `Loaded version=106.0.5249.126` and no `dlopen` errors.
- **CA roots:** GTS Root R1, GTS Root R4 and ISRG Root X1 were absent and were added as in the
  [Uhale guide](si006-uhale.md), in the stock file layout (PEM, then the `-text -fingerprint -sha1`
  dump). Each DER SHA-256 matched that guide and the copy in macOS's system roots. With Wi-Fi
  up, the hosted demo dashboard on `*.workers.dev` loaded with no certificate errors.
- **Kiosk:** built with `dashboard/kiosk/build.sh` (Homebrew `android-commandlinetools`,
  build-tools 34.0.0, platform 34, Amazon Corretto 18 as the JDK, no `d8` crash),
  `WRITE_SECURE_SETTINGS` granted, set as Home with the chooser and **Always**.
- **Boot fixes:** `install.sh check`, `apply` and `verify` passed with `WIFI_DEFER=1`,
  `POWER_FIX=0` and `NTP_SERVER=time.google.com`. `check` noted that the AXP22x control file
  was not found, so `POWER_FIX` would do nothing on this unit. On the first boot, `verify`
  showed the configured MAC, the right time, the kiosk in focus and `Wi-Fi started at uptime 42.60s`.
  That boot also logged `Home chooser was showing (default Home app lost); started
  com.wesbos.homehq/.MainActivity`, although the kiosk was saved as the preferred Home activity
  before the power cycle, and still was afterwards. One boot only; whether it repeats was not tested.

## Differences from the notes in the guides

- The time zone shipped as `Europe/Amsterdam`, not `America/New_York` (European listing).
- The clock read 1 January 1970 until the frame reached the network; `auto_time` was already 1.
- The separate IoT Wi-Fi network this frame joined turned out to be the same subnet as the owner's
  main network. A separate Wi-Fi name is not network isolation: check the address the frame gets.

## Not done

- One boot after the boot fixes; no repeated or power-cut boot test.
- The restore script was generated and kept, but not exercised.
- Not tested: the default 8-bit build, the 4-bit 26 MHz build, T3b and T3c on this unit.

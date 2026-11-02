#!/usr/bin/env bash
# Change the URL the Home HQ kiosk shows (dashboard/kiosk). The URL is saved on the frame and
# used at every launch, including after a reboot.
#
# Usage: scripts/set-kiosk-url.sh <url>     save <url> and open it
#        scripts/set-kiosk-url.sh           print the saved URL
#
# Over Wi-Fi instead of USB: ADB_SERIAL=<frame-ip>:5555 scripts/set-kiosk-url.sh <url>

set -euo pipefail

PKG=com.wesbos.homehq
adb_() { adb ${ADB_SERIAL:+-s "$ADB_SERIAL"} "$@"; }

if [ $# -eq 0 ]; then
  # Root reads the app's private prefs; prints nothing if no URL was ever saved (kiosk default).
  # adb shell is already root on some frames, and AOSP su (PF1007L) rejects -c: use su 0 there.
  read_prefs="cat /data/data/$PKG/shared_prefs/*.xml"
  adb_ shell "if id | grep -q '^uid=0('; then $read_prefs; else su -c '$read_prefs' 2>/dev/null || su 0 sh -c '$read_prefs'; fi" |
    tr -d '\r' | sed -n 's:.*<string name="url">\(.*\)</string>.*:\1:p'
  exit 0
fi

url=$1
case "$url" in
  http://*|https://*) ;;
  *) echo "URL must start with http:// or https://" >&2; exit 1 ;;
esac
# The URL travels through adb and the device shell; keep it to characters that
# cannot break out of the quoting there. Percent-encode anything else.
if printf '%s' "$url" | LC_ALL=C grep -q '[^A-Za-z0-9./:?=%~_+,#@&-]'; then
  echo "URL contains characters it cannot take through adb shell; percent-encode them" >&2
  exit 1
fi

adb_ shell am start -n "$PKG/.MainActivity" --es url "'$url'" >/dev/null
echo "Saved and opened: $url"

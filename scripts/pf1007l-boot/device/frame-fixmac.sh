#!/system/bin/sh
# Keep the Wi-Fi MAC at MAC from /data/local/frame-boot.conf. The AIC8800 has no stored MAC, so the
# driver picks a random one each time it loads. The wpa_supplicant wrapper sets the MAC before Wi-Fi
# associates; this loop is the backstop. Based on frame-fixmac.sh from wesbos/photo-frame-dashboard
# PR #6. Runs forever: frame-boot-hook.sh execs it to keep the boot service alive.
# It also restarts Wi-Fi when Android gives up starting the driver ("Failed to start driver after 2"):
# Wi-Fi stays switched on but the interface is disabled, nothing retries, and the frame is offline
# until it is power-cycled. After 30 s in that state, toggle Wi-Fi as Settings would; if it stays
# dead, retry after 60 s, doubling to every 10 min.
CONF=/data/local/frame-boot.conf
[ -r $CONF ] && . $CONF
bad=-60   # frame-wifidefer.sh starts Wi-Fi after boot completes
tries=0
next=0
while true; do
    if [ -n "$MAC" ] && [ -e /sys/class/net/wlan0/address ]; then
        cur=$(cat /sys/class/net/wlan0/address)
        if [ "$cur" != "$MAC" ]; then
            ip link set wlan0 down
            ip link set wlan0 address $MAC
            ip link set wlan0 up
            log -t frame-fixmac "wlan0 $cur -> $MAC"
        fi
    fi
    st=
    if [ "$(getprop sys.boot_completed)" = 1 ] && [ ! -e /data/local/frame-nowifi ]; then
        # grep, not sed: toybox sed on this firmware mangles s/^wpa_state=//.
        st=$(wpa_cli -p /data/misc/wifi/sockets -i wlan0 status 2> /dev/null | grep '^wpa_state=')
        st=${st#wpa_state=}
        # A missing state also means dead, but only while Wi-Fi is switched on and wlan0 has no
        # address (settings is slow: ask last).
        case "$st" in
            ''|INTERFACE_DISABLED)
                ip -4 addr show wlan0 2> /dev/null | grep -q inet && st=up ||
                    [ "$(settings get global wifi_on 2> /dev/null)" = 1 ] || st=off ;;
        esac
    fi
    case "$st" in
        ''|INTERFACE_DISABLED)
            if [ "$(getprop sys.boot_completed)" = 1 ] && [ ! -e /data/local/frame-nowifi ]; then
                bad=$((bad + 10))
            fi ;;
        *) bad=0; tries=0 ;;
    esac
    if [ $bad -ge 30 ]; then
        read up _ < /proc/uptime
        up=${up%%.*}
        if [ "$up" -ge $next ]; then
            tries=$((tries + 1))
            gap=60
            i=1
            while [ $i -lt $tries ] && [ $gap -lt 600 ]; do gap=$((gap * 2)); i=$((i + 1)); done
            [ $gap -gt 600 ] && gap=600
            next=$((up + gap))
            log -t frame-fixmac "Wi-Fi dead (${st:-no supplicant}); restarting Wi-Fi, attempt $tries"
            svc wifi disable
            sleep 3
            svc wifi enable
            bad=0
        fi
    fi
    sleep 10
done

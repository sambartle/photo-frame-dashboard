#!/usr/bin/env bash
# Run the existing Linux build helpers in Docker. No card or frame is accessed.
set -euo pipefail

MODE="${1:-dump}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/diagnostics/a33-sdboot"
SOURCE="$ROOT/diagnostics/a33-sdboot-source"
PATCHED="$ROOT/diagnostics/pf1007/patched"
PIN=e50b1e8715011def8aff1588081a2649a2c6cd47

RUN=(docker run --rm --network none
    --mount "type=bind,src=$HERE,dst=/repo/scripts/a33-sdboot,readonly")

case "$MODE" in
    dump)
        mkdir -p "$OUT"
        if [ ! -d "$SOURCE/.git" ]; then
            git init -q "$SOURCE"
            git -C "$SOURCE" remote add origin https://github.com/u-boot/u-boot.git
            git -C "$SOURCE" fetch --depth 1 origin "$PIN"
            git -C "$SOURCE" checkout -q --detach FETCH_HEAD
        fi
        [ "$(git -C "$SOURCE" rev-parse HEAD)" = "$PIN" ] || {
            echo "STOP: U-Boot source is not at the required revision" >&2; exit 1;
        }
        [ -z "$(git -C "$SOURCE" status --porcelain)" ] || {
            echo "STOP: U-Boot source has local changes" >&2; exit 1;
        }
        docker build -t frame-a33-sdboot-build -f "$HERE/Dockerfile" "$HERE"
        "${RUN[@]}" \
            -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/src \
            -e A33_EMMC_4BIT \
            --mount "type=bind,src=$SOURCE,dst=/src,readonly" \
            --mount "type=bind,src=$OUT,dst=/repo/diagnostics/a33-sdboot" \
            frame-a33-sdboot-build \
            bash /repo/scripts/a33-sdboot/build.sh /src > "$OUT/build.log" 2>&1 || {
                tail -n 50 "$OUT/build.log" >&2
                exit 1
            }
        ;;
    apply|restore)
        "${RUN[@]}" \
            --mount "type=bind,src=$OUT,dst=/repo/diagnostics/a33-sdboot,readonly" \
            --mount "type=bind,src=$PATCHED,dst=/repo/diagnostics/pf1007/patched" \
            frame-a33-sdboot-build bash /repo/scripts/a33-sdboot/build-write.sh "$MODE"
        OUT="$PATCHED/sdcard-$MODE"
        ;;
    *) echo "usage: build-macos.sh [dump|apply|restore]" >&2; exit 1 ;;
esac

(cd "$OUT" && shasum -a 256 -c SHA256SUMS)
echo "Build verified in $OUT. No card or frame was changed."

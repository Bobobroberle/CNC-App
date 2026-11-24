#!/usr/bin/env bash
# Sets up a Raspberry Pi 4 (Raspberry Pi OS Lite 64-bit, Bookworm) on the
# LowRider: companion with the app, camera stream of the USB camera on the
# spindle, optionally the LSM6DSO vibration sensor – all as services that
# start on boot.
#
# On the Pi, in the folder copied from release/pi:
#   bash setup.sh --fluidnc 192.168.178.40            # Jackpot address (the first time)
#   bash setup.sh --fluidnc 192.168.178.40 --sensor   # with LSM6DSO
# Options: --camera /dev/video0  --resolution 1920x1080  --fps 30  --force (restart even while a browser is
# connected to the machine through the Pi: a job streamed through it would be cut)
# Running it again updates the files and keeps the database – and what it was told before (the Jackpot,
# the camera): without options it takes them from /etc/lowrider.env. Every run puts the new version
# beside the old ones (~/lowrider/releases) and switches; a version that does not answer is switched back.
set -euo pipefail

# Where this setup puts things. Raised whenever a version needs more than the files (a new service, a new
# rule): an update from the app refuses a version that needs a higher level – that one comes through here.
SETUP_LEVEL=2

FLUIDNC=""
CAMERA_DEVICE=""
RESOLUTION=""
FPS=""
SENSOR=0
FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fluidnc) FLUIDNC="$2"; shift 2 ;;
    --camera) CAMERA_DEVICE="$2"; shift 2 ;;
    --resolution) RESOLUTION="$2"; shift 2 ;;
    --fps) FPS="$2"; shift 2 ;;
    --sensor) SENSOR=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) awk 'NR > 1 && /^#/ { print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"
DIR="$HOME_DIR/lowrider"
# (LOWRIDER_ENV_FILE is for the tests: they must not read the real one)
ENV_FILE="${LOWRIDER_ENV_FILE:-/etc/lowrider.env}"

for f in companion.mjs lowrider-control.html lsm6dso.py lib.sh guard.sh health-gate.sh; do
  [[ -f "$HERE/$f" ]] || { echo "Missing $HERE/$f – copy the whole release/pi folder." >&2; exit 1; }
done
# shellcheck source=lib.sh
source "$HERE/lib.sh"

# What was told before stays: the Jackpot and the camera come from the env file of the last run, unless
# this run says otherwise – so an update needs no options.
[[ -n "$FLUIDNC" ]] || FLUIDNC="$(lr_env_get "$ENV_FILE" FLUIDNC_URL)"
[[ -n "$CAMERA_DEVICE" ]] || CAMERA_DEVICE="$(lr_env_get "$ENV_FILE" CAMERA_DEVICE)"
[[ -n "$RESOLUTION" ]] || RESOLUTION="$(lr_env_get "$ENV_FILE" CAMERA_RESOLUTION)"
[[ -n "$FPS" ]] || FPS="$(lr_env_get "$ENV_FILE" CAMERA_FPS)"
CAMERA_DEVICE="${CAMERA_DEVICE:-/dev/video0}"
RESOLUTION="${RESOLUTION:-1920x1080}"
FPS="${FPS:-30}"
PORT="$(lr_port "$ENV_FILE")"
# The restart below cuts the connection of a browser to the machine through the Pi – and a job streamed through it.
# (Jobs from the SD card are not affected.) Said before anything is changed.
CLIENTS="$(lr_relay_clients "$PORT")"
if [[ "$CLIENTS" != 0 && "$FORCE" != 1 ]]; then
  echo "!! A browser is connected to the machine through the Pi ($CLIENTS). The restart would cut that connection," >&2
  echo "!! and a job streamed through it. Disconnect in the app (Settings > Connection) and run this again," >&2
  echo "!! or add --force if you know nothing is running." >&2
  exit 1
fi
# The Jackpot's address: told, stored, or asked for – and an answer that is no address is asked again (never stored:
# an empty one would give ws://:81, which the relay cannot open, and setup would keep it for good).
URL=""
for attempt in 1 2 3; do
  if [[ -z "$FLUIDNC" ]]; then
    read -rp "IP address of the Jackpot (FluidNC), e.g. 192.168.178.40: " FLUIDNC || FLUIDNC=""
  fi
  if URL="$(lr_fluidnc_url "$FLUIDNC")"; then break; fi
  echo "!! \"$FLUIDNC\" is not an address (letters, digits, dots and dashes: 192.168.178.40 or jackpot.local)." >&2
  URL=""
  FLUIDNC=""
done
if [[ -z "$URL" ]]; then
  echo "!! No address of the Jackpot. Run again with:  bash setup.sh --fluidnc 192.168.178.40" >&2
  exit 1
fi
FLUIDNC="$URL"

echo "== Packages"
# Skipped when everything is there already, so an update also works offline (FluidNC network).
# ffmpeg records the camera during jobs ("Mitschnitt"); without it everything else still works.
PACKAGES=(ustreamer v4l-utils python3-smbus2 i2c-tools curl ca-certificates ffmpeg)
# Without internet apt would hang for minutes on every mirror, so look first.
online() {
  command -v curl >/dev/null || return 0
  timeout 10 curl -fsSI http://deb.debian.org/debian/ >/dev/null 2>&1
}
if dpkg -s "${PACKAGES[@]}" >/dev/null 2>&1; then
  echo "Packages already installed."
elif online && sudo apt-get update && sudo apt-get install -y "${PACKAGES[@]}"; then
  echo "Packages installed."
else
  MISSING=()
  for p in "${PACKAGES[@]}"; do dpkg -s "$p" >/dev/null 2>&1 || MISSING+=("$p"); done
  if [[ " ${MISSING[*]} " == *" ustreamer "* ]]; then
    echo "Could not install ${MISSING[*]} – the Pi needs internet for the first setup." >&2
    exit 1
  fi
  echo ""
  echo "!! Could not install: ${MISSING[*]} (no internet?)."
  echo "!! Everything else is set up; recording the camera during jobs needs ffmpeg."
  echo "!! Connect the Pi to the internet once (LAN cable to the home router) and run setup.sh again."
  echo ""
fi
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
  sudo apt-get install -y nodejs
fi

echo "== I2C (400 kHz)"
CONFIG=/boot/firmware/config.txt
[[ -f "$CONFIG" ]] || CONFIG=/boot/config.txt
# Said at the end only where this run changed something that needs a reboot
REBOOT=0
[[ "$(sudo raspi-config nonint get_i2c 2>/dev/null || true)" == 0 ]] || REBOOT=1
sudo raspi-config nonint do_i2c 0
if ! grep -q '^dtparam=i2c_arm_baudrate=' "$CONFIG"; then
  echo 'dtparam=i2c_arm_baudrate=400000' | sudo tee -a "$CONFIG" >/dev/null
  REBOOT=1
fi
sudo usermod -aG i2c,video "$USER_NAME"

echo "== Files to $DIR"
install -d -o "$USER_NAME" "$DIR" "$DIR/releases" "$DIR/data"
# An older setup left its files directly in $DIR: they become a release of their own (a copy), the way back.
lr_migrate_legacy "$DIR" "$USER_NAME" || { echo "Could not keep the old version as a release." >&2; exit 1; }
# The new version beside the old ones; `current` moves only when it is complete.
lr_install_release "$HERE" "$DIR" "$USER_NAME" || { echo "Could not install the new version." >&2; exit 1; }
echo "New version: $LR_NEW (before: ${LR_OLD:-none})"
# On trial like an update from the app: if it never confirms itself, the guard takes the way back by itself
if [[ -n "$LR_BACK" ]]; then lr_write_trial "$DIR" "$LR_NEW" "$LR_BACK" || echo "(no trial written)" >&2; fi
if ! compgen -G "$HERE/app/*" >/dev/null; then
  echo "No app/ folder beside setup.sh – the app works, but has no icon on the iPad's home screen." >&2
fi
# The way back for an update from the app, and what it checks: installed here, never by an update.
install -o "$USER_NAME" -m 755 "$HERE/guard.sh" "$DIR/guard.sh"
install -o "$USER_NAME" -m 755 "$HERE/health-gate.sh" "$DIR/health-gate.sh"
echo "$SETUP_LEVEL" >"$DIR/setup-level"
chown "$USER_NAME" "$DIR/setup-level" 2>/dev/null || true

# The env file keeps every line it does not know; the ones below are set.
ENV_NEW="$(mktemp)"
lr_env_merge "$ENV_FILE" \
  "PORT=$PORT" \
  "LOWRIDER_DIR=$DIR" \
  "LOWRIDER_APP=$DIR/current/app" \
  "LOWRIDER_DB=$DIR/data/lowrider.db" \
  "LOWRIDER_UPDATE=1" \
  "FLUIDNC_URL=$FLUIDNC" \
  "CAMERA_URL=:8081/stream" \
  "CAMERA_DEVICE=$CAMERA_DEVICE" \
  "CAMERA_RESOLUTION=$RESOLUTION" \
  "CAMERA_FPS=$FPS" >"$ENV_NEW"
sudo install -o root -g root -m 644 "$ENV_NEW" "$ENV_FILE"
rm -f "$ENV_NEW"

echo "== Power-off from the app (sudoers rule for $USER_NAME)"
# The companion runs as $USER_NAME and may run exactly this one command as root.
SUDOERS=/etc/sudoers.d/lowrider-power
TMP_SUDOERS="$(mktemp)"
echo "$USER_NAME ALL=(root) NOPASSWD: /usr/bin/systemctl poweroff" >"$TMP_SUDOERS"
if sudo visudo -cf "$TMP_SUDOERS" >/dev/null; then
  sudo install -o root -g root -m 440 "$TMP_SUDOERS" "$SUDOERS"
else
  echo "sudoers rule rejected – 'Pi herunterfahren' in the app will not work." >&2
fi
rm -f "$TMP_SUDOERS"

echo "== Services"
unit() { sudo tee "/etc/systemd/system/$1.service" >/dev/null; }
unit lowrider-companion <<UNIT
[Unit]
Description=LowRider Control companion (app, libraries, FluidNC relay, sensors)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER_NAME
WorkingDirectory=$DIR
EnvironmentFile=/etc/lowrider.env
# The way back for an update from the app: counts the starts of a version that has not confirmed itself
# and, at the third, points "current" back at "previous". It always exits 0.
ExecStartPre=/usr/bin/bash $DIR/guard.sh
ExecStart=/usr/bin/node $DIR/current/companion.mjs
# While a version is on trial: stops it when it does not answer in 30 s, so the guard counts the start
ExecStartPost=/usr/bin/bash $DIR/health-gate.sh
TimeoutStartSec=90
TimeoutStopSec=20
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
unit lowrider-camera <<'UNIT'
[Unit]
Description=LowRider camera stream (MJPEG straight from the USB camera)
After=network-online.target

[Service]
EnvironmentFile=/etc/lowrider.env
DynamicUser=yes
SupplementaryGroups=video
ExecStart=/usr/bin/ustreamer --device=${CAMERA_DEVICE} --format=MJPEG --encoder=HW \
  --resolution=${CAMERA_RESOLUTION} --desired-fps=${CAMERA_FPS} --persistent \
  --host=0.0.0.0 --port=8081 --allow-origin=*
# Camera unplugged or cable flaky: try again
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
unit lowrider-sensor <<UNIT
[Unit]
Description=LowRider vibration sensor (LSM6DSO) for chatter detection
After=lowrider-companion.service

[Service]
User=$USER_NAME
SupplementaryGroups=i2c
ExecStart=/usr/bin/python3 $DIR/current/lsm6dso.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable lowrider-companion lowrider-camera
# A version that does not answer makes this restart fail (the gate stops it): that is judged below, by what became of it
sudo systemctl restart lowrider-companion lowrider-camera || echo "(the restart reported a failure – looking at what became of the new version)" >&2
if [[ "$SENSOR" == 1 ]]; then
  sudo systemctl enable lowrider-sensor
  sudo systemctl restart lowrider-sensor || true
else
  # A sensor service that was running keeps running – from the new version's script.
  sudo systemctl try-restart lowrider-sensor || true
fi

echo "== Does the new version answer?"
# Judged by what becomes of it, not by the exit code of the restart: up to 150 s; where it is on trial, until it has
# confirmed itself (half a minute up) – a version that answers once and dies is taken back by the guard meanwhile.
SETTLED=0
lr_settle "$DIR" "$PORT" "$LR_NEW" 150 50 || SETTLED=$?
if [[ "$SETTLED" == 0 ]]; then
  if [[ -f "$DIR/trial" ]]; then
    echo "Yes: it answers (it confirms itself in a moment)."
  else
    echo "Yes: it answers."
  fi
  # Only now the files of the older, flat layout go (the service no longer runs from them).
  lr_remove_flat "$DIR"
  lr_prune "$DIR"
elif [[ "$SETTLED" == 1 ]]; then
  # The guard (before every start of the companion) has pointed `current` back at the version before
  echo >&2
  echo "!! The new version ($LR_NEW) did not hold: the guard has put $(lr_link_name "$DIR" current) back." >&2
  if lr_wait_healthy "$PORT" 40; then
    echo "!! The old version runs again. The new one was NOT installed." >&2
  else
    echo "!! The old version does not answer either." >&2
  fi
  echo "!! What went wrong:  journalctl -u lowrider-companion -n 80" >&2
  exit 1
else
  echo >&2
  echo "!! The new version ($LR_NEW) does not answer." >&2
  if lr_go_back "$DIR"; then
    echo "!! Going back to $(lr_link_name "$DIR" current) ..." >&2
    sudo systemctl restart lowrider-companion || true
    if lr_wait_healthy "$PORT" 40; then
      echo "!! The old version runs again. The new one was NOT installed." >&2
      echo "!! What went wrong:  journalctl -u lowrider-companion -n 50" >&2
    else
      echo "!! The old version does not answer either. Look:  journalctl -u lowrider-companion -n 80" >&2
    fi
  else
    echo "!! There is no older version to go back to. Look:  journalctl -u lowrider-companion -n 80" >&2
  fi
  exit 1
fi

HOST="$(hostname).local"
echo
echo "Done. On the iPad open:  http://$HOST:$PORT"
echo "Camera stream:           http://$HOST:8081/stream"
echo "Logs: journalctl -u lowrider-companion -u lowrider-camera -f"
if [[ "$REBOOT" == 1 ]]; then echo "I2C was just enabled: reboot once (sudo reboot) before using the sensor."; fi
echo
echo "================================================================"
echo "  PI CODE (type it once on each device: Einstellungen > Verbindung > Anmeldung am Pi):"
if CODE="$(lr_pi_code "$DIR" 15)"; then
  echo "      $CODE"
else
  echo "      (not there yet – look in $DIR/data/pi-code.txt)"
fi
echo "================================================================"

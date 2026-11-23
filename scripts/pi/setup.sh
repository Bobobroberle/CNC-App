#!/usr/bin/env bash
# Sets up a Raspberry Pi 4 (Raspberry Pi OS Lite 64-bit, Bookworm) on the
# LowRider: companion with the app, camera stream of the USB camera on the
# spindle, optionally the LSM6DSO vibration sensor – all as services that
# start on boot.
#
# On the Pi, in the folder copied from release/pi:
#   bash setup.sh --fluidnc 192.168.178.40            # Jackpot address
#   bash setup.sh --fluidnc 192.168.178.40 --sensor   # with LSM6DSO
# Options: --camera /dev/video0  --resolution 1920x1080  --fps 30
# Running it again updates the files and keeps the database.
set -euo pipefail

FLUIDNC=""
CAMERA_DEVICE="/dev/video0"
RESOLUTION="1920x1080"
FPS="30"
SENSOR=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fluidnc) FLUIDNC="$2"; shift 2 ;;
    --camera) CAMERA_DEVICE="$2"; shift 2 ;;
    --resolution) RESOLUTION="$2"; shift 2 ;;
    --fps) FPS="$2"; shift 2 ;;
    --sensor) SENSOR=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"
DIR="$HOME_DIR/lowrider"

for f in companion.mjs lowrider-control.html lsm6dso.py; do
  [[ -f "$HERE/$f" ]] || { echo "Missing $HERE/$f – copy the whole release/pi folder." >&2; exit 1; }
done
if [[ -z "$FLUIDNC" ]]; then
  read -rp "IP address of the Jackpot (FluidNC), e.g. 192.168.178.40: " FLUIDNC
fi
[[ "$FLUIDNC" == ws://* ]] || FLUIDNC="ws://${FLUIDNC}:81"

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
sudo raspi-config nonint do_i2c 0
grep -q '^dtparam=i2c_arm_baudrate=' "$CONFIG" ||
  echo 'dtparam=i2c_arm_baudrate=400000' | sudo tee -a "$CONFIG" >/dev/null
sudo usermod -aG i2c,video "$USER_NAME"

echo "== Files to $DIR"
install -d -o "$USER_NAME" "$DIR" "$DIR/app" "$DIR/data"
install -o "$USER_NAME" -m 644 "$HERE/companion.mjs" "$DIR/companion.mjs"
install -o "$USER_NAME" -m 644 "$HERE/lowrider-control.html" "$DIR/app/index.html"
# Home-screen app on the iPad: icons, launch pictures and manifest lie beside the page.
if compgen -G "$HERE/app/*" >/dev/null; then
  install -o "$USER_NAME" -m 644 "$HERE"/app/* "$DIR/app/"
else
  echo "No app/ folder beside setup.sh – the app works, but has no icon on the iPad's home screen." >&2
fi
install -o "$USER_NAME" -m 755 "$HERE/lsm6dso.py" "$DIR/lsm6dso.py"

sudo tee /etc/lowrider.env >/dev/null <<ENV
# LowRider Control – read by the lowrider-* services
PORT=8080
LOWRIDER_APP=$DIR/app
LOWRIDER_DB=$DIR/data/lowrider.db
FLUIDNC_URL=$FLUIDNC
# Port 8081 on this Pi (ustreamer)
CAMERA_URL=:8081/stream
CAMERA_DEVICE=$CAMERA_DEVICE
CAMERA_RESOLUTION=$RESOLUTION
CAMERA_FPS=$FPS
ENV

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
ExecStart=/usr/bin/node $DIR/companion.mjs
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
ExecStart=/usr/bin/python3 $DIR/lsm6dso.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable lowrider-companion lowrider-camera
sudo systemctl restart lowrider-companion lowrider-camera
if [[ "$SENSOR" == 1 ]]; then
  sudo systemctl enable lowrider-sensor
  sudo systemctl restart lowrider-sensor || true
fi

HOST="$(hostname).local"
echo
echo "Done. On the iPad open:  http://$HOST:8080"
echo "Camera stream:           http://$HOST:8081/stream"
echo "Logs: journalctl -u lowrider-companion -u lowrider-camera -f"
echo "I2C was just enabled: reboot once (sudo reboot) before using the sensor."

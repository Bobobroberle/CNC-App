#!/usr/bin/env bash
# shellcheck shell=bash
# Helpers of setup.sh, kept apart so that they can be tested without a Pi: `source` this file, call a
# function. Sourcing does nothing by itself.
#
# Layout under $DIR (~/lowrider):
#   releases/<name>/{companion.mjs, app/, lsm6dso.py, release.json}   one directory per version
#   current   -> releases/<name>    what the service runs (a symlink, swapped atomically)
#   previous  -> releases/<name>    what ran before: the way back
#   data/     the database, recordings, backups (never touched by an update)
#   trial     written by an update that waits for the new version to confirm itself (see guard.sh)
#   guard.sh, health-gate.sh, setup-level   installed by setup.sh only – never by an update from the app

# A release name: letters, digits, dot, dash, underscore – nothing a path could be made of.
lr_valid_name() { [[ "$1" =~ ^[A-Za-z0-9._-]{1,80}$ ]]; }

# The release a link ("current", "previous") points at; empty if there is none.
lr_link_name() { # <dir> <link>
  local target
  target="$(readlink "$1/$2" 2>/dev/null)" || return 0
  basename "$target"
}

# Points <link> at releases/<name>, atomically: a temporary link, then rename over the old one.
lr_point() { # <dir> <link> <name>
  local dir="$1" link="$2" name="$3"
  lr_valid_name "$name" || return 1
  [[ -d "$dir/releases/$name" ]] || return 1
  rm -f "$dir/$link.tmp"
  ln -s "releases/$name" "$dir/$link.tmp" && mv -T "$dir/$link.tmp" "$dir/$link"
}

# The build number of a release.json (empty if there is none).
lr_build_of() { # <release.json>
  # `|| true`: setup.sh runs with `set -e -o pipefail`, and a missing file must give an empty answer, not an exit
  sed -n 's/.*"build"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$1" 2>/dev/null | head -n1 || true
}

# A setup of the older, flat layout (companion.mjs, app/, lsm6dso.py directly in $DIR) becomes a release of its
# own, as a COPY: the flat files stay where they are until the new version has proved itself, because the old
# service still runs from them. Sets LR_LEGACY=1 when it did.
lr_migrate_legacy() { # <dir> [owner]
  local dir="$1" owner="${2:-}" name rel
  LR_LEGACY=0
  [[ -L "$dir/current" || ! -f "$dir/companion.mjs" ]] && return 0
  name="legacy-$(date -u +%Y%m%d%H%M%S)"
  rel="$dir/releases/$name"
  mkdir -p "$rel" || return 1
  cp -p "$dir/companion.mjs" "$rel/companion.mjs" || return 1
  if [[ -f "$dir/lsm6dso.py" ]]; then cp -p "$dir/lsm6dso.py" "$rel/lsm6dso.py" || return 1; fi
  if [[ -d "$dir/app" ]]; then cp -a "$dir/app" "$rel/app" || return 1; fi
  # Run as root, the directory would stay root's and a later run as the user could not clear it away
  if [[ -n "$owner" ]]; then chown -R "$owner" "$rel" 2>/dev/null || true; fi
  sync
  lr_point "$dir" current "$name" || return 1
  LR_LEGACY=1
}

# The flat files of the older layout go – only when the service no longer runs from them.
lr_remove_flat() { # <dir>
  local dir="$1"
  [[ -L "$dir/current" ]] || return 0
  # Clearing away is no reason to fail a setup that has worked
  rm -f "$dir/companion.mjs" "$dir/lsm6dso.py" || true
  if [[ -d "$dir/app" && ! -L "$dir/app" ]]; then rm -rf "$dir/app" || true; fi
  return 0
}

# Puts a new version beside the others and points `current` at it (`previous` at what was current – or, where
# that never confirmed itself, at what ran before it). The new directory is complete and on the disk before any
# link moves. Sets LR_NEW, LR_OLD (what was current) and LR_BACK (what `previous` is now).
lr_install_release() { # <source dir> <dir> [owner]
  local src="$1" dir="$2" owner="${3:-}" build rel f
  [[ -f "$src/companion.mjs" && -f "$src/lowrider-control.html" ]] || return 1
  build="$(lr_build_of "$src/release.json")"
  [[ -n "$build" ]] || build=0
  LR_NEW="b${build}-$(date -u +%Y%m%d%H%M%S)"
  rel="$dir/releases/$LR_NEW"
  mkdir -p "$rel/app" || return 1
  install -m 644 "$src/companion.mjs" "$rel/companion.mjs" || return 1
  install -m 644 "$src/lowrider-control.html" "$rel/app/index.html" || return 1
  # Every copy is checked: a full disk must refuse the install, not leave a release with empty files that becomes current
  if [[ -f "$src/release.json" ]]; then install -m 644 "$src/release.json" "$rel/release.json" || return 1; fi
  if [[ -d "$src/app" ]]; then
    for f in "$src"/app/*; do
      if [[ -f "$f" ]]; then install -m 644 "$f" "$rel/app/" || return 1; fi
    done
  fi
  if [[ -f "$src/lsm6dso.py" ]]; then install -m 755 "$src/lsm6dso.py" "$rel/lsm6dso.py" || return 1; fi
  if [[ -n "$owner" ]]; then chown -R "$owner" "$rel" 2>/dev/null || true; fi
  [[ -s "$rel/companion.mjs" && -s "$rel/app/index.html" ]] || return 1
  # On the disk before a link names it: after a power cut `current` must not point at empty files
  sync
  LR_OLD="$(lr_link_name "$dir" current)"
  LR_BACK="$LR_OLD"
  if [[ -n "$LR_OLD" ]]; then
    # A version that is still on trial (it has not confirmed itself) is no way back: the one before it is
    if [[ "$(lr_trial_get "$dir" new)" == "$LR_OLD" ]]; then
      LR_BACK="$(lr_trial_get "$dir" previous)"
    fi
    if [[ -n "$LR_BACK" && "$LR_BACK" != "$LR_NEW" && -d "$dir/releases/$LR_BACK" ]]; then
      lr_point "$dir" previous "$LR_BACK" || return 1
    else
      LR_BACK=""
    fi
  fi
  lr_point "$dir" current "$LR_NEW"
}

# One value of the trial file (see guard.sh), only if it is of the alphabet of a name; empty otherwise.
lr_trial_get() { # <dir> <key>
  sed -n "s/^$2=\([A-Za-z0-9._-]\{1,80\}\)\$/\1/p" "$1/trial" 2>/dev/null | head -n1 || true
}

# Puts a version on trial: guard.sh counts its starts and, at the third without a confirmation, goes back to
# <previous>. The new companion takes the trial away after half a minute up.
lr_write_trial() { # <dir> <new> <previous>
  local dir="$1"
  lr_valid_name "$2" && lr_valid_name "$3" || return 1
  printf 'new=%s\nprevious=%s\nattempts=0\n' "$2" "$3" >"$dir/trial.tmp" && mv -f "$dir/trial.tmp" "$dir/trial"
}

# Back to what ran before (used when a new version does not answer). Returns 1 if there is nothing to go back to.
lr_go_back() { # <dir>
  local dir="$1" prev cur
  prev="$(lr_link_name "$dir" previous)"
  cur="$(lr_link_name "$dir" current)"
  [[ -n "$prev" && "$prev" != "$cur" ]] || return 1
  lr_point "$dir" current "$prev" || return 1
  # What was on trial is gone from `current`: its trial is over
  rm -f "$dir/trial"
}

# Deletes old releases: the current one, the previous one and the newest other stay. Only names of the
# release alphabet are ever touched, and only directories.
lr_prune() { # <dir>
  local dir="$1" cur prev name kept=0 d
  cur="$(lr_link_name "$dir" current)"
  prev="$(lr_link_name "$dir" previous)"
  [[ -d "$dir/releases" ]] || return 0
  while IFS= read -r name; do
    lr_valid_name "$name" || continue
    d="$dir/releases/$name"
    [[ -d "$d" && ! -L "$d" ]] || continue
    [[ "$name" == "$cur" || "$name" == "$prev" ]] && continue
    kept=$((kept + 1))
    # A directory that cannot be cleared (another owner, say) stays: that is no reason to fail a setup that has worked
    if ((kept > 1)); then rm -rf "$d" || true; fi
  done < <(ls -1t "$dir/releases" 2>/dev/null)
  return 0
}

# One value of an env file (empty if it is not there).
# Read the way systemd reads the file: the last line of a key wins, one pair of quotes goes, a CR at the end goes.
lr_env_get() { # <file> <KEY>
  local value
  value="$(sed -n "s/^$2=//p" "$1" 2>/dev/null | tail -n1 | tr -d '\r' || true)"
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  if [[ -n "$value" ]]; then printf '%s\n' "$value"; fi
  return 0
}

# The address of the Jackpot as the relay needs it: ws://<host>:<port>. Takes what was typed (192.168.178.40, jackpot.local,
# 192.168.178.40:81) or stored; prints it, or returns 1 where it is no address – an empty one most of all: ws://:81 would
# be stored for good and kill the connection to the machine.
lr_fluidnc_url() { # <address>
  local v="$1"
  # blanks at either end go (a pasted address often has one); inside, they make it no address
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  [[ -n "$v" ]] || return 1
  if [[ "$v" != ws://* ]]; then v="ws://$v"; fi
  # no port given: FluidNC's websocket port
  if [[ "$v" =~ ^ws://[^:/]+$ ]]; then v="$v:81"; fi
  [[ "$v" =~ ^ws://[A-Za-z0-9][A-Za-z0-9._-]*:[0-9]{1,5}(/[A-Za-z0-9._~/-]*)?$ ]] || return 1
  echo "$v"
}

# The port of the companion from the env file: a number, else the default (setup writes it back, so a garbage value is repaired).
lr_port() { # <file>
  local port
  port="$(lr_env_get "$1" PORT)"
  [[ "$port" =~ ^[0-9]{1,5}$ ]] || port=8080
  echo "$port"
}

# The env file with <KEY=VALUE> pairs set, every other line kept as it was (what the operator added stays).
# Prints the new content.
lr_env_merge() { # <file> <KEY=VALUE>...
  local file="$1" pair key line
  local -A want=()
  local -a order=()
  shift
  for pair in "$@"; do
    key="${pair%%=*}"
    want[$key]="${pair#*=}"
    order+=("$key")
  done
  echo "# LowRider Control – read by the lowrider-* services (setup.sh keeps the lines it does not know)"
  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ "$line" == "# LowRider Control"* ]] && continue
      key="${line%%=*}"
      if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= && -n "${want[$key]+x}" ]]; then continue; fi
      echo "$line"
    done <"$file"
  fi
  for key in "${order[@]}"; do echo "$key=${want[$key]}"; done
}

# How many browsers are connected to the machine through the running companion (0 if it does not answer): such a
# connection is cut when the companion restarts, and with it a streamed job.
lr_relay_clients() { # <port>
  local n
  n="$(curl -fsS -m 3 "http://127.0.0.1:$1/api/health" 2>/dev/null | sed -n 's/.*"clients":\([0-9][0-9]*\).*/\1/p' | head -n1 || true)"
  echo "${n:-0}"
}

# Waits until the companion answers its health check.
lr_wait_healthy() { # <port> <seconds>
  local port="$1" secs="$2" i
  for ((i = 0; i < secs; i++)); do
    curl -fsS -m 3 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# After the restart: what became of the new version, judged by what happens – not by the exit code of systemctl (a
# version that does not answer makes the restart fail, since the gate stops it). Within <seconds> it looks for:
#   0  the new version answers – and, where it is on trial, it has confirmed itself (the trial is gone) or still answers
#      <confirm> seconds after its first answer
#   1  the guard has taken it away (`current` is not <new> any more)
#   2  nothing answered
lr_settle() { # <dir> <port> <new> <seconds> [confirm seconds]
  local dir="$1" port="$2" new="$3" end first=-1 confirm="${5:-50}"
  end=$((SECONDS + $4))
  while ((SECONDS < end)); do
    if [[ "$(lr_link_name "$dir" current)" != "$new" ]]; then return 1; fi
    if curl -fsS -m 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
      if ((first < 0)); then first=$SECONDS; fi
      if [[ ! -f "$dir/trial" ]]; then return 0; fi
      if ((SECONDS - first >= confirm)); then return 0; fi
    fi
    sleep 1
  done
  if ((first >= 0)); then return 0; fi
  return 2
}

# The Pi code (what a device types once to log in): the companion makes it at its first start.
lr_pi_code() { # <dir> <seconds>
  local file="$1/data/pi-code.txt" i
  for ((i = 0; i < ${2:-10}; i++)); do
    [[ -s "$file" ]] && { cat "$file"; return 0; }
    sleep 1
  done
  return 1
}

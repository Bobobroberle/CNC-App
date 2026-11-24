#!/usr/bin/env bash
# Runs before every start of the companion (systemd ExecStartPre, as the service user). It is the way back
# for an update made from the app: such an update swaps `current` to the new version, writes `trial` and lets
# the companion restart. A new version that is up and has run for a while deletes `trial` itself. One that
# crashes at the start never does – and this script counts: at the third start without a confirmation it
# points `current` back at `previous`, so a bad version costs a few minutes, not the Pi.
#
# THIS SCRIPT MUST ALWAYS EXIT 0. A failing ExecStartPre keeps the companion from starting at all – and that
# is exactly what it is here to prevent. It reads only what the companion writes (a few `key=value` lines,
# names of the release alphabet) and acts only on $LOWRIDER_DIR/{current,trial,update-last.json}.
# Installed by setup.sh to $LOWRIDER_DIR/guard.sh; an update from the app never replaces it.

DIR="${LOWRIDER_DIR:-}"
[[ -n "$DIR" && -d "$DIR" ]] || exit 0
TRIAL="$DIR/trial"

# A version whose program file is missing or empty cannot start at all – a power cut right after an update can leave
# that. There is no trial to count then (it may be gone too), so go back to `previous` at once, if that one is whole.
if [[ -L "$DIR/current" && ! -s "$DIR/current/companion.mjs" ]]; then
  BROKEN="$(basename "$(readlink "$DIR/current" 2>/dev/null)" 2>/dev/null)"
  BACK="$(basename "$(readlink "$DIR/previous" 2>/dev/null)" 2>/dev/null)"
  if [[ "$BACK" =~ ^[A-Za-z0-9._-]{1,80}$ && -s "$DIR/releases/$BACK/companion.mjs" && ! -L "$DIR/releases/$BACK" ]]; then
    rm -f "$DIR/current.tmp"
    if ln -s "releases/$BACK" "$DIR/current.tmp" 2>/dev/null && mv -T "$DIR/current.tmp" "$DIR/current" 2>/dev/null; then
      rm -f "$TRIAL"
      printf '{"result":"rolled-back","name":"%s","at":%s000,"detail":"the program of %s was missing or empty"}\n' \
        "$BACK" "$(date +%s)" "$BROKEN" >"$DIR/update-last.json" 2>/dev/null
      echo "lowrider guard: $BROKEN has no program file – back to $BACK" >&2
    fi
  fi
fi

[[ -f "$TRIAL" ]] || exit 0

# One value of the trial file, only if it is of the alphabet of a name (or digits).
get() { sed -n "s/^$1=\([A-Za-z0-9._-]\{1,80\}\)\$/\1/p" "$TRIAL" 2>/dev/null | head -n1; }

NEW="$(get new)"
PREVIOUS="$(get previous)"
ATTEMPTS="$(get attempts)"
[[ "$ATTEMPTS" =~ ^[0-9]{1,4}$ ]] || ATTEMPTS=0
CURRENT="$(basename "$(readlink "$DIR/current" 2>/dev/null)" 2>/dev/null)"

# A trial that is not about what runs now (an update that never got as far as the swap, or a swap by hand since).
if [[ -z "$NEW" || "$CURRENT" != "$NEW" ]]; then
  rm -f "$TRIAL"
  exit 0
fi

ATTEMPTS=$((ATTEMPTS + 1))
if ((ATTEMPTS > 2)); then
  if [[ -n "$PREVIOUS" && -d "$DIR/releases/$PREVIOUS" && ! -L "$DIR/releases/$PREVIOUS" ]]; then
    rm -f "$DIR/current.tmp"
    if ln -s "releases/$PREVIOUS" "$DIR/current.tmp" 2>/dev/null && mv -T "$DIR/current.tmp" "$DIR/current" 2>/dev/null; then
      rm -f "$TRIAL"
      printf '{"result":"rolled-back","name":"%s","from":"%s","at":%s000,"detail":"%s starts without confirming"}\n' \
        "$PREVIOUS" "$NEW" "$(date +%s)" "$NEW" >"$DIR/update-last.json" 2>/dev/null
      echo "lowrider guard: $NEW did not confirm itself in $((ATTEMPTS - 1)) starts – back to $PREVIOUS" >&2
      exit 0
    fi
  fi
  # Nothing to go back to: leave the trial alone, the operator has to look (setup.sh puts a version in place).
  echo "lowrider guard: $NEW did not confirm itself and there is no previous version to go back to" >&2
  exit 0
fi

# Count this start. A temporary file and a rename, so that a power cut never leaves half a file.
{
  echo "new=$NEW"
  echo "previous=$PREVIOUS"
  echo "attempts=$ATTEMPTS"
} >"$TRIAL.tmp" 2>/dev/null && mv -f "$TRIAL.tmp" "$TRIAL" 2>/dev/null
exit 0

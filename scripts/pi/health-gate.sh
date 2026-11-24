#!/usr/bin/env bash
# Runs after every start of the companion (systemd ExecStartPost, as the service user) – and only does something
# while a version is on trial (`trial` exists: an update that has not confirmed itself yet). It waits for the
# companion to answer its health check; if it does not within the time – or if the companion is gone already –
# it exits 1: systemd then stops the companion and starts it again, and `guard.sh` counts that as a start that did
# not confirm. So a version that starts but never answers (an endless loop, a lock at the start) is taken back as
# well as one that dies.
#
# Installed by setup.sh to $LOWRIDER_DIR/health-gate.sh; an update from the app never replaces it. Without a trial
# – every normal start – it exits 0 at once. It also exits 0 where it cannot look (no curl).

DIR="${LOWRIDER_DIR:-}"
[[ -n "$DIR" && -f "$DIR/trial" ]] || exit 0
command -v curl >/dev/null 2>&1 || exit 0

PORT="${PORT:-8080}"
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] || PORT=8080
LIMIT="${LOWRIDER_GATE_SECONDS:-30}"
[[ "$LIMIT" =~ ^[0-9]{1,3}$ ]] || LIMIT=30

# A deadline, not a count of rounds: a listener that takes the connection and never answers costs a round its whole timeout
END=$((SECONDS + LIMIT))
while ((SECONDS < END)); do
  curl -fsS -m 2 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && exit 0
  # A trial that was confirmed meanwhile (or taken away by the guard) is over: nothing to wait for
  [[ -f "$DIR/trial" ]] || exit 0
  # The companion is gone (systemd tells the pid): no use waiting – it is restarted, and counted, the sooner
  if [[ "${MAINPID:-}" =~ ^[0-9]+$ && "$MAINPID" != 0 ]] && ! kill -0 "$MAINPID" 2>/dev/null; then
    echo "lowrider gate: the version on trial has ended – the guard counts the start" >&2
    exit 1
  fi
  sleep 1
done
echo "lowrider gate: the version on trial did not answer in $LIMIT s – it is stopped, the guard counts the start" >&2
exit 1

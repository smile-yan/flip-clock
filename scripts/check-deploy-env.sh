#!/usr/bin/env bash
#
# check-deploy-env.sh — Fast-fail preflight for the release deploy pipeline.
#
# Runs BEFORE the build matrix so a missing/misconfigured deployment credential
# fails in seconds instead of after a long multi-platform build. It verifies:
#
#   1. Every required environment variable is present (and non-empty).
#   2. Exactly one SSH authentication method is configured.
#   3. The SSH port is a valid number (when provided).
#   4. The target host is reachable and the given credentials can log in.
#
# Usage:
#   scripts/check-deploy-env.sh
#
# Exits 0 on success, 1 on any failure. Sensible for both local and CI use.
set -euo pipefail

# ---------------------------------------------------------------------------
# Step 0 — Reject an unknown marker that would break remote path handling.
# TARGET_DIR is derived from WEB_DEPLOY_PATH during deploy; a stray single
# quote here would silently break scp's host:path parsing, so fail loudly.
# ---------------------------------------------------------------------------
if [[ "${TARGET_DIR:-}" == *"'"* ]]; then
  echo "::error::TARGET_DIR contains a single quote, refusing to continue: '$TARGET_DIR'" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 1 — Environment variable presence.
# ---------------------------------------------------------------------------
declare -a MISSING=()
for var in SSH_HOST SSH_USERNAME WEB_DEPLOY_PATH; do
  if [[ -z "${!var:-}" ]]; then
    MISSING+=("$var")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "::error::Missing required environment variable(s): ${MISSING[*]}" >&2
  echo "::error::Please set these in the repository Settings → Secrets and variables → Actions." >&2
  for var in "${MISSING[@]}"; do
    echo "::error::  - $var" >&2
  done
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2 — Exactly one SSH authentication method.
# ---------------------------------------------------------------------------
AUTH_METHODS=0
[[ -n "${SSH_PRIVATE_KEY:-}" ]] && AUTH_METHODS=$((AUTH_METHODS + 1))
[[ -n "${SSH_PASSWORD:-}" ]] && AUTH_METHODS=$((AUTH_METHODS + 1))

if [[ "$AUTH_METHODS" -eq 0 ]]; then
  echo "::error::No SSH authentication method configured." >&2
  echo "::error::Set exactly one of: SSH_PRIVATE_KEY, SSH_PASSWORD" >&2
  exit 1
fi
if [[ "$AUTH_METHODS" -gt 1 ]]; then
  echo "::error::Multiple SSH authentication methods configured." >&2
  echo "::error::Set exactly one of: SSH_PRIVATE_KEY, SSH_PASSWORD" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 3 — Validate the SSH port (when provided).
# ---------------------------------------------------------------------------
PORT="${SSH_PORT:-22}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "::error::SSH_PORT must be a number, got: '$PORT'" >&2
  exit 1
fi
if [[ "$PORT" -lt 1 || "$PORT" -gt 65535 ]]; then
  echo "::error::SSH_PORT out of range: $PORT" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 4 — Connectivity + login test.
# ---------------------------------------------------------------------------
SSH_OPTS=(-p "$PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o BatchMode=yes)

DEST="$SSH_USERNAME@$SSH_HOST"
echo "==> Testing SSH connectivity to $DEST:$PORT ..." >&2

REMOTE_ECHO='1234-deploy-preflight-5678'
if [[ -n "${SSH_PRIVATE_KEY:-}" ]]; then
  KEY_FILE="$(mktemp)"
  trap 'rm -f "$KEY_FILE"' EXIT
  printf '%s\n' "$SSH_PRIVATE_KEY" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  SSH_OPTS+=(-i "$KEY_FILE" -o IdentitiesOnly=yes)
fi

# Run a harmless command on the remote host. Uses whichever auth method the
# caller configured via environment (private key file, or sshpass for password).
run_remote() {
  local host="$1"
  shift
  if [[ -n "${SSH_PASSWORD:-}" ]]; then
    # shellcheck disable=SC2034
    local SSHPASS
    SSHPASS="$SSH_PASSWORD" sshpass -e ssh "${SSH_OPTS[@]}" "$host" "$@"
  else
    ssh "${SSH_OPTS[@]}" "$host" "$@"
  fi
}

if ! OUT="$(run_remote "$DEST" "echo $REMOTE_ECHO" 2>&1)"; then
  echo "::error::SSH login failed for $DEST:$PORT" >&2
  echo "::error::$OUT" >&2
  exit 1
fi

if [[ "$OUT" != *"$REMOTE_ECHO"* ]]; then
  echo "::error::Unexpected response from remote host (expected '$REMOTE_ECHO')." >&2
  echo "::error::$OUT" >&2
  exit 1
fi

if ! run_remote "$DEST" "mkdir -p '$WEB_DEPLOY_PATH'" >/dev/null 2>&1; then
  echo "::error::Failed to create remote directory '$WEB_DEPLOY_PATH' on $DEST" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 5 — scp transfer test.
# ---------------------------------------------------------------------------
# The deploy step pushes the landing page with scp, whose option set differs
# from ssh's (e.g. -P vs -p for the port), so a green ssh login alone does not
# guarantee the scp command line is valid. Exercise the same code path with a
# throwaway file and clean it up afterwards.

PROBE_LOCAL="$(mktemp)"
PROBE_REMOTE=".deploy-preflight-$REMOTE_ECHO"
printf 'preflight %s\n' "$DEST:$PORT" > "$PROBE_LOCAL"

run_scp() {
  if [[ -n "${SSH_PASSWORD:-}" ]]; then
    # shellcheck disable=SC2034
    local SSHPASS
    SSHPASS="$SSH_PASSWORD" sshpass -e scp "${SSH_OPTS[@]}" "$1" "$2"
  else
    scp "${SSH_OPTS[@]}" "$1" "$2"
  fi
}

SCP_OK=0
if run_scp "$PROBE_LOCAL" "$DEST:$WEB_DEPLOY_PATH/$PROBE_REMOTE" >/dev/null 2>&1; then
  if run_remote "$DEST" "test -f '$WEB_DEPLOY_PATH/$PROBE_REMOTE'" >/dev/null 2>&1; then
    SCP_OK=1
  fi
fi
run_remote "$DEST" "rm -f '$WEB_DEPLOY_PATH/$PROBE_REMOTE'" >/dev/null 2>&1 || true
rm -f "$PROBE_LOCAL"

if [[ "$SCP_OK" -ne 1 ]]; then
  echo "::error::scp transfer to '$WEB_DEPLOY_PATH' on $DEST failed." >&2
  echo "::error::The deploy step uses scp with these exact options; check that they are valid for scp (not just ssh)." >&2
  exit 1
fi

echo "==> OK: Deployment environment is ready ($DEST, port $PORT)." >&2
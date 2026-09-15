#!/usr/bin/env bash
#
# check-signing-env.sh — Fast-fail preflight for the updater signing secrets.
#
# `tauri build` signs every updater payload at bundle time, but it has no
# opinion about the signing key until it is already deep into the build: a
# missing or malformed secret only surfaces after a full multi-platform matrix
# has run (and the release job's `.sig` check fails even later). This script
# runs before the build matrix so that class of failure costs seconds.
#
# It verifies:
#
#   1. Both signing secrets are present and non-empty.
#   2. TAURI_SIGNING_PRIVATE_KEY actually holds key material — not the path of a
#      key file, not the public half, and not a truncated paste.
#   3. tauri.conf.json still declares the pubkey and the updater-artifacts
#      switch those secrets are meant to pair with.
#
# Usage:
#   scripts/check-signing-env.sh
#
# The same script runs locally against the real keypair:
#   TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/flip-clock.key)" \
#     TAURI_SIGNING_PRIVATE_KEY_PASSWORD='<password>' \
#     scripts/check-signing-env.sh
#
# Exits 0 on success, 1 on any failure. The `::error::` / `::warning::` lines
# are GitHub Actions annotations in CI and plain text when run locally.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/src-tauri/tauri.conf.json"

# TAURI_SIGNING_PRIVATE_KEY_PASSWORD is required because the release key is
# encrypted. Drop it from this list if the project ever moves to a key that has
# no password.
REQUIRED_VARS=(TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD)

fail() {
  echo "::error::$*" >&2
  exit 1
}

# `base64 -d` is the GNU spelling; macOS ships BSD base64, which spells it `-D`.
# Both platforms have python3, so use that and keep one code path for CI and
# local runs.
b64_decode() {
  python3 -c 'import base64,sys
sys.stdout.write(base64.b64decode(sys.stdin.read().strip()).decode("utf-8", "replace"))' 2>/dev/null
}

# ---------------------------------------------------------------------------
# Step 1 — Both secrets are present.
# ---------------------------------------------------------------------------
declare -a MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    MISSING+=("$var")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "::error::Missing required repository secret(s): ${MISSING[*]}" >&2
  echo "::error::Set them under Settings → Secrets and variables → Actions;" >&2
  echo "::error::see RELEASE.md → 'Updater signing keys' for the values to paste." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2 — The value is key material, not a path.
# ---------------------------------------------------------------------------
KEY_RAW="$TAURI_SIGNING_PRIVATE_KEY"

# Two shapes are accepted by the bundler: the key file's text (a comment line
# followed by the base64 payload), or the base64-boxed single line that
# `tauri signer generate` writes — which is base64 of that same text. Normalise
# to the text shape so one set of checks covers both.
KEY_TEXT=""
if [[ "$KEY_RAW" == *"untrusted comment"* ]]; then
  KEY_TEXT="$KEY_RAW"
else
  DECODED="$(printf '%s' "$KEY_RAW" | tr -d '\r\n ' | b64_decode || true)"
  if [[ "$DECODED" == *"untrusted comment"* ]]; then
    KEY_TEXT="$DECODED"
  fi
fi

if [[ -z "$KEY_TEXT" ]]; then
  # "I put the path in the secret" is the trap the docs warn about: on a clean
  # runner that path does not exist, and nothing notices until bundle time.
  if [[ "$KEY_RAW" != *$'\n'* ]] &&
     [[ "$KEY_RAW" == /* || "$KEY_RAW" == '~'* || "$KEY_RAW" == ./* || "$KEY_RAW" == *.key ]]; then
    fail "TAURI_SIGNING_PRIVATE_KEY looks like a filesystem path; it must hold the CONTENTS of ~/.tauri/flip-clock.key, not a path to it."
  fi
  fail "TAURI_SIGNING_PRIVATE_KEY is not recognisable minisign/rsign key material (neither the key file's text nor its base64-boxed form)."
fi

# ---------------------------------------------------------------------------
# Step 3 — It is the SECRET half, and it is complete.
# ---------------------------------------------------------------------------
# Line 1 is the comment, line 2 the encrypted key payload.
KEY_COMMENT="$(printf '%s\n' "$KEY_TEXT" | head -n 1)"
KEY_PAYLOAD="$(printf '%s\n' "$KEY_TEXT" | sed -n '2p' | tr -d '\r')"

if [[ "$KEY_COMMENT" == *"public key"* ]]; then
  fail "TAURI_SIGNING_PRIVATE_KEY holds the PUBLIC half (~/.tauri/flip-clock.key.pub). Signing needs the secret half, ~/.tauri/flip-clock.key."
fi

# A public-key payload is 56 base64 chars, a secret key's is well over 64, so
# this catches both a paste that lost its second line and a wrong-file mixup
# the comment check above happens to miss.
if [[ "$KEY_PAYLOAD" == *[!A-Za-z0-9+/=]* || ${#KEY_PAYLOAD} -lt 64 ]]; then
  fail "TAURI_SIGNING_PRIVATE_KEY is incomplete: a comment line is present but the key payload on line 2 is missing or malformed."
fi

if [[ "$KEY_COMMENT" != *"secret key"* ]]; then
  echo "::warning::TAURI_SIGNING_PRIVATE_KEY does not self-describe as a secret key; confirm it is ~/.tauri/flip-clock.key and not another keypair." >&2
fi

# ---------------------------------------------------------------------------
# Step 4 — The config the secrets pair with.
# ---------------------------------------------------------------------------
python3 - "$CONFIG" <<'PY'
import base64
import json
import sys

path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as handle:
        cfg = json.load(handle)
except OSError as exc:
    print(f"::error::cannot read {path}: {exc}", file=sys.stderr)
    sys.exit(1)
except json.JSONDecodeError as exc:
    print(f"::error::{path} is not valid JSON: {exc}", file=sys.stderr)
    sys.exit(1)

problems = []

pubkey = cfg.get("plugins", {}).get("updater", {}).get("pubkey", "")
if not pubkey:
    problems.append(
        "plugins.updater.pubkey is empty — clients would have no key to verify update signatures against"
    )
else:
    try:
        decoded = base64.b64decode(pubkey, validate=True).decode("utf-8", "replace")
    except Exception:
        problems.append(
            "plugins.updater.pubkey is not valid base64 (expected the base64-boxed minisign public key)"
        )
    else:
        if "untrusted comment" not in decoded:
            problems.append("plugins.updater.pubkey does not decode to minisign key material")
        elif "public key" not in decoded:
            problems.append("plugins.updater.pubkey decodes to something other than a public key")

if not cfg.get("bundle", {}).get("createUpdaterArtifacts"):
    problems.append(
        "bundle.createUpdaterArtifacts is not true — the bundler would emit no .sig sidecars for the secrets to sign"
    )

if problems:
    for problem in problems:
        print(f"::error::{problem}", file=sys.stderr)
    print(
        "::error::The signing secrets cannot be used as configured; see RELEASE.md → 'Updater signing keys'.",
        file=sys.stderr,
    )
    sys.exit(1)

print("::notice::tauri.conf.json declares the updater pubkey and createUpdaterArtifacts")
PY

echo "==> OK: updater signing environment is ready." >&2

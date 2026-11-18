#!/usr/bin/env bash
# Trust (or stop trusting) the local CA behind the `https` compose profile.
#
# The `caddy` service signs https://localhost with its own root CA, generated
# on first start and kept in the `caddy-data` volume. Until this machine
# trusts that root, the browser stops on a certificate warning halfway
# through every OAuth redirect to https://localhost/auth/…/callback.
#
# Trusting it lets anything holding the CA key (the volume) mint certificates
# this machine accepts for ANY hostname. Keep the profile on dev machines and
# run with --remove when you are done. Recreating the volume makes a new CA,
# so run this again after `docker volume rm`.
#
# Usage (from the repo root, with `docker compose --profile https up -d`):
#   scripts/trust-local-https-ca.sh            # add the CA to the system store
#   scripts/trust-local-https-ca.sh --remove   # take it out again
#
# macOS: System keychain (prompts for sudo). Debian/Ubuntu: update-ca-certificates.
# Fedora/Arch: trust anchor. Anything else: prints the certificate path.

set -euo pipefail

MODE=add
case "${1:-}" in
  '') ;;
  --remove) MODE=remove ;;
  -h | --help)
    sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "unknown argument: $1 (expected --remove or nothing)" >&2
    exit 2
    ;;
esac

for cmd in docker openssl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd is required but was not found in PATH" >&2
    exit 1
  fi
done

CA_IN_CONTAINER=/data/caddy/pki/authorities/local/root.crt
LINUX_NAME=opensteward-caddy-local
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CERT="$WORK/root.crt"

# Caddy writes the root on first start, a moment after the container is up.
fetched=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if docker compose cp "caddy:$CA_IN_CONTAINER" "$CERT" >/dev/null 2>&1; then
    fetched=1
    break
  fi
  sleep 1
done
if [ "$fetched" -ne 1 ]; then
  echo "Could not read $CA_IN_CONTAINER from the caddy service." >&2
  echo "Start it first:  docker compose --profile https up -d" >&2
  exit 1
fi

SUBJECT="$(openssl x509 -noout -subject -in "$CERT" | sed 's/^subject= *//')"
# Keychain prints SHA-1 as bare uppercase hex; openssl prints it with colons.
SHA1="$(openssl x509 -noout -fingerprint -sha1 -in "$CERT" | sed 's/.*=//; s/://g' | tr 'a-f' 'A-F')"

case "$(uname -s)" in
  Darwin)
    KEYCHAIN=/Library/Keychains/System.keychain
    present=0
    if security find-certificate -a -Z "$KEYCHAIN" 2>/dev/null | grep -q "SHA-1 hash: $SHA1"; then
      present=1
    fi
    if [ "$MODE" = add ]; then
      if [ "$present" -eq 1 ]; then
        echo "Already trusted: $SUBJECT ($SHA1)"
        exit 0
      fi
      echo "Adding to $KEYCHAIN (sudo): $SUBJECT"
      sudo security add-trusted-cert -d -r trustRoot -k "$KEYCHAIN" "$CERT"
      echo "Trusted. Restart the browser if https://localhost still warns."
      echo "Firefox keeps its own store: if it still warns, set"
      echo "security.enterprise_roots.enabled = true in about:config."
    else
      if [ "$present" -eq 0 ]; then
        echo "Not trusted, nothing to remove: $SUBJECT ($SHA1)"
        exit 0
      fi
      echo "Removing from $KEYCHAIN (sudo): $SUBJECT"
      sudo security delete-certificate -Z "$SHA1" "$KEYCHAIN"
      echo "Removed."
    fi
    ;;
  Linux)
    if command -v update-ca-certificates >/dev/null 2>&1; then
      DEST="/usr/local/share/ca-certificates/$LINUX_NAME.crt"
      if [ "$MODE" = add ]; then
        sudo install -m 0644 "$CERT" "$DEST"
      else
        sudo rm -f "$DEST"
      fi
      sudo update-ca-certificates --fresh >/dev/null
    elif command -v trust >/dev/null 2>&1; then
      if [ "$MODE" = add ]; then
        sudo trust anchor --store "$CERT"
      else
        sudo trust anchor --remove "$CERT"
      fi
    else
      echo "No update-ca-certificates or trust command found. Install the CA by hand:" >&2
      cp "$CERT" "./$LINUX_NAME.crt"
      echo "  ./$LINUX_NAME.crt  ($SUBJECT)" >&2
      exit 1
    fi
    echo "Done ($MODE): $SUBJECT"
    echo "Chrome and Firefox on Linux use their own NSS store; import the CA there"
    echo "too if they still warn (Settings → Certificates → Authorities)."
    ;;
  *)
    cp "$CERT" "./$LINUX_NAME.crt"
    echo "Unsupported OS for automatic trust. CA written to ./$LINUX_NAME.crt:" >&2
    echo "  $SUBJECT ($SHA1)" >&2
    exit 1
    ;;
esac

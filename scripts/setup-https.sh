#!/usr/bin/env bash
# Installs mkcert (via Homebrew if needed) and writes a LAN certificate
# for the iPhone PWA (hostname.local + LAN IPs) to data/certs/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${ROOT}/data/certs"
mkdir -p "${CERT_DIR}"

if ! command -v mkcert >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "mkcert is not installed and Homebrew was not found." >&2
    echo "Install mkcert: https://github.com/FiloSottile/mkcert#installation" >&2
    exit 1
  fi
  echo "Installing mkcert via Homebrew…"
  brew install mkcert
fi

echo "Trusting the local mkcert root on this Mac…"
mkcert -install

short_name="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
computer_name="$(scutil --get ComputerName 2>/dev/null || true)"
names=("${short_name}.local" "localhost" "127.0.0.1")

if [[ -n "${computer_name}" ]]; then
  slug="$(printf '%s' "${computer_name}" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9-' '-')"
  slug="${slug#-}"
  slug="${slug%-}"
  if [[ -n "${slug}" ]]; then
    names+=("${slug}.local")
  fi
fi

while IFS= read -r ip; do
  [[ -n "${ip}" ]] && names+=("${ip}")
done < <(
  {
    ipconfig getifaddr en0 2>/dev/null || true
    ipconfig getifaddr en1 2>/dev/null || true
    ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2 }'
  } | awk 'NF && !seen[$0]++'
)

unique_names=()
seen_names=""
for name in "${names[@]}"; do
  case " ${seen_names} " in
    *" ${name} "*) continue ;;
  esac
  unique_names+=("${name}")
  seen_names="${seen_names} ${name}"
done

echo "Certificate names:"
for name in "${unique_names[@]}"; do
  echo "  - ${name}"
done

mkcert \
  -cert-file "${CERT_DIR}/local.pem" \
  -key-file "${CERT_DIR}/local-key.pem" \
  "${unique_names[@]}"

caroot="$(mkcert -CAROOT)"
cp "${caroot}/rootCA.pem" "${CERT_DIR}/rootCA.pem"

{
  printf '%s\n' "${short_name}.local"
  for name in "${unique_names[@]}"; do
    printf '%s\n' "${name}"
  done
} | awk 'NF && !seen[$0]++' > "${CERT_DIR}/hostnames.txt"

echo
echo "Wrote:"
echo "  ${CERT_DIR}/local.pem"
echo "  ${CERT_DIR}/local-key.pem"
echo "  ${CERT_DIR}/rootCA.pem   ← AirDrop this to the iPhone once"
echo
echo "On the iPhone:"
echo "  1. Open the AirDropped rootCA.pem and install the profile"
echo "  2. Settings → General → About → Certificate Trust Settings → enable full trust"
echo "  3. Start the app, then: npm run https:proxy"
echo "  4. Open https://${short_name}.local:4843 (or the LAN IP) in Safari"
echo
echo "Details: docs/offline-iphone.md"

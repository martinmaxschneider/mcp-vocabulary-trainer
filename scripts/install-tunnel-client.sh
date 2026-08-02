#!/usr/bin/env bash
# Installiert OpenAI tunnel-client nach ~/.local/bin (macOS / Linux).
# Intel Mac → darwin-amd64, Apple Silicon → darwin-arm64.
set -euo pipefail

VERSION="${TUNNEL_CLIENT_VERSION:-v0.0.10}"
DEST_DIR="${HOME}/.local/bin"
DEST="${DEST_DIR}/tunnel-client"
BASE_URL="https://github.com/openai/tunnel-client/releases/download/${VERSION}"

arch="$(uname -m)"
os="$(uname -s)"

case "${os}-${arch}" in
  Darwin-x86_64) asset="tunnel-client-${VERSION}-darwin-amd64.zip" ;;
  Darwin-arm64)  asset="tunnel-client-${VERSION}-darwin-arm64.zip" ;;
  Linux-x86_64)  asset="tunnel-client-${VERSION}-linux-amd64.zip" ;;
  Linux-aarch64|Linux-arm64)
    asset="tunnel-client-${VERSION}-linux-arm64.zip"
    ;;
  *)
    echo "Unsupported platform: ${os} ${arch}" >&2
    echo "Download manually: https://github.com/openai/tunnel-client/releases/latest" >&2
    exit 1
    ;;
esac

echo "Platform: ${os} ${arch}"
echo "Downloading ${asset} …"

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

zip_path="${tmpdir}/tunnel-client.zip"
curl -fL -o "${zip_path}" "${BASE_URL}/${asset}"
unzip -qo "${zip_path}" -d "${tmpdir}"

binary="$(find "${tmpdir}" -type f -name tunnel-client | head -n 1)"
if [[ -z "${binary}" ]]; then
  echo "tunnel-client binary not found in archive." >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"
install -m 755 "${binary}" "${DEST}"

echo "Installed: ${DEST}"
echo
echo "Add to PATH if needed (bash — default on many Macs without zsh):"
echo '  echo '\''export PATH="$HOME/.local/bin:$PATH"'\'' >> ~/.bash_profile'
echo '  source ~/.bash_profile'
echo "Or for the current shell only:"
echo '  export PATH="$HOME/.local/bin:$PATH"'
echo "Then: which tunnel-client"

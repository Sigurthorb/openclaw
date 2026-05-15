#!/usr/bin/env bash
# Build the OpenClaw homelab image with the plugin set + runtime flags we need.
#
#   ./build.sh                          # default build (uses Docker layer cache)
#   ./build.sh --no-cache               # force a clean rebuild
#   ./build.sh --tag openclaw:test      # tag with something other than openclaw:clawo
#   ./build.sh --extensions a,b,c       # override the bundled extension list
#   ./build.sh --no-browser             # skip the Chromium install layer
#   ./build.sh --network default        # override the host-network default
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

IMAGE_TAG="openclaw:clawo"
EXTENSIONS="clawo-provider,flaresolverr-fetch,ebay-watch,browser,searxng,telegram,memory-lancedb,ollama"
INSTALL_BROWSER="1"
NETWORK="host"
DOCKER_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-cache)        DOCKER_ARGS+=("--no-cache"); shift ;;
    --tag)             IMAGE_TAG="$2"; shift 2 ;;
    --extensions)      EXTENSIONS="$2"; shift 2 ;;
    --no-browser)      INSTALL_BROWSER=""; shift ;;
    --network)         NETWORK="$2"; shift 2 ;;
    --pull)            DOCKER_ARGS+=("--pull"); shift ;;
    -h|--help)
      sed -n '2,9p' "$0"; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

echo ">>> tag:        $IMAGE_TAG"
echo ">>> extensions: $EXTENSIONS"
echo ">>> browser:    ${INSTALL_BROWSER:-disabled}"
echo ">>> network:    $NETWORK"
[[ ${#DOCKER_ARGS[@]} -gt 0 ]] && echo ">>> docker:     ${DOCKER_ARGS[*]}"
echo

docker build \
  --network "$NETWORK" \
  --build-arg "OPENCLAW_EXTENSIONS=$EXTENSIONS" \
  --build-arg "OPENCLAW_INSTALL_BROWSER=$INSTALL_BROWSER" \
  "${DOCKER_ARGS[@]}" \
  -t "$IMAGE_TAG" \
  .

echo
echo ">>> Built $IMAGE_TAG"
echo ">>> Restart the stack:  docker restart openclaw-gateway clawo"

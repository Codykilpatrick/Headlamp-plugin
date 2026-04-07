#!/usr/bin/env bash
# Fast local dev loop:
#   1. Build the plugin once
#   2. Start Headlamp in Docker with dist/ volume-mounted (no image rebuild)
#   3. Watch src/ and rebuild on every save — refresh browser to see changes
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_NAME="sailor-view"
PORT=4466
CONTAINER_NAME="headlamp-dev"

# ── 1. Initial build ──────────────────────────────────────────────────────────
echo "==> Building plugin..."
cd "$REPO_ROOT"
npm run build

# Copy package.json into dist so Headlamp can identify the plugin
cp "$REPO_ROOT/package.json" "$REPO_ROOT/dist/package.json"

# ── 2. Start Headlamp in Docker ───────────────────────────────────────────────
# Stop any leftover container from a previous run
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# Optional HEADLAMP_DEV_KUBECONFIG: kubeconfig file (e.g. kind --internal on macOS/Windows — see README).
# Optional HEADLAMP_DOCKER_NETWORK: e.g. "kind" so the container reaches the API server.
#
# The Headlamp image runs as user "headlamp", not root — kubeconfig must NOT live under /root
# (unreadable). Mount under /headlamp, which is owned by that user in the image.
HEADLAMP_KUBECONFIG_IN_CONTAINER="/headlamp/host.kubeconfig"

DOCKER_RUN_ARGS=(
  -d
  --name "$CONTAINER_NAME"
  -p "$PORT:$PORT"
)
if [[ -n "${HEADLAMP_DOCKER_NETWORK:-}" ]]; then
  DOCKER_RUN_ARGS+=( --network "${HEADLAMP_DOCKER_NETWORK}" )
  echo "==> Docker network: ${HEADLAMP_DOCKER_NETWORK}"
fi
if [[ -n "${HEADLAMP_DEV_KUBECONFIG:-}" ]]; then
  kcfg="${HEADLAMP_DEV_KUBECONFIG}"
  [[ "$kcfg" = /* ]] || kcfg="${REPO_ROOT}/${kcfg#./}"
  if [[ ! -f "$kcfg" ]]; then
    echo "==> ERROR: HEADLAMP_DEV_KUBECONFIG is not a file: $kcfg" >&2
    exit 1
  fi
  DOCKER_RUN_ARGS+=( -v "${kcfg}:${HEADLAMP_KUBECONFIG_IN_CONTAINER}:ro" )
  echo "==> Using kubeconfig: $kcfg"
else
  DOCKER_RUN_ARGS+=( -v "$HOME/.kube:/headlamp/host.dot-kube:ro" )
  HEADLAMP_KUBECONFIG_IN_CONTAINER="/headlamp/host.dot-kube/config"
fi
DOCKER_RUN_ARGS+=( -v "$REPO_ROOT/dist:/headlamp/plugins/$PLUGIN_NAME:ro" )

echo "==> Starting Headlamp on http://localhost:$PORT ..."
docker run "${DOCKER_RUN_ARGS[@]}" \
  ghcr.io/headlamp-k8s/headlamp:latest \
  -plugins-dir=/headlamp/plugins \
  -kubeconfig="${HEADLAMP_KUBECONFIG_IN_CONTAINER}"

echo "==> Headlamp running at http://localhost:$PORT"
echo "==> Watching for changes — refresh the browser after each save"
echo "==> Ctrl-C to stop"

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "==> Stopping Headlamp container..."
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

# ── 3. Watch and rebuild ──────────────────────────────────────────────────────
# headlamp-plugin start rebuilds on every src/ change; the volume mount means
# Headlamp picks up the new main.js immediately on next browser refresh.
# headlamp-plugin may print "Checking if @kinvolk/headlamp-plugin is up to date..."
# (non-blocking; see headlamp #1899). The watcher then stays quiet until you save.
echo "==> Starting file watcher (quiet until you edit src/)..."
npm run start

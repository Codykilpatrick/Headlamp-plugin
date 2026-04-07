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

echo "==> Starting Headlamp on http://localhost:$PORT ..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$PORT:$PORT" \
  -v "$HOME/.kube:/root/.kube:ro" \
  -v "$REPO_ROOT/dist:/headlamp/plugins/$PLUGIN_NAME:ro" \
  ghcr.io/headlamp-k8s/headlamp:latest \
  -plugins-dir=/headlamp/plugins \
  -kubeconfig=/root/.kube/config

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

#!/usr/bin/env bash
# Write a kubeconfig for reaching a kind cluster from another Docker container
# on the same host (macOS/Windows/Linux). Use with npm run dev + HEADLAMP_* env vars.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLUSTER_NAME="${1:-sailor-view}"
OUT="${REPO_ROOT}/.kube-kind-internal.yaml"

kind get kubeconfig --internal --name "$CLUSTER_NAME" > "$OUT"
echo "Wrote ${OUT}"
echo "Run Headlamp dev against this cluster:"
echo "  HEADLAMP_DOCKER_NETWORK=kind HEADLAMP_DEV_KUBECONFIG=\"${OUT}\" npm run dev"

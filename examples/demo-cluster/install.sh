#!/usr/bin/env bash
# Apply all demo workloads to the current kubectl context.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "==> Applying demo cluster workloads from ${ROOT}/examples/demo-cluster"
kubectl apply -k "${ROOT}/examples/demo-cluster"

echo ""
echo "==> Waiting for demo-ship-bus (Redpanda)..."
kubectl rollout status statefulset/redpanda -n demo-ship-bus --timeout=180s

echo ""
echo "==> Waiting for fleet-tracker..."
kubectl rollout status deployment/position-api -n fleet-tracker --timeout=120s
kubectl rollout status statefulset/position-db -n fleet-tracker --timeout=120s

echo ""
echo "==> Waiting for cargo-ops..."
kubectl rollout status deployment/manifest-service -n cargo-ops --timeout=120s

echo ""
echo "==> Waiting for nav-services (chart-server only — weather-feed is intentionally degraded)..."
kubectl rollout status deployment/chart-server -n nav-services --timeout=120s

echo ""
echo "==> Done. Cluster summary:"
kubectl get pods -n demo-ship-bus
kubectl get pods -n fleet-tracker
kubectl get pods -n cargo-ops
kubectl get pods -n nav-services

#!/usr/bin/env bash
# Apply demo workload (Redpanda) to the current kubectl context.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "==> Applying demo-ship-bus (Redpanda) from ${ROOT}/examples/demo-cluster"
kubectl apply -k "${ROOT}/examples/demo-cluster"
echo "==> Waiting for redpanda-0…"
kubectl rollout status statefulset/redpanda -n demo-ship-bus --timeout=180s
kubectl get pods -n demo-ship-bus

#!/usr/bin/env bash
set -euo pipefail

IMAGE="headlamp-sailor-view:local"
NAMESPACE="headlamp"
DEPLOYMENT="headlamp"

# Detect cluster type for image loading
if minikube status &>/dev/null; then
  CLUSTER="minikube"
elif kind get clusters &>/dev/null 2>&1; then
  CLUSTER="kind"
else
  CLUSTER="unknown"
fi

echo "==> Building Docker image: $IMAGE"
docker build -t "$IMAGE" -f "$(dirname "$0")/Dockerfile" "$(dirname "$0")/.."

echo "==> Loading image into cluster ($CLUSTER)"
case "$CLUSTER" in
  minikube)
    minikube image load "$IMAGE"
    ;;
  kind)
    KIND_CLUSTER=$(kind get clusters | head -1)
    kind load docker-image "$IMAGE" --name "$KIND_CLUSTER"
    ;;
  *)
    echo "  Unknown cluster type — skipping image load. Push manually if needed."
    ;;
esac

echo "==> Restarting deployment $NAMESPACE/$DEPLOYMENT"
kubectl rollout restart deployment/"$DEPLOYMENT" -n "$NAMESPACE"

echo "==> Waiting for rollout..."
kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE"

echo "==> Done. Headlamp is running the new build."

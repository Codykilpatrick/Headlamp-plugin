# Demo cluster workload (Redpanda)

This is an optional **real-ish** workload for demos: a single-node **[Redpanda](https://redpanda.com/)** broker (Kafka-compatible). It behaves like something you might run for **onboard streaming / integration** rather than a plain `nginx` Deployment.

- **Namespace:** `demo-ship-bus`
- **Install:** plain manifests (no Helm required)
- **Footprint:** tuned for **Kind** on a laptop (1 broker, small CPU/RAM)

## Install

```bash
kubectl apply -k examples/demo-cluster/
kubectl rollout status statefulset/redpanda -n demo-ship-bus --timeout=180s
kubectl get pods -n demo-ship-bus
```

## Sailor View settings (Headlamp)

System Health rolls up **Deployments and StatefulSets** in each namespace (Redpanda runs as a StatefulSet). If you use a custom RBAC role, allow **list/watch** on `statefulsets` (and `deployments`) in that namespace.

Add a namespace mapping so System Health shows a friendly name:

| Namespace        | System name (example)   |
|------------------|-------------------------|
| `demo-ship-bus`  | `Ship data bus`         |

(Settings → Plugins → Sailor View → Namespace → System name mappings.)

## Smoke test (optional)

```bash
kubectl -n demo-ship-bus exec -it redpanda-0 -- rpk cluster info
```

## Remove

```bash
kubectl delete -k examples/demo-cluster/
```

## Why not “just Kubernetes resources”?

Bare Pods/Deployments with `pause` or `nginx` are fine for learning the API; for **operator demos** you usually want a recognizable **application** (database, broker, API) so health views and language (“components ready”) map to something the audience already cares about.

## Helm (alternative)

If you prefer the official chart (more knobs, operators, persistence), use [Redpanda’s Helm docs](https://docs.redpanda.com/current/deploy/deployment-option/self-hosted/kubernetes/kubernetes-helm-deployment/) and point the same namespace mapping at whatever namespace you install into.

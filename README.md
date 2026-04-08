# Sailor View

A [Headlamp](https://headlamp.dev) plugin that provides a plain-language Kubernetes dashboard for non-technical operators.

**Features:**
- Plain-language terminology (Pods → Processes, Services → Connections, etc.)
- Color-coded system health dashboard per namespace (aggregates **Deployments** and **StatefulSets** by ready replicas)
- Guided troubleshooting panel with human-readable diagnostics
- Hides advanced Kubernetes complexity by default

**Plugin / Headlamp API (for contributors):** see [docs/HEADLAMP_PLUGIN_API.md](docs/HEADLAMP_PLUGIN_API.md) — sidebar `name` vs `label`, filters, and where to look in Headlamp’s sources when things change.

---

## Local development (desktop Headlamp)

```bash
npm install
npm start
```

Then open the [Headlamp desktop app](https://github.com/headlamp-k8s/headlamp/releases) — it will pick up the plugin automatically from the dev server.

---

## Local dev with Docker Headlamp (`npm run dev`)

### 1. Create a kind cluster

```bash
kind create cluster --name sailor-view
```

### 2. Seed the demo cluster

Populates four namespaces with realistic workloads — including one intentionally degraded service (`weather-feed`) to exercise the health dashboard:

```bash
./examples/demo-cluster/install.sh
```

| Namespace | Workloads |
|---|---|
| `demo-ship-bus` | Redpanda (Kafka broker) StatefulSet |
| `fleet-tracker` | `position-api` Deployment × 2, `position-db` PostgreSQL StatefulSet |
| `cargo-ops` | `manifest-service` Deployment × 2, `loading-scheduler` CronJob |
| `nav-services` | `chart-server` Deployment × 2, `weather-feed` Deployment (degraded — bad image) |

### 3. Start dev

```bash
npm run dev
```

`scripts/dev.sh` auto-detects the kind cluster, generates the internal kubeconfig, and attaches the Docker container to the `kind` network — no env vars needed on macOS or Linux.

Open **http://localhost:4466**. Edit `src/`, save, refresh the browser to pick up changes.

### Tear down and restart

```bash
kind delete cluster --name sailor-view
kind create cluster --name sailor-view
./examples/demo-cluster/install.sh
npm run dev
```

### Troubleshooting

- **Bad Gateway / cloud-off icon** — run `docker logs headlamp-dev` and check for kubeconfig errors. Delete the `.plugins/` and `kind-internal.kubeconfig` files and re-run `npm run dev` to regenerate them.
- **Missing package.json** — run `npm run build` once then refresh.
- **Permission errors on kubeconfig** — bind-mounted files keep host permissions. `chmod 644` a copy and point `HEADLAMP_DEV_KUBECONFIG` at it.

### 3. In-cluster Headlamp instead

To run Headlamp **inside** the cluster (no Docker networking quirks), use the steps in [Deploy to a local Kubernetes cluster](#deploy-to-a-local-kubernetes-cluster) below.

---

## Deploy to a local Kubernetes cluster

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) — `brew install kind`
- [kubectl](https://kubernetes.io/docs/tasks/tools/)

### 1. Create a cluster

```bash
kind create cluster --name sailor-view
```

### 2. Build and load the image

```bash
docker build -t headlamp-sailor-view:local -f deploy/Dockerfile .
kind load docker-image headlamp-sailor-view:local --name sailor-view
```

### 3. Deploy

```bash
kubectl apply -f deploy/k8s/
```

### 4. Open in your browser

```bash
kubectl port-forward -n headlamp svc/headlamp 4466:4466
```

Visit **http://localhost:4466**.

### Tear down

```bash
kind delete cluster --name sailor-view
```

---

## Rebuild after code changes

```bash
docker build -t headlamp-sailor-view:local -f deploy/Dockerfile .
kind load docker-image headlamp-sailor-view:local --name sailor-view
kubectl rollout restart deployment/headlamp -n headlamp
```

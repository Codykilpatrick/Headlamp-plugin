# Sailor View

A [Headlamp](https://headlamp.dev) plugin that provides a plain-language Kubernetes dashboard for non-technical operators.

**Features:**
- Plain-language terminology (Pods → Processes, Services → Connections, etc.)
- Color-coded system health dashboard per namespace
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

## Sample cluster for `npm run dev` (Docker Headlamp)

`./scripts/dev.sh` mounts your kubeconfig so Headlamp can talk to whatever cluster `kubectl` uses on the host.

### 1. Create a local cluster (example: kind)

```bash
kind create cluster --name sailor-view
kubectl get nodes
```

**Optional demo workload:** install a small **Redpanda** (Kafka-style) broker so System Health shows a real app, not a placeholder pod — see [examples/demo-cluster/README.md](examples/demo-cluster/README.md). Map namespace `demo-ship-bus` → e.g. `Ship data bus` in Sailor View settings.

### 2. Run dev against that cluster

**Linux:** Often this is enough (host kubeconfig usually works from the Headlamp container):

```bash
npm run dev
```

**macOS / Windows:** The default kubeconfig points at `https://127.0.0.1:…` on the host. Inside Docker, that address is the Headlamp container itself, not your machine — so use [kind’s internal kubeconfig](https://kind.sigs.k8s.io/docs/user/kind-kubeconfig/) and attach the container to the `kind` network:

```bash
kind get kubeconfig --internal --name sailor-view > kind-internal.kubeconfig
HEADLAMP_DOCKER_NETWORK=kind HEADLAMP_DEV_KUBECONFIG="$PWD/kind-internal.kubeconfig" npm run dev
```

(`kind-internal.kubeconfig` is gitignored.)

Open **http://localhost:4466** and you should see the cluster. Edit `src/`, save, refresh the browser to pick up plugin changes.

The `build` script copies **`package.json` into `dist/`** after every compile so Headlamp can load `/plugins/sailor-view/package.json`. If you see **404 on `package.json`** or “Missing package.json”, run `npm run build` once (or save a file so the watcher rebuilds) and refresh.

**Why kubeconfig path matters:** The official Headlamp image runs as user `headlamp`, not root. Mounting credentials under `/root/.kube` makes them unreadable, so the UI shows no cluster. `scripts/dev.sh` mounts your config under `/headlamp/` instead.

**Still broken?** Run `docker logs headlamp-dev` and look for kubeconfig errors. If you see permission errors, bind-mounted files keep host modes — for local dev only you can `chmod 644` on a **copy** of the kubeconfig and point `HEADLAMP_DEV_KUBECONFIG` at that file.

### Bad Gateway on the cluster (⋯ / cloud-off) in Docker

The UI shows your context (e.g. `kind-sailor-view`) and kubeconfig path under `/headlamp/…`, but requests to the API fail. On **macOS/Windows** this almost always means Headlamp in Docker is still using a kubeconfig whose `server:` is **`https://127.0.0.1:…`**. From inside the container, that is not your Kind node.

**Fix:** Stop the dev container, then use the **internal** kubeconfig and **kind** network (same as §2). The `--name` argument is the name you passed to `kind create cluster --name …` (not always the same string as the kubectl context):

```bash
docker rm -f headlamp-dev
kind get kubeconfig --internal --name sailor-view > kind-internal.kubeconfig
HEADLAMP_DOCKER_NETWORK=kind HEADLAMP_DEV_KUBECONFIG="$PWD/kind-internal.kubeconfig" npm run dev
```

If your cluster was created with another name, run `kind get clusters` and use that name after `--name`.

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
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/rbac.yaml
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service.yaml
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

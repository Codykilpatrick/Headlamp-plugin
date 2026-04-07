# Sailor View

A [Headlamp](https://headlamp.dev) plugin that provides a plain-language Kubernetes dashboard for non-technical operators.

**Features:**
- Plain-language terminology (Pods → Processes, Services → Connections, etc.)
- Color-coded system health dashboard per namespace
- Guided troubleshooting panel with human-readable diagnostics
- Hides advanced Kubernetes complexity by default

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

**Why kubeconfig path matters:** The official Headlamp image runs as user `headlamp`, not root. Mounting credentials under `/root/.kube` makes them unreadable, so the UI shows no cluster. `scripts/dev.sh` mounts your config under `/headlamp/` instead.

**Still broken?** Run `docker logs headlamp-dev` and look for kubeconfig errors. If you see permission errors, bind-mounted files keep host modes — for local dev only you can `chmod 644` on a **copy** of the kubeconfig and point `HEADLAMP_DEV_KUBECONFIG` at that file.

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

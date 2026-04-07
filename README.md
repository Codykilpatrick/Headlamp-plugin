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

# OME Web Console

A modern web interface for managing OME (Open Model Engine) resources including models, serving runtimes, and inference services.

The console talks to a cluster running OME's `ome.io/v1beta1` CRDs; it is developed and released independently of the [OME](https://github.com/ome-projects/ome) operator.

> **History:** this code previously lived in the OME repository under `web-console/`. It moved here as a fresh start, so commits before the move are not in this repository — see [ome-projects/ome](https://github.com/ome-projects/ome) for that history.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Make Commands](#make-commands)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Quick Start

Get up and running in under 2 minutes:

```bash
# 1. Install dependencies
make install

# 2. Copy environment file and configure
cp backend/.env.example backend/.env

# 3. Start development servers (frontend + backend)
make dev
```

The console will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080

---

## Prerequisites

Before you begin, ensure you have the following installed:

| Tool | Version | Check Command |
|------|---------|---------------|
| Go | 1.26+ | `go version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| kubectl | Latest | `kubectl version --client` |

You also need:
- Access to a Kubernetes cluster with OME CRDs installed
- `kubectl` configured with cluster access (`kubectl cluster-info` should work)

### Verify Prerequisites

```bash
# Quick check all prerequisites
go version && node --version && npm --version && kubectl cluster-info
```

---

## Installation

### 1. Clone and Navigate

```bash
git clone https://github.com/ome-projects/ome-console.git
cd ome-console
```

### 2. Install Dependencies

```bash
# Install both frontend and backend dependencies
make install

# Or install separately:
make install-frontend  # npm install
make install-backend   # go mod download
```

### 3. Configure Environment

```bash
# Copy the example environment file
cp backend/.env.example backend/.env

# Edit if needed (defaults work for local development)
```

**Backend `.env` file:**
```bash
PORT=8080
GIN_MODE=debug
KUBECONFIG=~/.kube/config
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

**Frontend `.env.local` file (optional):**
```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## Development

### Starting Development Servers

```bash
# Start both frontend and backend concurrently
make dev

# Or run them in separate terminals:
make dev-backend   # Terminal 1: Backend on :8080
make dev-frontend  # Terminal 2: Frontend on :3000
```

### Code Quality

```bash
# Run all linters
make lint

# Run linters separately
make lint-frontend  # ESLint
make lint-backend   # go vet

# Format code
make format

# Format separately
make format-frontend  # Prettier
make format-backend   # gofmt

# Check formatting without changes
make format-check

# TypeScript type checking
make typecheck

# Run tests
make test
```

### Building for Production

```bash
# Build both frontend and backend
make build

# Build separately
make build-frontend  # Creates .next/ directory
make build-backend   # Creates backend/bin/api binary

# Run production builds
make start-frontend  # Runs Next.js production server
make run-backend     # Runs compiled Go binary
```

### Useful Development Commands

```bash
# Check if services are running
make status

# Clean build artifacts
make clean

# Show all available commands
make help
```

---

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | API server port |
| `GIN_MODE` | `debug` | Gin framework mode (`debug`, `release`) |
| `KUBECONFIG` | `~/.kube/config` | Path to kubeconfig file |
| `KUBERNETES_IN_CLUSTER` | `false` | Set to `true` when running in-cluster |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` | Comma-separated allowed origins |
| `INFORMER_SYNC_TIMEOUT` | `60s` | How long startup waits for the Kubernetes caches to fill before failing (Go duration) |
| `OME_FIELD_VALIDATION` | `Strict` | API server field validation for writes: `Strict` rejects undeclared fields, `Warn` or `Ignore` lets them be pruned |
| `OME_MAX_DECODED_INSTANCES` | `20000` | Most instance rows one InferenceReplica status may expand to in the replica endpoints (the bound OME's CLI uses) |

### Frontend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Backend API URL |

---

## Architecture

```
ome-console/
├── frontend/                # Next.js 14 React application
│   ├── src/
│   │   ├── app/            # App Router pages and layouts
│   │   │   └── (dashboard)/# Dashboard pages (models, runtimes, services)
│   │   ├── components/     # Reusable UI components
│   │   │   ├── ui/         # Base UI components (Button, Table, etc.)
│   │   │   ├── forms/      # Form components
│   │   │   └── layout/     # Layout components (Sidebar, etc.)
│   │   ├── lib/            # Utilities, hooks, and API clients
│   │   │   ├── api/        # API client functions
│   │   │   ├── hooks/      # React Query hooks
│   │   │   └── types/      # TypeScript type definitions
│   │   └── hooks/          # Custom React hooks
│   └── public/             # Static assets
│
├── backend/                 # Go API server
│   ├── cmd/api/            # Application entrypoint
│   └── internal/
│       ├── api/            # Server setup and routing
│       ├── handlers/       # HTTP request handlers
│       ├── k8s/            # Kubernetes client and operations
│       ├── middleware/     # HTTP middleware (logging)
│       └── services/       # Business logic services
│
└── Makefile                # Development automation
```

### Tech Stack

**Frontend:**
- Next.js 14 (App Router)
- React 18 + TypeScript
- TailwindCSS
- TanStack Query (React Query)
- React Hook Form + Zod

**Backend:**
- Go 1.26+
- Gin web framework
- client-go (Kubernetes client)
- Zap logger

---

## API Reference

### Health Check
```
GET /health
```

### Models
```
GET    /api/v1/models                    # List ClusterBaseModels
GET    /api/v1/models/:name              # Get ClusterBaseModel
POST   /api/v1/models                    # Create ClusterBaseModel; body {model, huggingfaceToken?}
PUT    /api/v1/models/:name              # Update ClusterBaseModel
DELETE /api/v1/models/:name              # Delete ClusterBaseModel
GET    /api/v1/models/:name/progress     # Per-node download progress of a ClusterBaseModel

# Namespace-scoped BaseModels
GET    /api/v1/namespaces/:ns/models           # List BaseModels
GET    /api/v1/namespaces/:ns/models/:name     # Get BaseModel
POST   /api/v1/namespaces/:ns/models           # Create BaseModel; body {model, huggingfaceToken?}
PUT    /api/v1/namespaces/:ns/models/:name     # Update BaseModel
DELETE /api/v1/namespaces/:ns/models/:name     # Delete BaseModel
GET    /api/v1/namespaces/:ns/models/:name/progress  # Per-node download progress of a BaseModel
```

A HuggingFace token on create is stored in a Secret named `<model>-hf-token` that `spec.storage.key` points to: in the BaseModel's namespace, or in `ome` for a ClusterBaseModel, which is where OME's model agent looks. An existing Secret with that name is used as it is when it already holds the token. If it holds another token, it gets the new one only if the console created it, for example for a deleted model; otherwise, as with an existing model, the create fails with a `409`. If the API server rejects the model, a Secret created for it is removed again. To use an existing Secret without sending its token, omit `huggingfaceToken` and set `spec.storage.key` yourself.

### Runtimes
```
GET    /api/v1/runtimes                  # List ClusterServingRuntimes (?namespace= lists ServingRuntimes instead)
GET    /api/v1/runtimes/:name            # Get ClusterServingRuntime
POST   /api/v1/runtimes                  # Create ClusterServingRuntime
PUT    /api/v1/runtimes/:name            # Update ClusterServingRuntime
DELETE /api/v1/runtimes/:name            # Delete ClusterServingRuntime
POST   /api/v1/runtimes/:name/clone      # Clone a runtime
POST   /api/v1/runtimes/explain          # Rank runtimes for a model by OME's selection rules (body below)
GET    /api/v1/runtimes/compatible       # Runtimes whose entries name ?format= (and ?framework=), best first
GET    /api/v1/runtimes/recommend        # The runtime OME would auto-select for ?format= (and ?framework=)
GET    /api/v1/runtimes/:name/compatibility  # Check a named runtime, with the spec it inherits (?namespace= for a ServingRuntime)
POST   /api/v1/runtimes/validate         # Check a runtime manifest against the selection rules
GET    /api/v1/runtimes/fetch-yaml       # Fetch YAML from URL

# Namespace-scoped ServingRuntimes
GET    /api/v1/namespaces/:ns/runtimes           # List ServingRuntimes
GET    /api/v1/namespaces/:ns/runtimes/:name     # Get ServingRuntime
POST   /api/v1/namespaces/:ns/runtimes           # Create ServingRuntime
PUT    /api/v1/namespaces/:ns/runtimes/:name     # Update ServingRuntime
PATCH  /api/v1/namespaces/:ns/runtimes/:name     # Patch ServingRuntime
DELETE /api/v1/namespaces/:ns/runtimes/:name     # Delete ServingRuntime
GET    /api/v1/namespaces/:ns/runtimes/:name/status
```

`POST /api/v1/runtimes/explain` runs the runtime selection OME runs for an InferenceService that names no runtime (`backend/internal/runtimeselect`, after the OME reference docs under `reference/matching`). The body is `{"namespace": "team-a", "model": <BaseModel spec> | {"name": "llama", "kind": "BaseModel" | "ClusterBaseModel"}, "acceleratorClasses": ["nvidia-h100"], "deploymentMode": "OMENative"}`; the last two are optional, `kind` defaults to `ClusterBaseModel`, a `BaseModel` is looked up in `namespace`, and a model that does not exist is a `404`. The answer is `{"items": [{"runtime": {"name", "kind", "namespace"}, "compatible", "autoSelect", "score", "reasons": [...], "exclusion"}]}`: every ClusterServingRuntime and every ServingRuntime in `namespace`, in the order OME ranks the runtimes it could pick on its own (ServingRuntimes first, then the score `(format weight + framework weight) × priority`, then the closest `modelSizeRange`, then the name), followed by the runtimes OME would not pick, with `exclusion` naming the first rule each one fails in OME's wording. A compatible runtime with no `autoSelect: true` entry is usable only when named, which its last reason says. Like OME's auto-selection, `explain` reads each runtime's own spec; `GET /api/v1/runtimes/:name/compatibility` reads the spec a runtime inherits through `ome.io/inherit-from`, as OME does for a named runtime. The `compatible`, `recommend` and `:name/compatibility` routes take only format and framework names, so they match on the names alone and ignore the versions, architecture and quantization that an entry requires.

### Services
```
GET    /api/v1/services                          # List InferenceServices across namespaces (?namespace= to narrow)
GET    /api/v1/namespaces/:ns/services           # List InferenceServices in a namespace
GET    /api/v1/namespaces/:ns/services/:name     # Get InferenceService
POST   /api/v1/namespaces/:ns/services           # Create InferenceService
PUT    /api/v1/namespaces/:ns/services/:name     # Update InferenceService (body carries resourceVersion)
PATCH  /api/v1/namespaces/:ns/services/:name     # Patch InferenceService
DELETE /api/v1/namespaces/:ns/services/:name     # Delete InferenceService
GET    /api/v1/namespaces/:ns/services/:name/status
GET    /api/v1/namespaces/:ns/services/:name/logs    # Pod logs as NDJSON; ?component=&instance=&revision=&container=&tailLines=500&follow=true
GET    /api/v1/namespaces/:ns/services/:name/replicas  # The service's InferenceReplicas with their instance rows decoded
GET    /api/v1/namespaces/:ns/replicas/:name/instances # One InferenceReplica with its instance rows decoded
GET    /api/v1/namespaces/:ns/events?kind=&name=     # Kubernetes events recorded for one object, newest first
GET    /api/v1/replicas                              # List InferenceReplicas across namespaces (OME v1.3; 404 CAPABILITY_MISSING otherwise)
GET    /api/v1/namespaces/:ns/replicas[/:name]       # InferenceReplicas in a namespace, same verbs as services
```

The single-object service routes also answer at `/api/v1/services/:name?namespace=<ns>`; a namespaced resource without a namespace is a `400`.

The replica endpoints return each InferenceReplica as `{replica, encoding, instances, decodeError?}`: `replica` is the object without the fields that carry the rows, `encoding` is `DenseV1` or `ColumnarV2`, and `instances` is one row per instance (`index`, `phase`, revisions, pod counts, `operation`, `lastFailure`, ...), decoded with the codec ported from OME. A status that cannot be decoded is returned with `decodeError` and no rows.

Logs are selected with the labels `kubectl ome logs` uses (`ome.io/inferenceservice`, `component`, `ome.io/managed-by=OMENative` with `ome.io/instance-index`, `ome.io/revision-hash`), read from the `ome-container` container unless `container=` says otherwise, and cover at most 20 pods (a `{"notice": ...}` line says when more matched). Each line is `{"pod", "container", "ts", "line"}`; `follow=true` streams for up to 10 minutes. The logs and events endpoints need RBAC to list `pods`, get `pods/log` and list `events` in the namespace.

### Writes: dry run, field validation, patches

- `?dryRun=true` on `POST`, `PUT` and `PATCH` runs admission and validation on the API server without persisting anything, and returns the object as it would be stored. Any value other than `true` or `false` is rejected with a `400`.
- Writes use the API server's `Strict` field validation by default (`OME_FIELD_VALIDATION`), so a field the installed OME CRD does not declare is rejected with a `422` naming the field instead of being dropped silently.
- `PATCH` accepts `application/json-patch+json` or `application/merge-patch+json`; OME resources are custom resources, which do not support strategic merge patch. With `application/json`, an array body is a JSON patch and an object body is a merge patch.

### Errors

Every error response has the same body:

```json
{
  "error": "Failed to create InferenceService",
  "code": "INVALID",
  "message": "InferenceService.ome.io \"llama\" is invalid: spec.engine: Required value",
  "details": [{ "field": "spec.engine", "reason": "FieldValueRequired", "message": "Required value" }]
}
```

| Status | Code | When |
|--------|------|------|
| 400 | `BAD_REQUEST` | Unparsable body, missing namespace, name, kind or namespace mismatch, or a namespace on a cluster-scoped kind |
| 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` | The console's Kubernetes identity may not perform the action |
| 404 | `NOT_FOUND` | The object does not exist |
| 404 | `CAPABILITY_MISSING` | The cluster does not serve that OME resource (see `GET /api/v1/capabilities`) |
| 409 | `CONFLICT` / `ALREADY_EXISTS` | Stale `resourceVersion` on update, or the name is taken |
| 422 | `INVALID` | CRD schema, CEL rule or OME webhook rejected the object; `details` lists the causes |
| 503 | `UNAVAILABLE` | The API server timed out or is unavailable |
| 500 | `INTERNAL` | Anything else |

### HuggingFace Integration
```
GET /api/v1/huggingface/models/search         # Search HuggingFace models
GET /api/v1/huggingface/models/:id/info       # Get model info
GET /api/v1/huggingface/models/:id/config     # Get model config
```

### Other
```
GET /api/v1/capabilities                 # OME resources and console features the cluster supports
GET /api/v1/namespaces                   # List namespaces
GET /api/v1/accelerators                 # List accelerators
GET /api/v1/events                       # SSE stream for real-time updates
POST /api/v1/validate/yaml               # Validate YAML
POST /api/v1/validate/model              # Validate model resource
POST /api/v1/validate/runtime            # Validate runtime resource
```

---

## Make Commands

### Development
| Command | Description |
|---------|-------------|
| `make dev` | Start both frontend and backend |
| `make dev-frontend` | Start frontend dev server (port 3000) |
| `make dev-backend` | Start backend dev server (port 8080) |

### Building
| Command | Description |
|---------|-------------|
| `make build` | Build both frontend and backend |
| `make build-frontend` | Build frontend for production |
| `make build-backend` | Build backend binary |

### Running
| Command | Description |
|---------|-------------|
| `make run-backend` | Run backend binary |
| `make start-frontend` | Run frontend production server |

### Dependencies
| Command | Description |
|---------|-------------|
| `make install` | Install all dependencies |
| `make install-frontend` | Install frontend dependencies (npm) |
| `make install-backend` | Download Go modules |

### Quality
| Command | Description |
|---------|-------------|
| `make lint` | Run all linters |
| `make lint-frontend` | Run ESLint |
| `make lint-backend` | Run go vet |
| `make format` | Format all code |
| `make format-check` | Check formatting |
| `make typecheck` | Run TypeScript type checking |
| `make test` | Run all tests |
| `make test-backend` | Run backend tests |
| `make test-frontend` | Run frontend tests |

### OME API snapshot
| Command | Description |
|---------|-------------|
| `make sync-ome-api OME_REF=<sha> [OME_SRC=<checkout>]` | Re-sync `api/ome/` from an OME commit |
| `make gen-types` | Regenerate the frontend's OME types from `api/ome/` |
| `make verify-ome-api` | Check the generated types are current (CI) |

### Utilities
| Command | Description |
|---------|-------------|
| `make status` | Check if services are running |
| `make clean` | Clean build artifacts |
| `make help` | Show all available commands |

---

## Troubleshooting

### Backend won't connect to Kubernetes cluster

```bash
# 1. Verify kubectl access
kubectl cluster-info
kubectl get nodes

# 2. Check kubeconfig path
echo $KUBECONFIG
cat ~/.kube/config | head -20

# 3. Verify OME CRDs are installed
kubectl get crd | grep ome.io
```

### Backend exits with "timed out ... waiting for the ... cache to sync"

The backend lists and watches every OME resource it knows about. Startup fails, instead of hanging, when a cache cannot fill within `INFORMER_SYNC_TIMEOUT`. The error names the resource; the usual causes are a missing list/watch permission or a CRD that was removed after startup. The API discovery that runs first is bounded too (30 seconds per request), so an unreachable API server also fails startup promptly.

```bash
# 1. Can the console's identity list and watch the resource?
kubectl auth can-i list inferenceservices.ome.io
kubectl auth can-i watch inferenceservices.ome.io

# 2. Slow or very large clusters: give the caches more time
INFORMER_SYNC_TIMEOUT=180s make dev-backend
```

### A feature is missing from the console

The console only enables features for OME resources the cluster serves. `GET /api/v1/capabilities` shows what was found at startup. Install the missing CRD (for example by upgrading OME) and restart the backend; discovery runs once at startup.

### Frontend can't reach backend

```bash
# 1. Verify backend is running
curl http://localhost:8080/health

# 2. Check for CORS issues (look at browser console)
# Backend allows localhost:3000 and localhost:3001 by default

# 3. Verify API URL in frontend
cat frontend/.env.local
```

- The live-update stream at `GET /api/v1/events` is a long-lived Server-Sent Events
  response. A proxy in front of it must not buffer responses (nginx: `proxy_buffering off`),
  and its idle timeout must exceed the stream's 30-second keep-alive ping (nginx:
  `proxy_read_timeout` is reset by each ping, so 60s or more is enough).

### Port already in use

```bash
# Find process using port
lsof -i :8080  # Backend
lsof -i :3000  # Frontend

# Kill process
kill -9 <PID>

# Or use a different port
PORT=9090 make run-backend
```

### TypeScript errors

```bash
# Run type checking
make typecheck

# Clear Next.js cache and rebuild
rm -rf frontend/.next
make build-frontend
```

### Go module issues

```bash
# Clear module cache
go clean -modcache

# Re-download dependencies
cd backend && go mod download
```

### Real-time updates not working

The backend uses Server-Sent Events (SSE) for real-time updates. Check:

```bash
# Test SSE endpoint
curl -N http://localhost:8080/api/v1/events

# Verify informers are running (check backend logs)
make dev-backend
```

---

## Contributing

### Code Style

- **Go**: Follow standard Go conventions, use `gofmt`
- **TypeScript**: Follow ESLint rules, use Prettier for formatting
- **Commits**: Use conventional commit messages

### Before Submitting

```bash
# Run all checks
make lint
make typecheck
make test
make format-check
```

### Project Structure Conventions

- UI components go in `frontend/src/components/ui/`
- Form components go in `frontend/src/components/forms/`
- API hooks go in `frontend/src/lib/hooks/`
- Backend handlers go in `backend/internal/handlers/`
- Add new API routes in `backend/internal/api/server.go`

---

## License

See the main OME repository for license information.

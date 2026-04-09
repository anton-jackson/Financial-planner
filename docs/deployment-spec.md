# Deployment Spec — Financial Planner

## Deployment Modes

### Mode 1: Local Dev (current)

**How it works today:**
- `make dev` → uvicorn on :8000, Vite on :5173
- Data lives in `backend/data/` as YAML/JSON flat files
- No auth — single user, localhost only

**Why keep it:**
- Enables Claude Code as a live advisor/sidecar against the running app
- Zero setup for development iteration
- Personal data never leaves the machine

**What's needed:** Nothing — already works.

---

### Mode 2: Local Docker

**Goal:** One-command portable setup, no Python/Node install required.

**Architecture:**
```
docker compose up
├── backend   (python:3.13-slim, uvicorn, port 8000)
├── frontend  (node:22-slim build → nginx, port 80)
└── volume: ./data → /app/data  (bind mount for persistence)
```

**Key decisions:**
- Single `docker-compose.yaml` at project root
- Multi-stage frontend build: npm build → copy dist to nginx
- Backend uses same `DATA_DIR` env var, pointed at `/app/data`
- Bind mount lets users edit YAML directly or through the UI
- No auth — still localhost, single user
- `.env` file for optional config overrides (port, CORS origins)

**What's needed:**
- `Dockerfile.backend`
- `Dockerfile.frontend`
- `docker-compose.yaml`
- `nginx.conf` (proxy `/api` → backend, serve static frontend)
- Update `config.py` to read `CORS_ORIGINS` for container networking

---

### Mode 3: Cloud — One Instance Per User

**Goal:** You manage <5 Cloud Run instances, one per friend. Each person gets a URL and signs in. They don't need to know anything about infrastructure.

**Model:** Server-per-user, not multi-tenant. Same Docker image deployed N times with per-instance config.

#### Compute

**GCP Cloud Run (recommended):**
- Same Docker image as Mode 2
- Scales to zero when idle — cost is near-zero for light usage
- Each instance gets its own Cloud Run service + persistent volume or GCS bucket
- Estimated cost: ~$1-3/mo per instance at low traffic

**Per-instance layout:**
```
Cloud Run service: finplanner-alice
  → image: gcr.io/your-project/finplanner:latest
  → env: ALLOWED_EMAIL=alice@gmail.com
  → storage: gs://finplanner-alice/ (or Cloud Run volume mount)

Cloud Run service: finplanner-bob
  → image: gcr.io/your-project/finplanner:latest
  → env: ALLOWED_EMAIL=bob@gmail.com
  → storage: gs://finplanner-bob/
```

#### Authentication

**Google OAuth 2.0 — single-owner gate:**
- User clicks "Sign in with Google" → Google consent screen → ID token
- Backend validates token, checks email matches `ALLOWED_EMAIL` env var
- If match → proceed. If not → 403.
- One Google OAuth client ID shared across all instances (redirect URIs differ)

**Backend auth middleware:**
```python
# backend/auth/middleware.py
async def require_owner(request: Request) -> str:
    """FastAPI dependency — validates this is the instance owner."""
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    claims = verify_google_id_token(token)
    if claims["email"] != settings.ALLOWED_EMAIL:
        raise HTTPException(403, "Not the owner of this instance")
    return claims["email"]
```

When `AUTH_ENABLED=false` (Modes 1 & 2), the dependency is a no-op passthrough.

#### Storage

**Same `LocalFileStorage` — no changes needed.** Each Cloud Run instance has its own volume. The existing storage abstraction works as-is.

For durability beyond container restarts:
- **Option A: GCS-FUSE volume mount** — Cloud Run mounts a GCS bucket as a local filesystem. Backend code doesn't change at all. Recommended.
- **Option B: GCS storage backend** — new `GCSStorage` class implementing `StorageBackend` protocol. More work, only needed if FUSE performance is an issue.

#### Frontend Changes

- Add Google Sign-In button (`@react-oauth/google` package)
- Store ID token in memory (cleared on tab close)
- API client adds `Authorization: Bearer <token>` header to all requests
- Handle token refresh (Google ID tokens expire in 1 hour)
- When `AUTH_ENABLED=false`, skip login screen entirely

#### Per-User Data Isolation

**Deferred.** Current model: you (the infra operator) have access to each instance's data via GCP IAM. This is acceptable for now — these are friends who trust you. Options to revisit later:

- Per-user GCP projects (user owns their own infra)
- Client-side encryption (browser encrypts before upload)
- Confidential computing (TEE — even you can't read memory)

#### Environment Config

```bash
# Mode 1 (Local dev)
AUTH_ENABLED=false
STORAGE_BACKEND=local
DATA_DIR=backend/data

# Mode 2 (Docker local)
AUTH_ENABLED=false
STORAGE_BACKEND=local
DATA_DIR=/app/data

# Mode 3 (Cloud — per instance)
AUTH_ENABLED=true
ALLOWED_EMAIL=alice@gmail.com
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
STORAGE_BACKEND=local
DATA_DIR=/app/data
CORS_ORIGINS=https://finplanner-alice-xxxx-uc.a.run.app
```

---

## Implementation Order

| Phase | Work | Enables |
|-------|------|---------|
| **P1** | Dockerfiles + compose | Mode 2 — run locally in containers |
| **P2** | Google OAuth + owner gate | Login flow, single-owner auth |
| **P3** | Deploy script (Cloud Run + GCS-FUSE) | Spin up an instance per user |

P1 is the foundation — same image used for local Docker and Cloud Run. P2 adds the auth gate. P3 is a deploy script you run once per friend.

---

## Open Questions

1. **Domain?** Cloud Run auto-generates URLs (`finplanner-alice-xxxx-uc.a.run.app`). Custom domain optional — needs DNS + SSL cert.
2. **Firebase Auth vs. raw Google OAuth?** Firebase handles token refresh and multi-provider out of the box. Raw Google is simpler for single-provider. Recommendation: start raw, switch to Firebase if we add providers.
3. **GCS-FUSE vs. native GCS backend?** FUSE is zero code change but has latency on first read. For YAML flat files this is negligible. Start with FUSE.

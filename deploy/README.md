# Cloud Deployment

Deploy Financial Planner to Google Cloud Run. Each instance is a standalone service with its own data bucket and auth — one per user.

## Prerequisites

1. **GCP account** with billing enabled
2. **gcloud CLI** installed and authenticated:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```
3. **Google OAuth client ID** — needed for sign-in:
   - Go to [Google Cloud Console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
   - Create an OAuth 2.0 Client ID (Web application type)
   - You'll add authorized JavaScript origins after deploying (the script tells you what to add)

## Quick Start (no repo clone needed)

You don't need to clone the repo. Cloud Build pulls the source directly from GitHub.

```bash
# 1. Download the deploy script and config template
curl -O https://raw.githubusercontent.com/anton-jackson/Financial-planner/main/deploy/remote-deploy.sh
curl -O https://raw.githubusercontent.com/anton-jackson/Financial-planner/main/deploy/config.example.env

# 2. Create your config
cp config.example.env myname.env

# 3. Fill in your values
#    - GCP_PROJECT: your GCP project ID (run: gcloud projects list)
#    - INSTANCE_NAME: short name like "me" or "alice"
#    - GOOGLE_CLIENT_ID: from step 3 of Prerequisites
#    - ALLOWED_EMAIL: the Google account email for this instance
vim myname.env

# 4. Deploy
bash remote-deploy.sh myname.env

# 5. Follow the post-deploy instructions printed by the script
```

## Deploy from Local Clone

If you've cloned the repo (e.g., for development), use the local deploy script instead:

```bash
cp deploy/config.example.env deploy/myname.env
vim deploy/myname.env
./deploy/deploy.sh deploy/myname.env
```

## What the Script Does

1. **Enables GCP APIs** — Cloud Run, Artifact Registry, Cloud Storage
2. **Creates Artifact Registry repo** — stores the container image
3. **Builds the image** — uses Cloud Build (no local Docker needed)
4. **Creates a GCS bucket** — `{project}-finplanner-{name}` for persistent data
5. **Seeds example scenarios** — copies base/bear/bull YAML into the bucket
6. **Deploys Cloud Run service** — with GCS-FUSE volume mount for data persistence
7. **Maps custom domain** — if `CUSTOM_DOMAIN` is set

## Architecture

```
Internet
  │
  ▼
Cloud Run: finplanner-alice (scales to zero when idle)
  ├── Port 8080: FastAPI serves both API and static frontend
  ├── /api/v1/* → API endpoints
  ├── /* → React SPA (index.html fallback)
  ├── Auth: Google OAuth, single email gate
  └── Volume: GCS-FUSE mount at /app/data
        └── gs://project-finplanner-alice/
              ├── profile.yaml
              ├── assets.yaml
              ├── scenarios/*.yaml
              └── results/*.json
```

Single container — the combined Dockerfile builds the React frontend and bundles it into the Python backend. FastAPI serves static files when `STATIC_DIR` is set.

## Deploying for Multiple Users

Create a config file per person:

```bash
cp deploy/config.example.env deploy/alice.env
cp deploy/config.example.env deploy/bob.env
# Edit each with their email

./deploy/deploy.sh deploy/alice.env
./deploy/deploy.sh deploy/bob.env
```

All instances share the same container image (only built once). Each gets its own Cloud Run service and GCS bucket.

## Custom Domain

If you set `CUSTOM_DOMAIN` in your config (e.g., `alice.finance.example.com`):

1. The script creates a Cloud Run domain mapping
2. You need to create a CNAME record in your DNS provider:
   ```
   alice.finance.example.com  CNAME  ghs.googlehosted.com.
   ```
3. In AWS Route 53: add a CNAME record in your hosted zone
4. SSL is automatic via Google-managed certificates

## Updating

To deploy a new version:

```bash
# Rebuild and redeploy
./deploy/deploy.sh deploy/myname.env

# Redeploy without rebuilding (e.g., just changing env vars)
./deploy/deploy.sh deploy/myname.env --skip-build
```

## Tearing Down

```bash
# Remove service + data
./deploy/teardown.sh deploy/alice.env

# Remove service but keep the data bucket
./deploy/teardown.sh deploy/alice.env --keep-data
```

## Cost

- **Cloud Run:** scales to zero — you only pay when someone is using it
- **GCS:** pennies/month for YAML files
- **Estimated:** ~$1-3/month per instance at light usage

## Troubleshooting

**"Permission denied" on deploy:**
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

**OAuth redirect error after deploy:**
Add the Cloud Run URL to your OAuth client's "Authorized JavaScript origins" in Google Cloud Console.

**Data not persisting across deploys:**
Check that the GCS bucket exists and the volume mount is working:
```bash
gcloud storage ls gs://YOUR_BUCKET_NAME/
```

**Find your GCP project ID:**
```bash
gcloud projects list
```

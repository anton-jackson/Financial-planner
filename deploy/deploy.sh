#!/usr/bin/env bash
#
# Deploy a Financial Planner instance to Google Cloud Run.
#
# Usage:
#   ./deploy/deploy.sh deploy/alice.env        # deploy with config file
#   ./deploy/deploy.sh deploy/alice.env --skip-build  # redeploy without rebuilding image
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - Docker installed (for building the image)
#   - A GCP project with billing enabled
#   - A Google OAuth client ID (for authentication)
#
set -euo pipefail

# ─── Parse args ──────────────────────────────────────────────────────

CONFIG_FILE="${1:-}"
SKIP_BUILD=false

if [[ -z "$CONFIG_FILE" ]]; then
  echo "Usage: $0 <config.env> [--skip-build]"
  echo ""
  echo "  Create a config file from the template:"
  echo "    cp deploy/config.example.env deploy/myname.env"
  echo "    # Edit deploy/myname.env with your values"
  echo "    $0 deploy/myname.env"
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: Config file not found: $CONFIG_FILE"
  exit 1
fi

for arg in "$@"; do
  [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true
done

# ─── Load config ─────────────────────────────────────────────────────

set -a
source "$CONFIG_FILE"
set +a

# Validate required fields
MISSING=()
[[ -z "${GCP_PROJECT:-}" ]] && MISSING+=("GCP_PROJECT")
[[ -z "${INSTANCE_NAME:-}" ]] && MISSING+=("INSTANCE_NAME")
[[ -z "${GOOGLE_CLIENT_ID:-}" ]] && MISSING+=("GOOGLE_CLIENT_ID")
[[ -z "${ALLOWED_EMAIL:-}" ]] && MISSING+=("ALLOWED_EMAIL")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Error: Missing required config values: ${MISSING[*]}"
  echo "Edit $CONFIG_FILE and fill in the missing fields."
  exit 1
fi

GCP_REGION="${GCP_REGION:-us-central1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Derived names
SERVICE_NAME="finplanner-${INSTANCE_NAME}"
BUCKET_NAME="${GCP_PROJECT}-finplanner-${INSTANCE_NAME}"
REPO_NAME="finplanner"
IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPO_NAME}/app:${IMAGE_TAG}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying: ${SERVICE_NAME}"
echo "  Project:   ${GCP_PROJECT}"
echo "  Region:    ${GCP_REGION}"
echo "  Email:     ${ALLOWED_EMAIL}"
echo "  Image:     ${IMAGE_URI}"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && echo "  Domain:    ${CUSTOM_DOMAIN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─── Set project ─────────────────────────────────────────────────────

gcloud config set project "$GCP_PROJECT" --quiet

# ─── Enable APIs (idempotent) ────────────────────────────────────────

echo "→ Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  --quiet

# ─── Artifact Registry repo (idempotent) ─────────────────────────────

if ! gcloud artifacts repositories describe "$REPO_NAME" \
    --location="$GCP_REGION" --quiet 2>/dev/null; then
  echo "→ Creating Artifact Registry repository..."
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$GCP_REGION" \
    --quiet
fi

# ─── Build & push image ─────────────────────────────────────────────

if [[ "$SKIP_BUILD" == "false" ]]; then
  echo "→ Building container image..."

  # Use Cloud Build (no local Docker needed, builds in the cloud)
  gcloud builds submit \
    --tag "$IMAGE_URI" \
    --timeout=600 \
    --quiet \
    .
else
  echo "→ Skipping build (--skip-build)"
fi

# ─── GCS bucket for data persistence ────────────────────────────────

if ! gcloud storage buckets describe "gs://${BUCKET_NAME}" --quiet 2>/dev/null; then
  echo "→ Creating storage bucket: ${BUCKET_NAME}"
  gcloud storage buckets create "gs://${BUCKET_NAME}" \
    --location="$GCP_REGION" \
    --uniform-bucket-level-access \
    --quiet

  # Copy example scenarios into the bucket
  echo "→ Seeding example scenarios..."
  gcloud storage cp backend/data/scenarios/*.yaml "gs://${BUCKET_NAME}/scenarios/" --quiet 2>/dev/null || true
fi

# ─── Deploy Cloud Run service ───────────────────────────────────────

echo "→ Deploying Cloud Run service: ${SERVICE_NAME}"

# Build env vars
ENV_VARS="AUTH_ENABLED=true"
ENV_VARS+=",ALLOWED_EMAIL=${ALLOWED_EMAIL}"
ENV_VARS+=",GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
ENV_VARS+=",DATA_DIR=/app/data"
ENV_VARS+=",STORAGE_BACKEND=local"

# CORS origins: Cloud Run URL + custom domain if set
CLOUD_RUN_URL="https://${SERVICE_NAME}-$(gcloud run services describe ${SERVICE_NAME} --region=${GCP_REGION} --format='value(status.url)' 2>/dev/null | sed 's|https://[^-]*-||' || echo 'pending')"
CORS="https://${SERVICE_NAME}*.run.app"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && CORS+=",https://${CUSTOM_DOMAIN}"
ENV_VARS+=",CORS_ORIGINS=${CORS}"

[[ -n "${ANTHROPIC_API_KEY:-}" ]] && ENV_VARS+=",ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"

gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$GCP_REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 300 \
  --set-env-vars "$ENV_VARS" \
  --execution-environment gen2 \
  --add-volume=name=data,type=cloud-storage,bucket="${BUCKET_NAME}" \
  --add-volume-mount=volume=data,mount-path=/app/data \
  --quiet

# Get the deployed URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$GCP_REGION" \
  --format="value(status.url)")

# Update CORS with actual URL now that we know it
ENV_VARS_FINAL="AUTH_ENABLED=true"
ENV_VARS_FINAL+=",ALLOWED_EMAIL=${ALLOWED_EMAIL}"
ENV_VARS_FINAL+=",GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
ENV_VARS_FINAL+=",DATA_DIR=/app/data"
ENV_VARS_FINAL+=",STORAGE_BACKEND=local"
ENV_VARS_FINAL+=",CORS_ORIGINS=${SERVICE_URL}"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && ENV_VARS_FINAL+=",CORS_ORIGINS=${SERVICE_URL},https://${CUSTOM_DOMAIN}"
[[ -n "${ANTHROPIC_API_KEY:-}" ]] && ENV_VARS_FINAL+=",ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"

gcloud run services update "$SERVICE_NAME" \
  --region="$GCP_REGION" \
  --set-env-vars "$ENV_VARS_FINAL" \
  --quiet

# ─── Custom domain mapping ──────────────────────────────────────────

if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
  echo "→ Mapping custom domain: ${CUSTOM_DOMAIN}"
  if ! gcloud run domain-mappings describe \
      --domain="$CUSTOM_DOMAIN" --region="$GCP_REGION" --quiet 2>/dev/null; then
    gcloud run domain-mappings create \
      --service="$SERVICE_NAME" \
      --domain="$CUSTOM_DOMAIN" \
      --region="$GCP_REGION" \
      --quiet || echo "  ⚠ Domain mapping failed — you may need to verify domain ownership first."
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  DNS: Create a CNAME record in your DNS provider:"
  echo ""
  echo "    ${CUSTOM_DOMAIN}  CNAME  ghs.googlehosted.com."
  echo ""
  echo "  (In AWS Route 53: add a CNAME record in your hosted zone)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

# ─── OAuth redirect URI reminder ────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Deployed: ${SERVICE_URL}"
echo ""
echo "  Next steps:"
echo "  1. Add this URL as an authorized JavaScript origin"
echo "     in your Google OAuth client configuration:"
echo "     → ${SERVICE_URL}"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && echo "     → https://${CUSTOM_DOMAIN}"
echo ""
echo "  2. Google Cloud Console → APIs & Services → Credentials"
echo "     → Edit your OAuth 2.0 Client ID"
echo "     → Add to 'Authorized JavaScript origins'"
echo ""
[[ -n "${CUSTOM_DOMAIN:-}" ]] && echo "  3. Create the DNS CNAME record shown above"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

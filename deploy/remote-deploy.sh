#!/usr/bin/env bash
#
# Deploy Financial Planner to Cloud Run directly from GitHub.
# No repo clone needed — Cloud Build pulls the source.
#
# Quick start:
#   curl -O https://raw.githubusercontent.com/anton-jackson/Financial-planner/main/deploy/remote-deploy.sh
#   curl -O https://raw.githubusercontent.com/anton-jackson/Financial-planner/main/deploy/config.example.env
#   cp config.example.env myname.env && vim myname.env
#   bash remote-deploy.sh myname.env
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - A GCP project with billing enabled
#   - A Google OAuth client ID
#
set -euo pipefail

REPO_URL="https://github.com/anton-jackson/Financial-planner.git"
REPO_BRANCH="main"

# ─── Parse args ──────────────────────────────────────────────────────

CONFIG_FILE="${1:-}"
SKIP_BUILD=false

for arg in "$@"; do
  [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true
  [[ "$arg" == --branch=* ]] && REPO_BRANCH="${arg#--branch=}"
done

if [[ -z "$CONFIG_FILE" ]]; then
  cat <<'USAGE'
Deploy Financial Planner to Google Cloud Run (no repo clone needed).

Usage:
  bash remote-deploy.sh <config.env> [options]

Options:
  --skip-build       Redeploy without rebuilding the image
  --branch=NAME      Deploy from a specific branch (default: main)

Setup:
  1. Download the config template:
     curl -O https://raw.githubusercontent.com/anton-jackson/Financial-planner/main/deploy/config.example.env

  2. Create your config:
     cp config.example.env myname.env

  3. Edit myname.env with your values:
     - GCP_PROJECT     (run: gcloud projects list)
     - INSTANCE_NAME   (short name, e.g. "me")
     - GOOGLE_CLIENT_ID
     - ALLOWED_EMAIL

  4. Deploy:
     bash remote-deploy.sh myname.env
USAGE
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: Config file not found: $CONFIG_FILE"
  exit 1
fi

# ─── Load config ─────────────────────────────────────────────────────

set -a
source "$CONFIG_FILE"
set +a

MISSING=()
[[ -z "${GCP_PROJECT:-}" ]] && MISSING+=("GCP_PROJECT")
[[ -z "${INSTANCE_NAME:-}" ]] && MISSING+=("INSTANCE_NAME")
[[ -z "${GOOGLE_CLIENT_ID:-}" ]] && MISSING+=("GOOGLE_CLIENT_ID")
[[ -z "${ALLOWED_EMAIL:-}" ]] && MISSING+=("ALLOWED_EMAIL")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Error: Missing required config: ${MISSING[*]}"
  echo "Edit $CONFIG_FILE and fill in the missing fields."
  exit 1
fi

GCP_REGION="${GCP_REGION:-us-central1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

SERVICE_NAME="finplanner-${INSTANCE_NAME}"
BUCKET_NAME="${GCP_PROJECT}-finplanner-${INSTANCE_NAME}"
REPO_NAME="finplanner"
IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPO_NAME}/app:${IMAGE_TAG}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying: ${SERVICE_NAME}"
echo "  Source:    ${REPO_URL} (${REPO_BRANCH})"
echo "  Project:   ${GCP_PROJECT}"
echo "  Region:    ${GCP_REGION}"
echo "  Email:     ${ALLOWED_EMAIL}"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && echo "  Domain:    ${CUSTOM_DOMAIN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─── Preflight checks ───────────────────────────────────────────────

if ! command -v gcloud &>/dev/null; then
  echo "Error: gcloud CLI not found. Install it from https://cloud.google.com/sdk/docs/install"
  exit 1
fi

ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
if [[ -z "$ACCOUNT" ]]; then
  echo "Error: Not authenticated. Run: gcloud auth login"
  exit 1
fi
echo "→ Authenticated as: ${ACCOUNT}"

gcloud config set project "$GCP_PROJECT" --quiet

# ─── Enable APIs ─────────────────────────────────────────────────────

echo "→ Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  cloudbuild.googleapis.com \
  --quiet

# ─── Artifact Registry ──────────────────────────────────────────────

if ! gcloud artifacts repositories describe "$REPO_NAME" \
    --location="$GCP_REGION" --quiet 2>/dev/null; then
  echo "→ Creating Artifact Registry repository..."
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$GCP_REGION" \
    --quiet
fi

# ─── Build from GitHub ──────────────────────────────────────────────

if [[ "$SKIP_BUILD" == "false" ]]; then
  echo "→ Building image from GitHub (${REPO_BRANCH})..."
  echo "  This takes 3-5 minutes on first build."

  gcloud builds submit \
    --git-source-url="$REPO_URL" \
    --git-source-revision="$REPO_BRANCH" \
    --tag "$IMAGE_URI" \
    --timeout=600 \
    --quiet
else
  echo "→ Skipping build (--skip-build)"
fi

# ─── GCS bucket ─────────────────────────────────────────────────────

if ! gcloud storage buckets describe "gs://${BUCKET_NAME}" --quiet 2>/dev/null; then
  echo "→ Creating storage bucket: ${BUCKET_NAME}"
  gcloud storage buckets create "gs://${BUCKET_NAME}" \
    --location="$GCP_REGION" \
    --uniform-bucket-level-access \
    --quiet
fi

# ─── Deploy Cloud Run ───────────────────────────────────────────────

echo "→ Deploying Cloud Run service: ${SERVICE_NAME}"

ENV_VARS="AUTH_ENABLED=true"
ENV_VARS+=",ALLOWED_EMAIL=${ALLOWED_EMAIL}"
ENV_VARS+=",GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
ENV_VARS+=",DATA_DIR=/app/data"
ENV_VARS+=",STORAGE_BACKEND=local"

# Initial CORS (will be updated after we know the URL)
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

# Get actual URL and update CORS
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$GCP_REGION" \
  --format="value(status.url)")

CORS_FINAL="${SERVICE_URL}"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && CORS_FINAL+=",https://${CUSTOM_DOMAIN}"

gcloud run services update "$SERVICE_NAME" \
  --region="$GCP_REGION" \
  --update-env-vars "CORS_ORIGINS=${CORS_FINAL}" \
  --quiet

# ─── Custom domain ──────────────────────────────────────────────────

if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
  echo "→ Mapping custom domain: ${CUSTOM_DOMAIN}"
  gcloud run domain-mappings create \
    --service="$SERVICE_NAME" \
    --domain="$CUSTOM_DOMAIN" \
    --region="$GCP_REGION" \
    --quiet 2>/dev/null || true
fi

# ─── Done ────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Deployed: ${SERVICE_URL}"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Add authorized JavaScript origins to your Google OAuth client:"
echo "     → ${SERVICE_URL}"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && echo "     → https://${CUSTOM_DOMAIN}"
echo ""
echo "     Go to: https://console.cloud.google.com/apis/credentials"
echo "     Edit your OAuth 2.0 Client ID → Authorized JavaScript origins"
echo ""
if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
  echo "  2. Create a DNS CNAME record:"
  echo "     ${CUSTOM_DOMAIN}  →  ghs.googlehosted.com."
  echo ""
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

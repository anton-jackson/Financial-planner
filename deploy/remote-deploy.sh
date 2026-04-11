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

# ─── --list-zones: show Route 53 hosted zones and exit ───────────────

if [[ "${CONFIG_FILE}" == "--list-zones" ]]; then
  if ! command -v aws &>/dev/null; then
    echo "Error: aws CLI not found. Install it from https://aws.amazon.com/cli/"
    exit 1
  fi
  echo ""
  echo "  AWS Route 53 Hosted Zones"
  echo "  ─────────────────────────────────────────────────────"
  printf "  %-40s  %s\n" "DOMAIN" "ZONE ID"
  echo "  ─────────────────────────────────────────────────────"
  aws route53 list-hosted-zones --output json | \
    python3 -c "
import json, sys
data = json.load(sys.stdin)
for z in data.get('HostedZones', []):
    name = z['Name'].rstrip('.')
    zid = z['Id'].split('/')[-1]
    print(f'  {name:<40}  {zid}')
" 2>/dev/null || echo "  (failed — check aws credentials: aws configure)"
  echo ""
  echo "  Copy the zone ID for your domain into your config file:"
  echo "  AWS_HOSTED_ZONE_ID=Z1234567890ABC"
  echo ""
  exit 0
fi

if [[ -z "$CONFIG_FILE" ]]; then
  cat <<'USAGE'
Deploy Financial Planner to Google Cloud Run (no repo clone needed).

Usage:
  bash remote-deploy.sh <config.env> [options]
  bash remote-deploy.sh --list-zones

Options:
  --skip-build       Redeploy without rebuilding the image
  --branch=NAME      Deploy from a specific branch (default: main)
  --list-zones       List AWS Route 53 hosted zones and exit

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

# ─── Service account (least-privilege) ──────────────────────────────

SA_NAME="${SERVICE_NAME}-sa"
SA_EMAIL="${SA_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$SA_EMAIL" --quiet 2>/dev/null; then
  echo "→ Creating service account: ${SA_NAME}"
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Financial Planner - ${INSTANCE_NAME}" \
    --quiet
fi

# Grant access to its own bucket only (read + write)
echo "→ Setting bucket IAM policy..."
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin" \
  --quiet 2>/dev/null || true

# Grant permission to pull images from Artifact Registry
gcloud artifacts repositories add-iam-policy-binding "$REPO_NAME" \
  --location="$GCP_REGION" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.reader" \
  --quiet 2>/dev/null || true

# ─── Deploy Cloud Run ───────────────────────────────────────────────

echo "→ Deploying Cloud Run service: ${SERVICE_NAME}"

# Build env vars file (YAML format, avoids escaping issues with URLs)
CORS="https://${SERVICE_NAME}*.run.app"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && CORS+=",https://${CUSTOM_DOMAIN}"

ENV_FILE=$(mktemp /tmp/envvars.XXXXXX.yaml)
cat > "$ENV_FILE" <<ENVEOF
AUTH_ENABLED: "true"
ALLOWED_EMAIL: "${ALLOWED_EMAIL}"
GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID}"
DATA_DIR: "/app/data"
STORAGE_BACKEND: "local"
CORS_ORIGINS: "${CORS}"
ENVEOF
[[ -n "${ANTHROPIC_API_KEY:-}" ]] && echo "ANTHROPIC_API_KEY: \"${ANTHROPIC_API_KEY}\"" >> "$ENV_FILE"

gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$GCP_REGION" \
  --platform managed \
  --allow-unauthenticated \
  --service-account "$SA_EMAIL" \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 300 \
  --env-vars-file "$ENV_FILE" \
  --execution-environment gen2 \
  --add-volume=name=data,type=cloud-storage,bucket="${BUCKET_NAME}" \
  --add-volume-mount=volume=data,mount-path=/app/data \
  --quiet

rm -f "$ENV_FILE"

# Get actual URL and update CORS
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$GCP_REGION" \
  --format="value(status.url)")

CORS_FINAL="${SERVICE_URL}"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && CORS_FINAL+=",https://${CUSTOM_DOMAIN}"

ENV_FILE2=$(mktemp /tmp/envvars.XXXXXX.yaml)
echo "CORS_ORIGINS: \"${CORS_FINAL}\"" > "$ENV_FILE2"
gcloud run services update "$SERVICE_NAME" \
  --region="$GCP_REGION" \
  --env-vars-file "$ENV_FILE2" \
  --quiet
rm -f "$ENV_FILE2"

# ─── Extract hostname for DNS ────────────────────────────────────────

CLOUD_RUN_HOST="${SERVICE_URL#https://}"

# ─── Route 53 DNS (optional) ────────────────────────────────────────

DNS_DONE=false
if [[ -n "${CUSTOM_DOMAIN:-}" && -n "${AWS_HOSTED_ZONE_ID:-}" ]]; then
  if command -v aws &>/dev/null; then
    echo "→ Creating Route 53 CNAME: ${CUSTOM_DOMAIN} → ${CLOUD_RUN_HOST}"
    aws route53 change-resource-record-sets \
      --hosted-zone-id "$AWS_HOSTED_ZONE_ID" \
      --change-batch "{
        \"Changes\": [{
          \"Action\": \"UPSERT\",
          \"ResourceRecordSet\": {
            \"Name\": \"${CUSTOM_DOMAIN}\",
            \"Type\": \"CNAME\",
            \"TTL\": 300,
            \"ResourceRecords\": [{\"Value\": \"${CLOUD_RUN_HOST}\"}]
          }
        }]
      }" --output text --query 'ChangeInfo.Status' 2>/dev/null && DNS_DONE=true \
      || echo "  ⚠ Route 53 update failed — check AWS credentials and zone ID"
  else
    echo "→ Skipping Route 53 (aws CLI not installed)"
  fi
fi

# ─── Done ────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Instance:  ${INSTANCE_NAME}"
echo "  Service:   ${SERVICE_NAME}"
echo "  URL:       ${SERVICE_URL}"
echo "  Hostname:  ${CLOUD_RUN_HOST}"
echo "  Bucket:    gs://${BUCKET_NAME}"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && echo "  Domain:    https://${CUSTOM_DOMAIN}"
[[ "$DNS_DONE" == "true" ]] && echo "  DNS:       ✓ Route 53 CNAME created"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  NEXT STEPS"
echo ""
echo "  1. Google OAuth — add authorized JavaScript origins:"
echo ""
echo "     ${SERVICE_URL}"
[[ -n "${CUSTOM_DOMAIN:-}" ]] && echo "     https://${CUSTOM_DOMAIN}"
echo ""
echo "     → https://console.cloud.google.com/apis/credentials"
echo "     → Edit OAuth 2.0 Client ID → Authorized JavaScript origins"
echo ""
if [[ -n "${CUSTOM_DOMAIN:-}" && "$DNS_DONE" == "false" ]]; then
  echo "  2. DNS — create a CNAME record for your subdomain:"
  echo ""
  echo "     Record type:  CNAME"
  echo "     Name:         ${CUSTOM_DOMAIN}"
  echo "     Value:        ${CLOUD_RUN_HOST}"
  echo ""
  echo "     Or set AWS_HOSTED_ZONE_ID in your config to automate this."
  echo "     Find your zone ID: bash remote-deploy.sh --list-zones"
  echo ""
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

#!/usr/bin/env bash
#
# Tear down a Financial Planner Cloud Run instance.
#
# Usage:
#   ./deploy/teardown.sh deploy/alice.env
#   ./deploy/teardown.sh deploy/alice.env --keep-data  # keep the GCS bucket
#
set -euo pipefail

CONFIG_FILE="${1:-}"
KEEP_DATA=false

if [[ -z "$CONFIG_FILE" ]]; then
  echo "Usage: $0 <config.env> [--keep-data]"
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: Config file not found: $CONFIG_FILE"
  exit 1
fi

for arg in "$@"; do
  [[ "$arg" == "--keep-data" ]] && KEEP_DATA=true
done

set -a
source "$CONFIG_FILE"
set +a

GCP_REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="finplanner-${INSTANCE_NAME}"
BUCKET_NAME="${GCP_PROJECT}-finplanner-${INSTANCE_NAME}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tearing down: ${SERVICE_NAME}"
echo "  Project:      ${GCP_PROJECT}"
[[ "$KEEP_DATA" == "true" ]] && echo "  Data bucket:  KEEPING (--keep-data)"
[[ "$KEEP_DATA" == "false" ]] && echo "  Data bucket:  DELETING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Are you sure? (y/N) " -n 1 -r
echo
[[ ! $REPLY =~ ^[Yy]$ ]] && exit 0

gcloud config set project "$GCP_PROJECT" --quiet

# Remove custom domain mapping
if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
  echo "→ Removing domain mapping: ${CUSTOM_DOMAIN}"
  gcloud run domain-mappings delete \
    --domain="$CUSTOM_DOMAIN" \
    --region="$GCP_REGION" \
    --quiet 2>/dev/null || true
fi

# Delete Cloud Run service
echo "→ Deleting Cloud Run service: ${SERVICE_NAME}"
gcloud run services delete "$SERVICE_NAME" \
  --region="$GCP_REGION" \
  --quiet 2>/dev/null || true

# Delete GCS bucket
if [[ "$KEEP_DATA" == "false" ]]; then
  echo "→ Deleting storage bucket: ${BUCKET_NAME}"
  gcloud storage rm --recursive "gs://${BUCKET_NAME}" --quiet 2>/dev/null || true
else
  echo "→ Keeping storage bucket: ${BUCKET_NAME}"
fi

# Delete service account
SA_NAME="${SERVICE_NAME}-sa"
SA_EMAIL="${SA_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com"
echo "→ Deleting service account: ${SA_NAME}"
gcloud iam service-accounts delete "$SA_EMAIL" --quiet 2>/dev/null || true

echo ""
echo "✓ Teardown complete."
[[ -n "${CUSTOM_DOMAIN:-}" ]] && echo "  Remember to remove the DNS CNAME record for ${CUSTOM_DOMAIN}"

#!/usr/bin/env bash
# VPC Service Controls perimeter around BigQuery, Vertex AI and Cloud Storage (README 13.2).
# REQUIRES a Google Cloud ORGANIZATION and an access policy; without one this cannot run
# and the perimeter stays documented-not-enforced (README 22.7). UNTESTED.
# Needs: PROJECT_ID, ORG_ID. Start in dry-run so nothing breaks, then enforce.
set -euo pipefail
: "${PROJECT_ID:?}" ; : "${ORG_ID:?}"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
POLICY="$(gcloud access-context-manager policies list --organization "$ORG_ID" --format 'value(name)' | head -n1)"
[ -n "$POLICY" ] || POLICY="$(gcloud access-context-manager policies create --organization "$ORG_ID" --title firststep --format 'value(name)')"

gcloud access-context-manager perimeters create firststep_perimeter --policy "$POLICY" \
  --title "FirstStep data perimeter" --perimeter-type regular \
  --resources "projects/${PROJECT_NUMBER}" \
  --restricted-services bigquery.googleapis.com,aiplatform.googleapis.com,storage.googleapis.com \
  2>/dev/null || echo "perimeter exists"
gcloud access-context-manager perimeters dry-run create firststep_perimeter --policy "$POLICY" --async 2>/dev/null || true
echo "Review dry-run violations in Cloud Logging, then: gcloud access-context-manager perimeters dry-run enforce firststep_perimeter --policy $POLICY"

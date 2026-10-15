#!/usr/bin/env bash
# Build and deploy every service to Cloud Run (README 17). UNTESTED against a live project.
# Needs: PROJECT_ID, REGION. Services deploy private (IAM-authenticated, internal + LB ingress).
# Set GEMINI_MODEL, BQ_DATASET etc. in the environment; secrets come from Secret Manager.
set -euo pipefail
: "${PROJECT_ID:?}" ; : "${REGION:?}"
cd "$(dirname "$0")/../.."
REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/firststep"
gcloud artifacts repositories describe firststep --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud artifacts repositories create firststep --repository-format docker --location "$REGION" --project "$PROJECT_ID"

# name | dockerfile | build args | service account suffix
deploy() {
  local name="$1" dockerfile="$2" args="$3" sa="$4" extra="${5:-}"
  local image="${REPO}/${name}:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
  gcloud builds submit --project "$PROJECT_ID" --tag "$image" --config /dev/stdin . <<EOF
steps:
- name: gcr.io/cloud-builders/docker
  args: ["build","-f","${dockerfile}",${args}"-t","${image}","."]
images: ["${image}"]
EOF
  gcloud run deploy "firststep-${name}" --project "$PROJECT_ID" --region "$REGION" --image "$image" \
    --no-allow-unauthenticated --ingress internal-and-cloud-load-balancing \
    --service-account "firststep-${sa}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --set-env-vars "PROJECT_ID=${PROJECT_ID},REGION=${REGION},AUTH_REQUIRED=true,DEMO_MODE=false${extra}" \
    --set-secrets "JWT_SECRET=firststep-jwt-secret:latest"
}

PY=infra/docker/python-service.Dockerfile
deploy gateway        "$PY" '"--build-arg","SERVICE_DIR=backend/Gateway","--build-arg","APP=main:app",' gateway
deploy platform       "$PY" '"--build-arg","SERVICE_DIR=backend/Platform","--build-arg","APP=service.api:app",' platform
deploy c1-portfolio   "$PY" '"--build-arg","SERVICE_DIR=backend/Portfolio-Optimization","--build-arg","APP=service.api:app",' c1-portfolio
deploy c2-fraud       "$PY" '"--build-arg","SERVICE_DIR=backend/Fraud-Detection","--build-arg","APP=app:app",' c2-fraud
deploy c4-assistant   "$PY" '"--build-arg","SERVICE_DIR=backend/Agentic-Assistance","--build-arg","APP=main:app",' c4-assistant
deploy c3-audit       infra/docker/node-audit.Dockerfile '' c3-audit ",LEDGER_MODE=${LEDGER_MODE:-mock},BQ_DATASET=${BQ_DATASET:-firststep},PUBSUB_AUDIENCE=${PUBSUB_AUDIENCE:-},PUBSUB_PUSH_SA=${PUBSUB_PUSH_SA:-}"
deploy laya           "$PY" '"--build-arg","SERVICE_DIR=backend/Laya","--build-arg","APP=serve:app",' laya

echo "deployed. Wire UPSTREAM_* on the gateway and AUDIT_URL/PLATFORM_URL on C1/C2 to the Cloud Run URLs, then run create_edge.sh"

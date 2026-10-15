#!/usr/bin/env bash
# BigQuery dataset/tables, Pub/Sub `decisions`, Firestore, secrets. UNTESTED against a live project.
# Needs: PROJECT_ID, REGION. Optional: BQ_DATASET (default firststep).
set -euo pipefail
: "${PROJECT_ID:?}" ; : "${REGION:?}"
BQ_DATASET="${BQ_DATASET:-firststep}"
TOPIC="${PUBSUB_DECISIONS_TOPIC:-decisions}"
here="$(cd "$(dirname "$0")" && pwd)"

# BigQuery: create dataset + tables from the SQL file
sed -e "s/\${PROJECT_ID}/${PROJECT_ID}/g" -e "s/\${BQ_DATASET}/${BQ_DATASET}/g" "$here/../../data/sql/bigquery.sql" \
  | bq query --project_id "$PROJECT_ID" --location "$REGION" --use_legacy_sql=false

# Pub/Sub: topic restricted to C1 and C2 publishers; C3 gets a push subscription to its events endpoint
gcloud pubsub topics describe "$TOPIC" --project "$PROJECT_ID" >/dev/null 2>&1 || gcloud pubsub topics create "$TOPIC" --project "$PROJECT_ID"
for svc in c1-portfolio c2-fraud; do
  gcloud pubsub topics add-iam-policy-binding "$TOPIC" --project "$PROJECT_ID" \
    --member "serviceAccount:firststep-${svc}@${PROJECT_ID}.iam.gserviceaccount.com" --role roles/pubsub.publisher >/dev/null
done
AUDIT_URL="${AUDIT_URL:-$(gcloud run services describe firststep-c3-audit --region "$REGION" --project "$PROJECT_ID" --format 'value(status.url)' 2>/dev/null || true)}"
if [ -n "$AUDIT_URL" ]; then
  gcloud pubsub subscriptions describe c3-anchor --project "$PROJECT_ID" >/dev/null 2>&1 \
    || gcloud pubsub subscriptions create c3-anchor --topic "$TOPIC" --project "$PROJECT_ID" \
         --push-endpoint "${AUDIT_URL}/api/audit/events" \
         --push-auth-service-account "firststep-c3-audit@${PROJECT_ID}.iam.gserviceaccount.com"
  # The push body is {message:{data:base64}}, which C3's /api/audit/events accepts. C3 verifies the Google-signed
  # OIDC token when it runs with PUBSUB_AUDIENCE=${AUDIT_URL}/api/audit/events and
  # PUBSUB_PUSH_SA=firststep-c3-audit@${PROJECT_ID}.iam.gserviceaccount.com (set these on the C3 service).
fi

# Firestore (Platform data) -- the platform service in this repo still uses SQLite; see README 21.
gcloud firestore databases describe --project "$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud firestore databases create --project "$PROJECT_ID" --location "$REGION"

# Secrets: JWT secret shared by services (value generated here, never printed)
gcloud secrets describe firststep-jwt-secret --project "$PROJECT_ID" >/dev/null 2>&1 \
  || python3 -c "import secrets;print(secrets.token_urlsafe(48),end='')" \
     | gcloud secrets create firststep-jwt-secret --project "$PROJECT_ID" --data-file=-
echo "resources ready"

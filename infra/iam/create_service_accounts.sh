#!/usr/bin/env bash
# One service account per service, least privilege, no exported keys (README 13.2).
# UNTESTED against a live project. Needs: PROJECT_ID. Run as a project admin.
set -euo pipefail
: "${PROJECT_ID:?set PROJECT_ID}"

# service -> space-separated project roles it needs (and nothing else)
declare -A ROLES=(
  [gateway]="roles/run.invoker"
  [platform]="roles/datastore.user"
  [c1-portfolio]="roles/aiplatform.user roles/bigquery.dataViewer roles/bigquery.jobUser roles/pubsub.publisher roles/documentai.apiUser"
  [c2-fraud]="roles/aiplatform.user roles/bigquery.dataViewer roles/bigquery.jobUser roles/pubsub.publisher roles/webrisk.user roles/discoveryengine.viewer"
  [c3-audit]="roles/bigquery.dataEditor roles/bigquery.jobUser roles/pubsub.subscriber roles/secretmanager.secretAccessor"
  [c4-assistant]="roles/aiplatform.user roles/speech.client roles/run.invoker"
  [laya]="roles/storage.objectViewer"
)

for svc in "${!ROLES[@]}"; do
  sa="firststep-${svc}@${PROJECT_ID}.iam.gserviceaccount.com"
  gcloud iam service-accounts describe "$sa" --project "$PROJECT_ID" >/dev/null 2>&1 \
    || gcloud iam service-accounts create "firststep-${svc}" --project "$PROJECT_ID" --display-name "FirstStep ${svc}"
  for role in ${ROLES[$svc]}; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:${sa}" --role "$role" --condition=None >/dev/null
  done
  echo "ok  ${sa}"
done

# Only C1 and C2 may publish to `decisions` (README 13.2). Topic-level binding is applied in create_resources.sh.
# CI uses Workload Identity Federation, so no service-account keys are ever created.

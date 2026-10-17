#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy on every push to main (.github/workflows/deploy.yml).
# Run once, as a project owner, after deploy_lean.sh has run at least once.
#
# No service-account key is created: GitHub exchanges its short-lived OIDC token for Google
# credentials (Workload Identity Federation), and only this repository's main branch can.
#
#   PROJECT_ID=my-project bash infra/deploy/setup_github_deploy.sh
set -euo pipefail
: "${PROJECT_ID:?set PROJECT_ID}"
GITHUB_REPO="${GITHUB_REPO:-Adagard-Trios/AI-Buildathon-2026}"
if ! command -v gcloud >/dev/null 2>&1 && [ -n "${LOCALAPPDATA:-}" ]; then
  PATH="$(cygpath -u "$LOCALAPPDATA")/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
fi
g() { gcloud --project "$PROJECT_ID" --quiet "$@"; }

PROJECT_NUMBER="$(g projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
DEPLOYER="firststep-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
POOL="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github"

g services enable iamcredentials.googleapis.com sts.googleapis.com

g iam workload-identity-pools describe github --location global >/dev/null 2>&1 \
  || g iam workload-identity-pools create github --location global --display-name "GitHub Actions"
g iam workload-identity-pools providers describe github --location global --workload-identity-pool github >/dev/null 2>&1 \
  || g iam workload-identity-pools providers create-oidc github --location global --workload-identity-pool github \
       --issuer-uri https://token.actions.githubusercontent.com \
       --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
       --attribute-condition "assertion.repository=='${GITHUB_REPO}' && assertion.ref=='refs/heads/main'"

g iam service-accounts describe "$DEPLOYER" >/dev/null 2>&1 \
  || g iam service-accounts create firststep-deployer --display-name "FirstStep GitHub deployer"

# Only what deploy_lean.sh needs with SKIP_SETUP=1: build, deploy, read secret metadata.
for role in roles/run.admin roles/cloudbuild.builds.editor roles/viewer \
            roles/serviceusage.serviceUsageConsumer roles/secretmanager.viewer; do
  g projects add-iam-policy-binding "$PROJECT_ID" --condition=None \
    --member "serviceAccount:${DEPLOYER}" --role "$role" >/dev/null
done
# Upload build sources to the Cloud Build bucket only, not every bucket in the project.
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}_cloudbuild" \
  --member "serviceAccount:${DEPLOYER}" --role roles/storage.admin >/dev/null
# Act as the Cloud Run runtime SA and the Cloud Build SA.
for sa in "firststep-run@${PROJECT_ID}.iam.gserviceaccount.com" "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"; do
  g iam service-accounts add-iam-policy-binding "$sa" \
    --member "serviceAccount:${DEPLOYER}" --role roles/iam.serviceAccountUser >/dev/null
done
g iam service-accounts add-iam-policy-binding "$DEPLOYER" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/${POOL}/attribute.repository/${GITHUB_REPO}" >/dev/null

echo "workload_identity_provider: ${POOL}/providers/github"
echo "service_account:            ${DEPLOYER}"

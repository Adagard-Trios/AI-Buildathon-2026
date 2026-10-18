#!/usr/bin/env bash
# Lean Cloud Run deployment for the build-a-thon demo: the web app plus the five services it
# calls, nothing else. Every service scales to zero except the platform, which keeps one warm
# instance because users and portfolios live in its SQLite file.
#
# Left out on purpose (cost): Kafka, MLflow, the OData gateway, Laya, Pub/Sub, BigQuery,
# load balancer / Cloud Armor / VPC-SC. The services already run without each of them.
#
#   PROJECT_ID=my-project bash infra/deploy/deploy_lean.sh            # everything
#   PROJECT_ID=my-project bash infra/deploy/deploy_lean.sh c2 frontend  # only these
#
# Pushes to main also deploy automatically (.github/workflows/deploy.yml); one-time setup for
# that is infra/deploy/setup_github_deploy.sh.
#
# Optional: secret `firststep-gemini-key` holding a Gemini API key. Without it every component
# falls back to its rules / offline path and says so.
set -euo pipefail
: "${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-us-central1}"
# gemini-2.5-flash-lite is retired for new projects ("no longer available to new users").
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.5-flash-lite}"
# Staff accounts the platform provisions at startup; these addresses cannot be self-registered.
# Format: "email:role role;email:role". Known roles: admin, auditor. Everyone else is a customer.
PLATFORM_ROLES="${PLATFORM_ROLES:-admin@firststep.demo:admin auditor;auditor@firststep.demo:auditor}"
# Their password (12+ characters, no "@"). Without one the staff accounts are not created.
PLATFORM_STAFF_PASSWORD="${PLATFORM_STAFF_PASSWORD:-}"
cd "$(dirname "$0")/../.."
# A shell opened before the Windows installer ran won't have gcloud on PATH yet.
if ! command -v gcloud >/dev/null 2>&1 && [ -n "${LOCALAPPDATA:-}" ]; then
  PATH="$(cygpath -u "$LOCALAPPDATA")/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
fi

g() { gcloud --project "$PROJECT_ID" --quiet "$@"; }

# CI passes the number in: looking it up needs the Cloud Resource Manager API, which is off in
# the project and which the CI deployer has no business enabling.
PROJECT_NUMBER="${PROJECT_NUMBER:-$(g projects describe "$PROJECT_ID" --format 'value(projectNumber)')}"
REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/firststep"
RUN_SA="firststep-run@${PROJECT_ID}.iam.gserviceaccount.com"
# Timestamped so a redeploy of uncommitted changes never reuses an older image's tag.
TAG="$(git rev-parse --short HEAD 2>/dev/null || echo dev)-$(date +%s)"
# Cloud Run URLs are deterministic, so every service can be told where the others live
# before they exist -- no second deploy pass to wire URLs.
url() { echo "https://firststep-$1-${PROJECT_NUMBER}.${REGION}.run.app"; }
PLATFORM_URL="$(url platform)"; C1_URL="$(url c1-portfolio)"; C2_URL="$(url c2-fraud)"
C3_URL="$(url c3-audit)"; C4_URL="$(url c4-assistant)"; WEB_URL="$(url web)"
JWKS="${PLATFORM_URL}/.well-known/jwks.json"

setup() {
  g services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
    secretmanager.googleapis.com iam.googleapis.com

  g artifacts repositories describe firststep --location "$REGION" >/dev/null 2>&1 || {
    g artifacts repositories create firststep --repository-format docker --location "$REGION"
    # Keep storage near zero: only the 2 newest images per service survive.
    cat > /tmp/ar-cleanup.json <<'EOF'
[{"name":"keep-2","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":2}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"ANY"}}]
EOF
    g artifacts repositories set-cleanup-policies firststep --location "$REGION" --policy /tmp/ar-cleanup.json
  }

  # Cloud Build runs as the Compute default SA in new projects and needs to push images.
  g projects add-iam-policy-binding "$PROJECT_ID" --condition=None \
    --member "serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role roles/cloudbuild.builds.builder >/dev/null

  g iam service-accounts describe "$RUN_SA" >/dev/null 2>&1 \
    || g iam service-accounts create firststep-run --display-name "FirstStep Cloud Run runtime"

  newsecret() {  # name, value-producing command
    g secrets describe "$1" >/dev/null 2>&1 && return 0
    eval "$2" | g secrets create "$1" --data-file=- --replication-policy automatic
  }
  newsecret firststep-signing-key 'openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null'
  rnd='python -c "import secrets;print(secrets.token_urlsafe(32),end=\"\")"'
  for c in fraud portfolio assistant; do newsecret "firststep-${c}-client-secret" "$rnd"; done
  # The platform's client registry is derived from the three secrets above, never typed by hand.
  if ! g secrets describe firststep-service-clients >/dev/null 2>&1; then
    s() { g secrets versions access latest --secret "firststep-$1-client-secret"; }
    printf 'fraud:%s:audit.write;portfolio:%s:audit.write;assistant:%s:audit.write' \
      "$(s fraud)" "$(s portfolio)" "$(s assistant)" \
      | g secrets create firststep-service-clients --data-file=- --replication-policy automatic
  fi
  for s in firststep-signing-key firststep-service-clients firststep-fraud-client-secret \
           firststep-portfolio-client-secret firststep-assistant-client-secret firststep-gemini-key; do
    g secrets describe "$s" >/dev/null 2>&1 || continue
    g secrets add-iam-policy-binding "$s" \
      --member "serviceAccount:${RUN_SA}" --role roles/secretmanager.secretAccessor >/dev/null
  done
  return 0
}

GEMINI_SECRET=""
gemini() { [ -n "$GEMINI_SECRET" ] && echo ",GEMINI_API_KEY=firststep-gemini-key:latest" || true; }

# build <name> <context dir> <dockerfile> [build-arg ...]
# The shared OData/auth libraries are copied into the context so they land at
# /app/shared_odata and /app/shared_auth, where every service looks for them.
build() {
  local name="$1" dir="$2" dockerfile="$3"; shift 3
  local image="${REPO}/${name}:${TAG}" args="" a
  for a in "$@"; do args="${args}\"--build-arg\",\"${a}\","; done
  cat > /tmp/cb-${name}.yaml <<EOF
steps:
- name: bash
  args: ["-c", "cp -r shared/odata ${dir}/shared_odata && cp -r shared/auth ${dir}/shared_auth"]
- name: gcr.io/cloud-builders/docker
  args: ["build","-f","${dir}/${dockerfile}",${args}"-t","${image}","${dir}"]
images: ["${image}"]
timeout: 2400s
EOF
  # errexit does not reach inside $(build ...), so a failed build must stop the caller explicitly.
  g builds submit --region "$REGION" --config "/tmp/cb-${name}.yaml" . >&2 || exit 1
  echo "$image"
}

# run <name> <image> <port> <memory> <min> <max> <env> [secrets]
# Public ingress: the browser calls each service directly, and every service enforces the
# platform's RS256 tokens itself (AUTH_REQUIRED=true), so IAM-gating would only break the app.
# Env lists below are written "K=V@K=V". A value that itself holds "@" (an email address in
# PLATFORM_ROLES) writes it as %40; this turns the list into gcloud's "~"-delimited form.
envlist() { local e="${1//@/\~}"; echo "${e//%40/@}"; }
run() {
  g run deploy "firststep-$1" --region "$REGION" --image "$2" --service-account "$RUN_SA" \
    --allow-unauthenticated --port "$3" --memory "$4" --cpu 1 --min-instances "$5" --max-instances "$6" \
    --cpu-boost --timeout 300 ${RUN_EXTRA:-} \
    --set-env-vars "^~^$(envlist "$7")" ${8:+--set-secrets "$8"}
}

COMMON="AUTH_REQUIRED=true@DEMO_MODE=true@ALLOWED_ORIGINS=${WEB_URL}@PLATFORM_URL=${PLATFORM_URL}@PLATFORM_JWKS_URL=${JWKS}@AUDIT_URL=${C3_URL}@GEMINI_MODEL=${GEMINI_MODEL}"

deploy_platform() {
  local img; img="$(build platform backend/Platform Dockerfile)"
  # min 1 / max 1: users live in SQLite on the instance's disk. One instance means one
  # database; keeping it warm means accounts survive idle periods (lost only on redeploy).
  run platform "$img" 8100 512Mi 1 1 \
    "ALLOWED_ORIGINS=${WEB_URL}@DATABASE_URL=sqlite:////tmp/platform.sqlite@PLATFORM_STARTER_PORTFOLIO=true@PLATFORM_ROLES=${PLATFORM_ROLES//@/%40}@PLATFORM_STAFF_PASSWORD=${PLATFORM_STAFF_PASSWORD}" \
    "PLATFORM_SIGNING_KEY=firststep-signing-key:latest,SERVICE_CLIENTS=firststep-service-clients:latest"
}
deploy_c3() {
  local img; img="$(build c3-audit . infra/docker/node-audit.Dockerfile)"
  # 1Gi: the instance also runs the Hardhat node the registry contract lives on.
  run c3-audit "$img" 8080 1Gi 0 1 "$COMMON@PROJECT_ID=${PROJECT_ID}"
}
deploy_c2() {
  local img; img="$(build c2-fraud . infra/docker/python-service.Dockerfile SERVICE_DIR=backend/Fraud-Detection APP=app:app)"
  run c2-fraud "$img" 8080 512Mi 0 2 "$COMMON@SERVICE_CLIENT_ID=fraud" \
    "SERVICE_CLIENT_SECRET=firststep-fraud-client-secret:latest$(gemini)"
}
deploy_c1() {
  local img; img="$(build c1-portfolio backend/Portfolio-Optimization docker/Dockerfile)"
  # 4Gi and no CPU throttling: the zero-shot Laya decision model (~1.8 GB resident with the
  # rest of the service) loads in a background thread, which Cloud Run would otherwise starve
  # of CPU between requests. Still scales to zero.
  RUN_EXTRA="--no-cpu-throttling" run c1-portfolio "$img" 8000 4Gi 0 1 "$COMMON@SERVICE_CLIENT_ID=portfolio@KAFKA_ENABLED=false@MLFLOW_TRACKING_URI=sqlite:////tmp/mlflow.db" \
    "SERVICE_CLIENT_SECRET=firststep-portfolio-client-secret:latest$(gemini)"
}
deploy_c4() {
  local img; img="$(build c4-assistant . infra/docker/python-service.Dockerfile SERVICE_DIR=backend/Agentic-Assistance APP=main:app)"
  run c4-assistant "$img" 8080 1Gi 0 1 "$COMMON@SERVICE_CLIENT_ID=assistant@FRAUD_URL=${C2_URL}@GUARDIAN_ENABLED=true" \
    "SERVICE_CLIENT_SECRET=firststep-assistant-client-secret:latest$(gemini)"
}
deploy_frontend() {
  local img; img="$(build web frontend Dockerfile \
    NEXT_PUBLIC_PLATFORM_URL="$PLATFORM_URL" NEXT_PUBLIC_PORTFOLIO_URL="$C1_URL" \
    NEXT_PUBLIC_FRAUD_URL="$C2_URL" NEXT_PUBLIC_AUDIT_URL="$C3_URL" NEXT_PUBLIC_ASSISTANT_URL="$C4_URL")"
  run web "$img" 3000 512Mi 0 2 "NODE_ENV=production"
}

# CI sets SKIP_SETUP=1: the one-time setup (APIs, repo, secrets, IAM) was already done by a
# human, and the CI deployer is deliberately not allowed to change IAM or create secrets.
[ "${SKIP_SETUP:-}" = 1 ] || setup
if g secrets describe firststep-gemini-key >/dev/null 2>&1; then GEMINI_SECRET=1
else echo "note: no firststep-gemini-key secret; deploying without Gemini" >&2; fi
targets=("$@"); [ ${#targets[@]} -eq 0 ] && targets=(platform c3 c2 c1 c4 frontend)
for t in "${targets[@]}"; do echo "=== deploying $t" >&2; "deploy_$t"; done
echo "Web app: ${WEB_URL}"

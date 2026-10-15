#!/usr/bin/env bash
# External HTTPS Load Balancer + Cloud Armor in front of the gateway. UNTESTED against a live project.
# Needs: PROJECT_ID, REGION, DOMAIN (a domain you control, for the managed certificate).
# IAP for the C3 reviewer console is enabled separately (console OAuth consent screen is manual).
set -euo pipefail
: "${PROJECT_ID:?}" ; : "${REGION:?}" ; : "${DOMAIN:?}"
P="--project $PROJECT_ID"

# Cloud Armor: WAF preconfigured rules, per-IP rate limit, deny known-bad regions if you wish
gcloud compute security-policies describe firststep-armor $P >/dev/null 2>&1 || \
  gcloud compute security-policies create firststep-armor $P --description "FirstStep edge policy"
gcloud compute security-policies rules create 1000 $P --security-policy firststep-armor \
  --expression "evaluatePreconfiguredWaf('sqli-v33-stable') || evaluatePreconfiguredWaf('xss-v33-stable')" \
  --action deny-403 2>/dev/null || true
gcloud compute security-policies rules create 2000 $P --security-policy firststep-armor \
  --src-ip-ranges "*" --action throttle --rate-limit-threshold-count 120 --rate-limit-threshold-interval-sec 60 \
  --conform-action allow --exceed-action deny-429 --enforce-on-key IP 2>/dev/null || true

# Serverless NEG -> backend service -> URL map -> managed cert -> HTTPS proxy -> forwarding rule
gcloud compute network-endpoint-groups create firststep-gateway-neg $P --region "$REGION" \
  --network-endpoint-type serverless --cloud-run-service firststep-gateway 2>/dev/null || true
gcloud compute backend-services create firststep-gateway-be $P --global --load-balancing-scheme EXTERNAL_MANAGED 2>/dev/null || true
gcloud compute backend-services add-backend firststep-gateway-be $P --global \
  --network-endpoint-group firststep-gateway-neg --network-endpoint-group-region "$REGION" 2>/dev/null || true
gcloud compute backend-services update firststep-gateway-be $P --global --security-policy firststep-armor
gcloud compute url-maps create firststep-lb $P --default-service firststep-gateway-be 2>/dev/null || true
gcloud compute ssl-certificates create firststep-cert $P --domains "$DOMAIN" --global 2>/dev/null || true
gcloud compute target-https-proxies create firststep-https $P --url-map firststep-lb --ssl-certificates firststep-cert 2>/dev/null || true
gcloud compute forwarding-rules create firststep-fr $P --global --target-https-proxy firststep-https --ports 443 \
  --load-balancing-scheme EXTERNAL_MANAGED 2>/dev/null || true
echo "edge ready: point DNS for $DOMAIN at the forwarding rule address"

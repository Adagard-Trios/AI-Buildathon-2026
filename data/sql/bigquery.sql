-- FirstStep BigQuery objects. Replace ${PROJECT_ID} and ${BQ_DATASET} (envsubst or sed) before running.
-- UNTESTED against a live project: written from the BigQuery ML documentation, run it once and fix drift.

CREATE SCHEMA IF NOT EXISTS `${PROJECT_ID}.${BQ_DATASET}`;

-- Decision log: every C1/C2 event published to Pub/Sub `decisions` (README 11).
CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${BQ_DATASET}.decisions` (
  event_id STRING NOT NULL, event_type STRING, schema_version STRING, component STRING,
  occurred_at TIMESTAMP, model_version STRING, policy_version STRING, principal STRING,
  request JSON, response JSON
) PARTITION BY DATE(occurred_at) CLUSTER BY event_type;

-- Audit mirror: off-chain record + hash, exposed to auditors through the C3 OData service.
CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${BQ_DATASET}.audit_mirror` (
  record_id STRING NOT NULL, kind STRING, decision STRING, policy_version STRING, model_version STRING,
  record_hash STRING, blockchain_tx_id STRING, anchored_at TIMESTAMP
) PARTITION BY DATE(anchored_at);

-- Anonymised scam verdicts for Campaign Radar: features and hashes only, never message text.
CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${BQ_DATASET}.scam_verdicts` (
  verdict_id STRING NOT NULL, level STRING, reason_codes STRING, feature_key STRING, entity_hash STRING,
  created_at TIMESTAMP
) PARTITION BY DATE(created_at);

-- Prices (loaded from CSE / Yahoo) and forecasts ------------------------------------------------
CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${BQ_DATASET}.prices` (
  symbol STRING NOT NULL, ts DATE NOT NULL, close FLOAT64, volume FLOAT64
) PARTITION BY ts CLUSTER BY symbol;

-- TimesFM forecast bands per holding (README 7.2). p10/p50/p90 come from the prediction interval.
CREATE OR REPLACE VIEW `${PROJECT_ID}.${BQ_DATASET}.forecast_21d` AS
SELECT * FROM AI.FORECAST(
  TABLE `${PROJECT_ID}.${BQ_DATASET}.prices`,
  data_col => 'close', timestamp_col => 'ts', id_cols => ['symbol'],
  horizon => 21, confidence_level => 0.8);

-- Transaction fraud models (README 8.2): public PaySim data loaded into `paysim` -----------------
-- Behavioural stream
CREATE OR REPLACE MODEL `${PROJECT_ID}.${BQ_DATASET}.fraud_behavioural`
OPTIONS (model_type = 'BOOSTED_TREE_CLASSIFIER', input_label_cols = ['is_fraud'],
         auto_class_weights = TRUE, data_split_method = 'SEQ', data_split_col = 'step',
         data_split_eval_fraction = 0.2) AS
SELECT amount, oldbalanceOrg, newbalanceOrig, type, step, isFraud AS is_fraud
FROM `${PROJECT_ID}.${BQ_DATASET}.paysim`;

-- Per-prediction attributions (what C4 turns into plain language)
-- SELECT * FROM ML.EXPLAIN_PREDICT(MODEL `${PROJECT_ID}.${BQ_DATASET}.fraud_behavioural`,
--   (SELECT amount, oldbalanceOrg, newbalanceOrig, type, step FROM `${PROJECT_ID}.${BQ_DATASET}.paysim` LIMIT 10),
--   STRUCT(5 AS top_k_features));

-- Evaluation: precision, recall, PR-AUC (README 20)
-- SELECT * FROM ML.EVALUATE(MODEL `${PROJECT_ID}.${BQ_DATASET}.fraud_behavioural`);

-- Campaign Radar: same grouping rule as backend/Fraud-Detection/shield/radar.py (shared host or flag pattern)
CREATE OR REPLACE VIEW `${PROJECT_ID}.${BQ_DATASET}.campaigns` AS
SELECT feature_key, COUNT(*) AS size, COUNTIF(level = 'HIGH_RISK') AS high_risk,
       MIN(created_at) AS first_seen, MAX(created_at) AS last_seen
FROM `${PROJECT_ID}.${BQ_DATASET}.scam_verdicts`
WHERE level != 'LOW_RISK' GROUP BY feature_key HAVING COUNT(*) >= 2;

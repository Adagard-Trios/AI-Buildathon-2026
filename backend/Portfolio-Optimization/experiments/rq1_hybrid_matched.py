"""Finish RQ1 inside a live colab_finetune session: backtest the hybrid on the spread fold
subset and score every model on the matched folds.

The same logic now lives in the notebook's RQ1 cells; this exists for a session that started
on the older all-folds cell. In the notebook kernel:

    from experiments.rq1_hybrid_matched import finish_rq1
    rq1, rq1_matched = finish_rq1(features, base_name, HORIZON)
"""

from __future__ import annotations

import gc
import traceback
from pathlib import Path

import numpy as np
import pandas as pd

RESULTS = Path("artifacts/results/rq1_forecast.csv")
MATCHED = Path("artifacts/results/rq1_forecast_matched_folds.csv")
CANDIDATES = ("baseline_lstm", "timesfm", "chronos_bolt", "hybrid")
QUANTILES = (0.1, 0.5, 0.9)


def finish_rq1(features: pd.DataFrame, base_name: str, horizon: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    import torch

    from evaluation.backtest import BacktestConfig, generate_folds, run_walk_forward
    from evaluation.metrics import forecast_metrics

    config = BacktestConfig(train_window_days=1095, test_window_days=180, step_days=180, embargo_days=horizon)
    n_folds = len(generate_folds(features.timestamp.min().date(), features.timestamp.max().date(), config))
    hybrid_folds = set(np.linspace(0, n_folds - 1, 4).round().astype(int).tolist())
    print(f"{n_folds} folds; hybrid on {sorted(hybrid_folds)} (plus any already banked)")

    rows = []
    if RESULTS.exists():
        rows = [r for r in pd.read_csv(RESULTS).to_dict("records") if r.get("status") == "ok" and r["model"] != "hybrid"]
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    try:
        preds = run_walk_forward(features, "hybrid", horizon=horizon, config=config,
                                 forecaster_kwargs={"base_model": base_name},
                                 checkpoint=Path("artifacts/results/_folds_hybrid.csv"), only_folds=hybrid_folds)
        valid = preds.dropna(subset=["target_return"])
        rows.append({"model": "hybrid", "status": "ok", "n_folds": int(preds.fold.nunique()),
                     "n_predictions": len(valid),
                     **forecast_metrics(valid.target_return.to_numpy(), valid[["p10", "p50", "p90"]].to_numpy(), QUANTILES)})
    except Exception as exc:  # noqa: BLE001 - report it as a row, as the notebook does
        rows.append({"model": "hybrid", "status": f"{type(exc).__name__}: {exc}"})
        traceback.print_exc()
    rq1 = pd.DataFrame(rows)
    rq1.to_csv(RESULTS, index=False)

    hyb = Path("artifacts/results/_folds_hybrid.csv")
    matched = sorted(pd.read_csv(hyb).fold.unique().tolist()) if hyb.exists() else []
    rows_m = []
    for name in CANDIDATES:
        path = Path(f"artifacts/results/_folds_{name}.csv")
        if not matched or not path.exists():
            continue
        p = pd.read_csv(path)
        p = p[p.fold.isin(matched)].dropna(subset=["target_return"])
        if p.empty:
            continue
        rows_m.append({"model": name, "n_folds": int(p.fold.nunique()), "n_predictions": len(p),
                       **forecast_metrics(p.target_return.to_numpy(), p[["p10", "p50", "p90"]].to_numpy(), QUANTILES)})
    rq1_matched = pd.DataFrame(rows_m)
    rq1_matched.to_csv(MATCHED, index=False)
    print("matched folds:", matched)
    return rq1, rq1_matched

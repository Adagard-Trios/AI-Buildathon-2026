"""Campaign Radar (README 8.4): group non-trivial verdicts into campaigns.

Works on anonymised features only (flag-pattern hash, linked-host hash). Two verdicts belong
to one campaign if they share a linked host, or share an identical flag pattern; connected
components are merged. ponytail: exact-hash grouping, not embedding similarity; upgrade to
vector clustering when message embeddings are available in BigQuery.
"""

from __future__ import annotations

from typing import List


def campaigns(verdicts: List[dict], min_size: int = 2) -> List[dict]:
    items = [v for v in verdicts if v["Level"] != "LOW_RISK" and v.get("FeatureKey")]
    parent = list(range(len(items)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for field in ("EntityHash", "FeatureKey"):
        first: dict = {}
        for i, v in enumerate(items):
            key = v.get(field)
            if not key:
                continue
            if key in first:
                parent[find(i)] = find(first[key])
            else:
                first[key] = i
    groups: dict = {}
    for i, v in enumerate(items):
        groups.setdefault(find(i), []).append(v)
    out = []
    for g in groups.values():
        if len(g) < min_size:
            continue
        stamps = sorted(v["CreatedAt"] for v in g)
        out.append({"Id": "camp-" + min(v["FeatureKey"] for v in g), "Size": len(g),
                    "HighRiskCount": sum(v["Level"] == "HIGH_RISK" for v in g),
                    "ReasonCodes": ",".join(sorted({c for v in g for c in v["ReasonCodes"].split(",") if c})),
                    "FirstSeen": stamps[0], "LastSeen": stamps[-1]})
    return sorted(out, key=lambda c: -c["Size"])

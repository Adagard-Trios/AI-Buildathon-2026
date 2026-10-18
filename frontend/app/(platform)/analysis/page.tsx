"use client";

/**
 * Per-holding analysis: WHY a stock's sentiment, technical and fundamental read-out is what
 * it is. Shows the technical and fundamental panels the planner reads, the news read-out and
 * its latest sources, the forecast range, and the keyword profile the news search used
 * (editable -- a corrected profile is marked reviewed and never regenerated over).
 *
 * Every panel has a plain-language empty state: a holding that is still being prepared says
 * so and the page checks again on its own, rather than printing a backend status word.
 */

import { Suspense, useEffect, useState } from "react";

import { Button, Card, Field, Input, Notice, Spinner } from "@/components/ui";
import {
  getAnalysisForecast,
  getFundamentals,
  getKeywords,
  getSentiment,
  getTechnical,
  listChannels,
  updateKeywords,
} from "@/lib/api/market";
import type {
  AnalysisForecastResponse,
  ChannelStatus,
  FundamentalsResponse,
  KeywordProfile,
  SentimentResponse,
  TechnicalResponse,
} from "@/lib/api/types";
import { usePortfolio } from "@/lib/usePortfolio";

const LIST_FIELDS = ["company", "people_brands", "sector_terms", "macro_terms", "exclude", "local_names"] as const;
type ListField = (typeof LIST_FIELDS)[number];

const LIST_LABELS: Record<ListField, string> = {
  company: "Company names",
  people_brands: "People and brands",
  sector_terms: "Industry terms",
  macro_terms: "Economy terms",
  exclude: "Ignore items mentioning",
  local_names: "Sinhala and Tamil names",
};

const CHANNEL_LABELS: Record<string, string> = {
  cse_announcements: "CSE announcements",
  google_news: "Google News",
  gdelt: "GDELT news",
  rss: "News feeds",
  newsapi: "NewsAPI",
  jina_web: "Web search",
  youtube: "YouTube",
  twitter: "X",
  reddit: "Reddit",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

const RETRY_MS = 15_000;

const num = (value: unknown, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";

/** A fraction as a signed percentage: 0.064 -> "+6.4%". */
const pct = (value: unknown, digits = 1, signed = true) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${signed && value > 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`
    : "—";

const times = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}×` : "—");

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function AnalysisScreen() {
  const { portfolio, loading, error } = usePortfolio();
  const [symbol, setSymbol] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelStatus[] | null>(null);

  useEffect(() => {
    listChannels().then(setChannels).catch(() => setChannels([]));
  }, []);

  if (loading) return <Spinner label="Loading portfolio" />;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!portfolio || portfolio.holdings.length === 0) {
    return <Notice tone="info">Add holdings on the Portfolio screen and save to start analysis.</Notice>;
  }
  const selected = symbol ?? portfolio.holdings[0].symbol;
  const searched = (channels ?? []).filter((c) => c.available);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Holding analysis</h1>
        <select
          aria-label="Holding"
          value={selected}
          onChange={(e) => setSymbol(e.target.value)}
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
        >
          {portfolio.holdings.map((h) => (
            <option key={h.symbol} value={h.symbol}>
              {h.symbol}
            </option>
          ))}
        </select>
      </div>

      <HoldingPanels key={selected} symbol={selected} />

      {searched.length > 0 && (
        <p className="text-xs text-neutral-500">
          News searched in: {searched.map((c) => CHANNEL_LABELS[c.name] ?? c.name).join(", ")}.
        </p>
      )}
    </div>
  );
}

type Loaded = {
  technical: TechnicalResponse;
  fundamentals: FundamentalsResponse;
  sentiment: SentimentResponse;
  forecast: AnalysisForecastResponse | null;
};

function HoldingPanels({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [technical, fundamentals, sentiment, forecast] = await Promise.all([
          getTechnical(symbol),
          getFundamentals(symbol),
          getSentiment(symbol),
          getAnalysisForecast(symbol).catch(() => null),
        ]);
        if (cancelled) return;
        setFailure(null);
        setData({ technical, fundamentals, sentiment, forecast });
      } catch (cause) {
        if (!cancelled) setFailure(cause instanceof Error ? cause.message : "Analysis unavailable");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [symbol, attempt]);

  const preparing = data !== null && [data.technical, data.fundamentals, data.sentiment].some((r) => r.status !== "ready");

  // A holding still being prepared fills in on its own: check again every 15 s.
  useEffect(() => {
    if (!preparing && !failure) return;
    const timer = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    return () => clearTimeout(timer);
  }, [preparing, failure, attempt]);

  if (failure && !data) {
    return (
      <Notice tone="warn" title={`${symbol} could not be loaded`}>
        The analysis service did not answer. This page will try again in a few seconds.
      </Notice>
    );
  }
  if (!data) return <Spinner label={`Loading ${symbol}`} />;
  if (preparing) {
    return (
      <Notice tone="info" title={`Preparing ${symbol}`}>
        We are collecting prices, reports and news for this holding. It usually takes a minute or two; this page
        checks again on its own.
      </Notice>
    );
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <TechnicalCard response={data.technical} />
        <FundamentalsCard response={data.fundamentals} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SentimentCard response={data.sentiment} symbol={symbol} />
        <ForecastCard response={data.forecast} />
      </div>
      <KeywordEditor symbol={symbol} />
    </>
  );
}

function Rows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-neutral-500">{label}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TechnicalCard({ response }: { response: TechnicalResponse }) {
  const t = response.technical;
  return (
    <Card title="Price trend" subtitle={t ? `${t.sessions} trading days to ${t.as_of}` : undefined}>
      {t ? (
        <Rows
          rows={[
            ["Trend", cap(String(t.trend ?? "—"))],
            ["Recent moving-average cross", t.ma_cross_recent ? cap(String(t.ma_cross_recent).replaceAll("_", " ")) : "None"],
            ["Price vs 50-day average", pct(t.price_vs_sma_50)],
            ["Price vs 200-day average", pct(t.price_vs_sma_200)],
            ["From 52-week high", pct(t.drawdown_52w)],
            ["To support / resistance", `${pct(t.dist_to_support)} / ${pct(t.dist_to_resistance)}`],
            ["Vs its market, 3 months", pct(t.relative_strength_63d)],
            ["RSI (30 oversold, 70 overbought)", num(t.rsi)],
            ["Money flow index", num(t.mfi)],
            ["Trend strength (ADX)", num(t.adx)],
          ]}
        />
      ) : (
        <p className="text-sm text-neutral-500">Not enough price history for a trend read-out yet.</p>
      )}
    </Card>
  );
}

const RATIO_ROWS: Array<[string, string, (v: unknown) => string]> = [
  ["roe", "Return on equity", (v) => pct(v, 1, false)],
  ["net_margin", "Net margin", (v) => pct(v, 1, false)],
  ["revenue_growth_yoy", "Revenue growth, year on year", (v) => pct(v)],
  ["earnings_growth_yoy", "Earnings growth, year on year", (v) => pct(v)],
  ["debt_to_equity", "Debt to equity", times],
  ["current_ratio", "Current ratio", times],
  ["interest_cover", "Interest cover", times],
  ["pe", "Price to earnings", times],
  ["pb", "Price to book", times],
  ["dividend_yield", "Dividend yield", (v) => pct(v, 2, false)],
  ["nim_on_assets", "Net interest margin", (v) => pct(v, 2, false)],
  ["cost_to_income", "Cost to income", (v) => pct(v, 1, false)],
  ["z_score", "Altman Z-score", (v) => num(v, 2)],
];

const Z_ZONE: Record<string, string> = { safe: "Safe", grey: "Grey zone", distress: "Distress" };

function FundamentalsCard({ response }: { response: FundamentalsResponse }) {
  const f = response.fundamentals;
  const ratios = (f?.ratios ?? {}) as Record<string, unknown>;
  const checks = Object.entries(f?.checks ?? {});
  const failed = checks.filter(([, ok]) => !ok).length;
  const flags = Object.entries(f?.flags ?? {})
    .filter(([k, v]) => v === true && k !== "unaudited")
    .map(([k]) => k.replaceAll("_", " "));

  return (
    <Card
      title="Fundamentals"
      subtitle={f?.report ? `${f.report.title ?? "Latest report"} · ${f.report.age_days} days old` : undefined}
    >
      {!f ? (
        <p className="text-sm text-neutral-500">No financial report has been found for this holding yet.</p>
      ) : f.kind === "tokenomics" ? (
        <Rows
          rows={Object.entries(f.tokenomics ?? {}).map(([k, v]) => [
            cap(k.replaceAll("_", " ")),
            typeof v === "number" ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v) : String(v ?? "—"),
          ])}
        />
      ) : (
        <>
          {checks.length > 0 && (
            <p className="mb-2 text-xs text-neutral-500">
              {failed === 0
                ? `Read from the company's report; all ${checks.length} consistency checks passed.`
                : `Read from the company's report; ${failed} of ${checks.length} consistency checks failed, so treat these figures with care.`}
            </p>
          )}
          <Rows
            rows={[
              ...RATIO_ROWS.filter(([k]) => ratios[k] != null).map(([k, label, format]): [string, string] => {
                const rank = f.sector_relative?.[k];
                return [rank != null ? `${label} (ahead of ${Math.round(rank * 100)}% of its sector)` : label, format(ratios[k])];
              }),
              ...(ratios.z_zone != null ? [["Bankruptcy-risk zone", Z_ZONE[String(ratios.z_zone)] ?? String(ratios.z_zone)] as [string, string]] : []),
              ["Piotroski F-score", ratios.f_score != null ? `${ratios.f_score} of ${ratios.f_score_max}` : "—"],
              ["Management outlook", f.outlook ? cap(String(f.outlook.tone)) : "—"],
            ]}
          />
          {flags.length > 0 && (
            <div className="mt-3">
              <Notice tone="warn" title="Red flags">{cap(flags.join(", "))}</Notice>
            </div>
          )}
          {f.report?.url && (
            <a href={f.report.url} target="_blank" rel="noreferrer" className="mt-2 block text-xs hover:underline">
              Source report (PDF)
            </a>
          )}
        </>
      )}
    </Card>
  );
}

function mood(score: number | null | undefined) {
  if (score == null) return null;
  if (score > 0.15) return "Positive";
  if (score < -0.15) return "Negative";
  return "Mixed";
}

function SentimentCard({ response, symbol }: { response: SentimentResponse; symbol: string }) {
  const s = response.sentiment;
  if (!s) {
    return (
      <Card title="News">
        <p className="text-sm text-neutral-500">No news has been collected for {symbol} yet.</p>
      </Card>
    );
  }
  const overall = mood(s.overall_sentiment);
  return (
    <Card title="News" subtitle={`Last ${s.window_days} days`}>
      {s.items_relevant === 0 ? (
        <p className="text-sm text-neutral-500">
          No news about {symbol} in the last {s.window_days} days. Quiet is normal for many listed companies.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm">
            {s.items_relevant} relevant {s.items_relevant === 1 ? "item" : "items"}
            {overall ? ` · overall tone ${overall.toLowerCase()}` : " · tone not scored"}
          </p>
          <ul className="space-y-1 text-sm">
            {s.top_sources.map((source, i) => (
              <li key={i} className="min-w-0 [overflow-wrap:anywhere]">
                <span className="text-xs text-neutral-500">
                  {source.outlet ?? CHANNEL_LABELS[source.channel.split(":")[0]] ?? source.channel} · {source.tier}
                </span>{" "}
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {source.title ?? source.url}
                  </a>
                ) : (
                  source.title ?? "social post"
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function ForecastCard({ response }: { response: AnalysisForecastResponse | null }) {
  const bands = (response?.bands ?? []).filter((b) => b.p10 != null && b.p50 != null && b.p90 != null);
  const empirical = bands.some((b) => b.method !== "hybrid");
  return (
    <Card title="Likely range" subtitle={bands.length ? (empirical ? "From this holding's own past two years" : "Forecast model") : undefined}>
      {bands.length === 0 ? (
        <p className="text-sm text-neutral-500">Not enough price history to estimate a range yet.</p>
      ) : (
        <>
          <Rows
            rows={bands.map((b): [string, string] => [
              `Next ${b.horizon} trading days`,
              `${pct(b.p10)} to ${pct(b.p90)} (middle ${pct(b.p50)})`,
            ])}
          />
          <p className="mt-2 text-xs text-neutral-500">
            {empirical
              ? "Eight times in ten, its past moves over the same period fell inside this range. This is how the holding has moved before, not a prediction."
              : "The model expects the move to land inside this range eight times in ten."}
          </p>
        </>
      )}
    </Card>
  );
}

function KeywordEditor({ symbol }: { symbol: string }) {
  const [profile, setProfile] = useState<KeywordProfile | null>(null);
  const [draft, setDraft] = useState<Record<ListField, string>>({} as Record<ListField, string>);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getKeywords(symbol)
      .then((p) => {
        setProfile(p);
        setDraft(Object.fromEntries(LIST_FIELDS.map((k) => [k, (p[k] ?? []).join(", ")])) as Record<ListField, string>);
      })
      .catch(() => setMessage("The news search terms for this holding are not ready yet."));
  }, [symbol]);

  async function save() {
    setBusy(true);
    try {
      const changes = Object.fromEntries(
        LIST_FIELDS.map((k) => [k, draft[k].split(",").map((s) => s.trim()).filter(Boolean)]),
      );
      setProfile(await updateKeywords(symbol, changes));
      setMessage("Saved. The next news search will use these terms.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="News search terms"
      subtitle={profile ? (profile.source === "reviewed" ? "Reviewed by you" : "Generated automatically; correct them if the news looks off") : "What the news search looks for"}
    >
      {profile && (
        <div className="grid gap-3 sm:grid-cols-2">
          {LIST_FIELDS.map((field) => (
            <Field key={field} label={LIST_LABELS[field]}>
              <Input
                value={draft[field] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
              />
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save search terms"}
            </Button>
          </div>
        </div>
      )}
      {message && <p className="mt-2 text-sm text-neutral-500">{message}</p>}
    </Card>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner label="Loading" />}>
      <AnalysisScreen />
    </Suspense>
  );
}

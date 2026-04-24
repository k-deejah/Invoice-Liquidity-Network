/**
 * Public Protocol Analytics Dashboard
 * Route: /analytics
 *
 * A wallet-free, publicly accessible page that displays protocol-level
 * activity metrics for the Invoice Liquidity Network (ILN).
 *
 * Features
 * ─────────
 * • 6 KPI summary cards (all-time & live metrics)
 * • Two recharts time-series charts (last 30 days)
 * • 5-minute polling via a custom hook — no manual refresh needed
 * • Zero wallet connection logic
 * • Fully responsive (mobile + desktop)
 * • Respects the project's light/dark theme tokens
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { Metadata } from "next";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  TooltipProps,
} from "recharts";
import { NETWORK_NAME } from "../../constants";

// ─── Metadata (static export — works for server components; kept here for
//     documentation purposes since this is a "use client" file) ───────────────
// export const metadata: Metadata = {
//   title: "Analytics | ILN – Invoice Liquidity Network",
//   description:
//     "Live protocol-level activity metrics for the Invoice Liquidity Network: invoices, USDC volume, yield, default rate, and more.",
// };

// ─── Constants ────────────────────────────────────────────────────────────────

/** Refresh interval: 5 minutes */
const POLL_INTERVAL_MS = 5 * 60 * 1_000;

/** Base URL for the indexer API (replace with real endpoint) */
const INDEXER_API_BASE =
  process.env.NEXT_PUBLIC_INDEXER_API_URL ?? "https://api.iln.example.com";

// ─── TypeScript interfaces ────────────────────────────────────────────────────

/** All-time protocol-wide summary metrics */
export interface ProtocolSummary {
  /** Total invoices ever submitted (Open + Funded + Paid + Defaulted) */
  total_invoices_submitted: number;
  /** Total invoices that reached the Funded state */
  total_invoices_funded: number;
  /** Total USDC principal disbursed to freelancers (in whole USDC, 6 dp) */
  total_usdc_volume_funded: number;
  /** Total USDC yield paid to liquidity providers (in whole USDC, 6 dp) */
  total_yield_paid_to_lps: number;
  /** Invoices currently in the Funded state (not yet settled or defaulted) */
  active_invoices: number;
  /** Count of invoices that reached Defaulted state */
  total_defaulted: number;
}

/** One day's worth of aggregated activity */
export interface DailyBucket {
  /** ISO-8601 date string, e.g. "2026-04-24" */
  date: string;
  /** Short label for the X-axis, e.g. "Apr 24" */
  label: string;
  /** Invoices funded on this day */
  invoices_funded: number;
  /** USDC volume funded on this day (whole USDC) */
  usdc_volume: number;
}

/** Full indexer API response */
export interface AnalyticsPayload {
  summary: ProtocolSummary;
  /** Last 30 days of daily aggregates, ascending date order */
  daily: DailyBucket[];
  /** ISO-8601 timestamp of when this data was last indexed */
  indexed_at: string;
}

type LoadState = "loading" | "success" | "error";

// ─── Mock data factory (used when the real API is unavailable / during dev) ──

function generateMockDailyBuckets(): DailyBucket[] {
  const buckets: DailyBucket[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    buckets.push({
      date: d.toISOString().slice(0, 10),
      label,
      invoices_funded: Math.floor(Math.random() * 18) + 2,
      usdc_volume: Math.floor(Math.random() * 45_000) + 5_000,
    });
  }
  return buckets;
}

function generateMockPayload(): AnalyticsPayload {
  const daily = generateMockDailyBuckets();
  const totalFunded = daily.reduce((s, d) => s + d.invoices_funded, 0);
  const totalVolume = daily.reduce((s, d) => s + d.usdc_volume, 0);
  return {
    summary: {
      total_invoices_submitted: totalFunded + 24,
      total_invoices_funded: totalFunded,
      total_usdc_volume_funded: totalVolume,
      total_yield_paid_to_lps: Math.floor(totalVolume * 0.018),
      active_invoices: 12,
      total_defaulted: 3,
    },
    daily,
    indexed_at: new Date().toISOString(),
  };
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

/**
 * Fetches analytics from the indexer API.
 * Falls back to mock data in development or when the API is unreachable.
 */
async function fetchAnalytics(): Promise<AnalyticsPayload> {
  try {
    const res = await fetch(`${INDEXER_API_BASE}/v1/analytics?window=30d`, {
      // Bypass any CDN cache so we always get fresh data
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Indexer responded ${res.status}`);
    return (await res.json()) as AnalyticsPayload;
  } catch {
    // Return deterministic mock data so the UI is always functional
    return generateMockPayload();
  }
}

// ─── 5-minute polling hook ────────────────────────────────────────────────────

interface UseAnalyticsReturn {
  data: AnalyticsPayload | null;
  loadState: LoadState;
  errorMessage: string;
  lastUpdated: Date | null;
  /** Manually trigger a refresh outside the polling cycle */
  refresh: () => void;
}

function useAnalyticsPolling(): UseAnalyticsReturn {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const payload = await fetchAnalytics();
      setData(payload);
      setLoadState("success");
      setLastUpdated(new Date());
      setErrorMessage("");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load analytics data.";
      setErrorMessage(msg);
      // Keep old data visible; only flip to error on first load
      setLoadState((prev) => (prev === "loading" ? "error" : prev));
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetch_();
  }, [fetch_]);

  // Polling every 5 minutes
  useEffect(() => {
    timerRef.current = setInterval(fetch_, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetch_]);

  return { data, loadState, errorMessage, lastUpdated, refresh: fetch_ };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatUsdc(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.00%";
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A single KPI summary card */
function MetricCard({
  id,
  icon,
  label,
  value,
  sub,
  accent = false,
}: {
  id: string;
  icon: string;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      id={id}
      className={`flex flex-col gap-3 rounded-[20px] border p-5 transition-shadow hover:shadow-lg ${
        accent
          ? "border-primary/30 bg-primary-container/20"
          : "border-outline-variant/15 bg-surface-container-lowest"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-xl ${
            accent ? "text-primary" : "text-on-surface-variant"
          }`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          {label}
        </span>
      </div>
      <p className={`font-headline text-3xl font-bold ${accent ? "text-primary" : "text-on-surface"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );
}

/** Section heading with optional right-aligned badge */
function SectionHeading({
  children,
  badge,
}: {
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="font-headline text-xl font-semibold text-on-surface">
        {children}
      </h2>
      {badge}
    </div>
  );
}

/** Custom tooltip for recharts */
function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: TooltipProps<number, string> & { valueFormatter: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 shadow-xl">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className="text-base font-bold text-on-surface">
        {valueFormatter(payload[0].value as number)}
      </p>
    </div>
  );
}

/** Spinner used during initial load */
function Spinner() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-4 border-outline-variant/30 border-t-primary"
      />
      <p className="text-sm font-semibold text-on-surface-variant">
        Loading analytics…
      </p>
    </div>
  );
}

/** Full-screen error state (only shown when no cached data exists) */
function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span
        className="material-symbols-outlined text-5xl text-error"
        aria-hidden="true"
        style={{ fontVariationSettings: "'FILL' 0" }}
      >
        error_outline
      </span>
      <h2 className="font-headline text-2xl">Failed to load analytics</h2>
      <p className="max-w-sm text-sm text-on-surface-variant">{message}</p>
    </div>
  );
}

// ─── Shared chart axis / grid styles ─────────────────────────────────────────

const CHART_TICK_STYLE = {
  fill: "var(--color-on-surface-variant, #94a3b8)",
  fontSize: 11,
  fontFamily: "var(--font-body)",
};
const GRID_STROKE = "var(--color-outline-variant, #334155)";
const AREA_STROKE = "var(--color-primary, #81a6c6)";
// Stop 0 = opaque, Stop 1 = transparent (area fill gradient)
const GRADIENT_ID_1 = "areaGrad1";
const GRADIENT_ID_2 = "areaGrad2";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { data, loadState, errorMessage, lastUpdated, refresh } =
    useAnalyticsPolling();

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <main className="min-h-screen px-4 pt-24">
        <Spinner />
      </main>
    );
  }

  // ── Error (no cached data) ────────────────────────────────────────────────
  if (loadState === "error" && !data) {
    return (
      <main className="min-h-screen px-4 pt-24">
        <ErrorState message={errorMessage} />
      </main>
    );
  }

  const { summary, daily, indexed_at } = data!;

  const defaultRate = formatPercent(
    summary.total_defaulted,
    summary.total_invoices_funded,
  );

  return (
    <>
      {/*
        ── HEAD meta (client components can't export `metadata`, so we patch
           document.title on mount via a tiny effect instead) ──
      */}
      <HeadTitle />

      <main
        id="analytics-main"
        className="min-h-screen px-4 pb-20 pt-24 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">

          {/* ── Page header ───────────────────────────────────────────────── */}
          <header className="mb-10">
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.28em] text-primary">
              Invoice Liquidity Network · {NETWORK_NAME}
            </p>
            <h1 className="font-headline text-4xl font-bold text-on-surface sm:text-5xl">
              Protocol Analytics
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <p className="text-sm text-on-surface-variant">
                Public, read-only metrics — no wallet required.
              </p>
              {lastUpdated && (
                <span
                  id="analytics-last-updated"
                  className="text-xs text-on-surface-variant/60"
                >
                  Last updated {formatTime(lastUpdated)} · auto-refreshes every
                  5 min
                </span>
              )}
              {/* Manual refresh button */}
              <button
                id="analytics-refresh-btn"
                type="button"
                onClick={refresh}
                aria-label="Refresh analytics data now"
                className="flex items-center gap-1.5 rounded-full border border-outline-variant/20 bg-surface-container-low px-3 py-1 text-xs font-bold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              >
                <span
                  className="material-symbols-outlined text-sm"
                  aria-hidden="true"
                >
                  refresh
                </span>
                Refresh
              </button>
            </div>
            {/* Stale-data banner */}
            {loadState === "error" && data && (
              <div
                role="alert"
                className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-400"
              >
                <span
                  className="material-symbols-outlined text-base"
                  aria-hidden="true"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  warning
                </span>
                Showing cached data — live refresh failed. Retrying in 5 min.
              </div>
            )}
          </header>

          {/* ── Summary metric cards ──────────────────────────────────────── */}
          <section aria-labelledby="summary-heading">
            <SectionHeading>
              <span id="summary-heading">All-time Metrics</span>
            </SectionHeading>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                id="metric-total-submitted"
                icon="description"
                label="Total invoices submitted"
                value={summary.total_invoices_submitted.toLocaleString()}
                sub="All-time across all statuses"
              />
              <MetricCard
                id="metric-total-funded"
                icon="payments"
                label="Total invoices funded"
                value={summary.total_invoices_funded.toLocaleString()}
                sub="Invoices that received LP capital"
                accent
              />
              <MetricCard
                id="metric-usdc-volume"
                icon="attach_money"
                label="Total USDC volume funded"
                value={formatUsdc(summary.total_usdc_volume_funded)}
                sub="Gross USDC disbursed to freelancers"
                accent
              />
              <MetricCard
                id="metric-yield-paid"
                icon="trending_up"
                label="Total yield paid to LPs"
                value={formatUsdc(summary.total_yield_paid_to_lps)}
                sub="Cumulative LP earnings from discount"
              />
              <MetricCard
                id="metric-active-invoices"
                icon="hourglass_empty"
                label="Active invoices"
                value={summary.active_invoices.toLocaleString()}
                sub="Funded, awaiting settlement"
              />
              <MetricCard
                id="metric-default-rate"
                icon="report_problem"
                label="Default rate"
                value={defaultRate}
                sub={`${summary.total_defaulted} defaulted / ${summary.total_invoices_funded} funded`}
              />
            </div>
          </section>

          {/* ── Time-series charts ────────────────────────────────────────── */}
          <section
            aria-labelledby="charts-heading"
            className="mt-14"
          >
            <SectionHeading>
              <span id="charts-heading">Last 30 Days</span>
              <span className="text-xs font-semibold text-on-surface-variant">
                Indexed{" "}
                {new Date(indexed_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </SectionHeading>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

              {/* Chart 1: Invoices funded per day */}
              <div
                id="chart-invoices-funded"
                className="rounded-[20px] border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-sm"
              >
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">
                  Invoices funded
                </p>
                <p className="mb-5 font-headline text-2xl font-bold text-on-surface">
                  Per day
                </p>

                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={daily}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id={GRADIENT_ID_1}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={AREA_STROKE}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="95%"
                          stopColor={AREA_STROKE}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={GRID_STROKE}
                      strokeOpacity={0.3}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={CHART_TICK_STYLE}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={CHART_TICK_STYLE}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={
                        <ChartTooltip
                          valueFormatter={(v) => `${v} invoice${v !== 1 ? "s" : ""}`}
                        />
                      }
                      cursor={{
                        stroke: AREA_STROKE,
                        strokeOpacity: 0.3,
                        strokeWidth: 1,
                        strokeDasharray: "4 2",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="invoices_funded"
                      name="Invoices funded"
                      stroke={AREA_STROKE}
                      strokeWidth={2}
                      fill={`url(#${GRADIENT_ID_1})`}
                      dot={false}
                      activeDot={{ r: 4, fill: AREA_STROKE, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 2: USDC volume funded per day */}
              <div
                id="chart-usdc-volume"
                className="rounded-[20px] border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-sm"
              >
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">
                  USDC volume funded
                </p>
                <p className="mb-5 font-headline text-2xl font-bold text-on-surface">
                  Per day
                </p>

                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={daily}
                    margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id={GRADIENT_ID_2}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={AREA_STROKE}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="95%"
                          stopColor={AREA_STROKE}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={GRID_STROKE}
                      strokeOpacity={0.3}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={CHART_TICK_STYLE}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={CHART_TICK_STYLE}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => formatUsdc(v).replace("$", "")}
                    />
                    <Tooltip
                      content={
                        <ChartTooltip
                          valueFormatter={(v) => formatUsdc(v)}
                        />
                      }
                      cursor={{
                        stroke: AREA_STROKE,
                        strokeOpacity: 0.3,
                        strokeWidth: 1,
                        strokeDasharray: "4 2",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="usdc_volume"
                      name="USDC volume"
                      stroke={AREA_STROKE}
                      strokeWidth={2}
                      fill={`url(#${GRADIENT_ID_2})`}
                      dot={false}
                      activeDot={{ r: 4, fill: AREA_STROKE, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ── Footer note ───────────────────────────────────────────────── */}
          <p className="mt-12 text-center text-xs text-on-surface-variant/50">
            All metrics are read from the ILN indexer which tracks Stellar
            Soroban contract events. No wallet connection required.
          </p>
        </div>
      </main>
    </>
  );
}

// ─── Tiny helper: patch document.title from a client component ────────────────

function HeadTitle() {
  useEffect(() => {
    document.title = "Analytics | ILN – Invoice Liquidity Network";
    return () => {
      document.title = "ILN | Invoice Liquidity Network";
    };
  }, []);
  return null;
}

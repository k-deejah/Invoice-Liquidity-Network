// ─── Risk score types and helpers ─────────────────────────────────────────────

export type RiskLevel = "Low" | "Medium" | "High" | "Unknown";

export interface PayerScore {
  score: number;
  settled_on_time: number;
  defaults: number;
}

export function scoreToRiskLevel(score: number | null | undefined): RiskLevel {
  if (score === null || score === undefined) return "Unknown";
  if (score >= 70) return "Low";
  if (score >= 40) return "Medium";
  return "High";
}

export const RISK_SORT_ORDER: Record<RiskLevel, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Unknown: 3,
};

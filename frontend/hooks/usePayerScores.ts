import { useState, useEffect, useRef } from "react";
import { Invoice, PayerScoreResult, getPayerScoresBatch } from "../utils/soroban";
import { scoreToRiskLevel, RiskLevel } from "../utils/risk";

export interface PayerRiskMap {
  scores: Map<string, PayerScoreResult | null>;
  risks: Map<string, RiskLevel>;
  loading: boolean;
}

/**
 * Fetches payer scores for all unique payer addresses in the provided invoices.
 * Automatically re-fetches when the set of payers changes.
 */
export function usePayerScores(invoices: Invoice[]): PayerRiskMap {
  const [scores, setScores] = useState<Map<string, PayerScoreResult | null>>(new Map());
  const [loading, setLoading] = useState(false);
  // Track the last set of payers to avoid redundant fetches
  const lastPayersRef = useRef<string>("");

  useEffect(() => {
    const payers = [...new Set(invoices.map((inv) => inv.payer))].sort();
    const key = payers.join(",");
    if (key === lastPayersRef.current || payers.length === 0) return;
    lastPayersRef.current = key;

    let cancelled = false;
    setLoading(true);

    getPayerScoresBatch(payers).then((map) => {
      if (!cancelled) {
        setScores(map);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [invoices]);

  const risks = new Map<string, RiskLevel>();
  scores.forEach((score, addr) => {
    risks.set(addr, scoreToRiskLevel(score?.score));
  });

  return { scores, risks, loading };
}

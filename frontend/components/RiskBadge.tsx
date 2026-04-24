"use client";

import React, { useState, useRef, useEffect } from "react";
import { RiskLevel, PayerScore } from "../utils/risk";

interface RiskBadgeProps {
  risk: RiskLevel;
  score: PayerScore | null;
}

const BADGE_STYLES: Record<RiskLevel, { pill: string; dot: string }> = {
  Low:     { pill: "bg-green-500/10 text-green-600 border-green-500/30",  dot: "bg-green-500" },
  Medium:  { pill: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30", dot: "bg-yellow-500" },
  High:    { pill: "bg-red-500/10 text-red-600 border-red-500/30",        dot: "bg-red-500" },
  Unknown: { pill: "bg-gray-400/10 text-gray-500 border-gray-400/30",     dot: "bg-gray-400" },
};

export default function RiskBadge({ risk, score }: RiskBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const { pill, dot } = BADGE_STYLES[risk];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`Risk level: ${risk}. Click for details.`}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all hover:scale-105 active:scale-95 ${pill}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {risk}
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-surface-container-highest rounded-xl shadow-xl border border-outline-variant p-4 text-sm animate-in fade-in zoom-in duration-150"
        >
          {/* Caret */}
          <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-surface-container-highest border-r border-b border-outline-variant rotate-45" />

          <p className="font-black text-on-surface mb-3">Payer Risk Details</p>

          {score ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Payer score</span>
                <span className="font-bold text-on-surface">{score.score}/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Settled on time</span>
                <span className="font-bold text-green-600">{score.settled_on_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Defaults</span>
                <span className="font-bold text-red-500">{score.defaults}</span>
              </div>
              {/* Score bar */}
              <div className="mt-3 h-1.5 bg-surface-dim rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    risk === "Low" ? "bg-green-500" : risk === "Medium" ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${score.score}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-on-surface-variant italic">No on-chain history found for this payer.</p>
          )}

          <p className="text-[10px] text-on-surface-variant mt-3 border-t border-outline-variant pt-2">
            Score based on on-chain history only
          </p>
        </div>
      )}
    </div>
  );
}

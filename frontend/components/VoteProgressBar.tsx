"use client";

import { votePercent } from "../utils/governance";

interface VoteProgressBarProps {
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorumRequired: number;
  compact?: boolean;
}

export default function VoteProgressBar({
  votesFor,
  votesAgainst,
  votesAbstain,
  quorumRequired,
  compact = false,
}: VoteProgressBarProps) {
  const total = votesFor + votesAgainst + votesAbstain;
  const forPct = votePercent(votesFor, total);
  const againstPct = votePercent(votesAgainst, total);
  const abstainPct = votePercent(votesAbstain, total);
  const quorumPct = Math.min((total / quorumRequired) * 100, 100);
  const quorumReached = total >= quorumRequired;

  function fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toLocaleString();
  }

  if (compact) {
    return (
      <div className="space-y-1.5">
        {/* Stacked bar */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${forPct}%` }}
          />
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${againstPct}%` }}
          />
          <div
            className="bg-surface-dim transition-all duration-500"
            style={{ width: `${abstainPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            {forPct}% For
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            {againstPct}% Against
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-outline" />
            {abstainPct}% Abstain
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* For */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-emerald-500">Vote For</span>
          <span className="text-sm text-on-surface-variant">
            {fmt(votesFor)} ILN &middot; {forPct}%
          </span>
        </div>
        <div className="h-3 w-full rounded-full bg-surface-container-high overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${forPct}%` }}
          />
        </div>
      </div>

      {/* Against */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-red-500">Vote Against</span>
          <span className="text-sm text-on-surface-variant">
            {fmt(votesAgainst)} ILN &middot; {againstPct}%
          </span>
        </div>
        <div className="h-3 w-full rounded-full bg-surface-container-high overflow-hidden">
          <div
            className="h-full rounded-full bg-red-500 transition-all duration-700"
            style={{ width: `${againstPct}%` }}
          />
        </div>
      </div>

      {/* Abstain */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-on-surface-variant">Abstain</span>
          <span className="text-sm text-on-surface-variant">
            {fmt(votesAbstain)} ILN &middot; {abstainPct}%
          </span>
        </div>
        <div className="h-3 w-full rounded-full bg-surface-container-high overflow-hidden">
          <div
            className="h-full rounded-full bg-outline transition-all duration-700"
            style={{ width: `${abstainPct}%` }}
          />
        </div>
      </div>

      {/* Quorum indicator */}
      <div className="pt-1 border-t border-outline-variant/20">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-on-surface-variant flex items-center gap-1.5">
            <span
              className={`material-symbols-outlined text-[14px] ${
                quorumReached ? "text-emerald-500" : "text-on-surface-variant"
              }`}
            >
              {quorumReached ? "check_circle" : "radio_button_unchecked"}
            </span>
            Quorum {quorumReached ? "reached" : "not yet reached"}
          </span>
          <span className="text-xs text-on-surface-variant">
            {fmt(total)} / {fmt(quorumRequired)} ILN
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              quorumReached ? "bg-primary" : "bg-primary/50"
            }`}
            style={{ width: `${quorumPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

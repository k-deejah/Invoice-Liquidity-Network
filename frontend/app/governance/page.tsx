"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
import VoteProgressBar from "../../components/VoteProgressBar";
import {
    Proposal,
    ProposalStatus,
    fetchProposals,
    timeRemaining,
    totalVotes,
} from "../../utils/governance";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProposalStatus }) {
  const config: Record<ProposalStatus, { color: string; icon: string }> = {
    Active: { color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: "fiber_manual_record" },
    Passed: { color: "bg-primary/15 text-primary border-primary/30", icon: "check_circle" },
    Failed: { color: "bg-red-500/15 text-red-500 border-red-500/30", icon: "cancel" },
    Executed: { color: "bg-purple-500/15 text-purple-500 border-purple-500/30", icon: "rocket_launch" },
    Pending: { color: "bg-amber-500/15 text-amber-500 border-amber-500/30", icon: "schedule" },
  };
  const { color, icon } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${color}`}
    >
      <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
        {icon}
      </span>
      {status}
    </span>
  );
}

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: Proposal["type"] }) {
  const label: Record<Proposal["type"], string> = {
    ParameterUpdate: "Parameter",
    ProtocolUpgrade: "Upgrade",
    TextProposal: "Signal",
  };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
      {label[type]}
    </span>
  );
}

// ─── Proposal card ────────────────────────────────────────────────────────────

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const total = totalVotes(proposal);
  const remaining = timeRemaining(proposal);

  return (
    <Link
      href={`/governance/${proposal.id}`}
      className="group block rounded-2xl border border-outline-variant/20 bg-surface-container-lowest hover:border-primary/40 hover:shadow-lg transition-all duration-200 p-6"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={proposal.type} />
          <StatusBadge status={proposal.status} />
        </div>
        <span className="text-xs text-on-surface-variant shrink-0">#{proposal.id}</span>
      </div>

      <h3 className="text-base font-semibold text-on-surface group-hover:text-primary transition-colors mb-2 leading-snug">
        {proposal.title}
      </h3>
      <p className="text-sm text-on-surface-variant line-clamp-2 mb-4 leading-relaxed">
        {proposal.description}
      </p>

      <VoteProgressBar
        votesFor={proposal.votesFor}
        votesAgainst={proposal.votesAgainst}
        votesAbstain={proposal.votesAbstain}
        quorumRequired={proposal.quorumRequired}
        compact
      />

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-outline-variant/10">
        <span className="text-xs text-on-surface-variant">
          {total.toLocaleString()} ILN voted
        </span>
        {remaining && (
          <span className="text-xs font-medium text-amber-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">schedule</span>
            {remaining}
          </span>
        )}
        {proposal.status === "Passed" && (
          <span className="text-xs font-medium text-primary flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">pending_actions</span>
            Ready to execute
          </span>
        )}
        {proposal.status === "Executed" && (
          <span className="text-xs font-medium text-purple-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">rocket_launch</span>
            Executed
          </span>
        )}
        {proposal.status === "Failed" && (
          <span className="text-xs font-medium text-red-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">cancel</span>
            Did not pass
          </span>
        )}
      </div>
    </Link>
  );
}

// ─── Filter tab ───────────────────────────────────────────────────────────────

const FILTERS: Array<ProposalStatus | "All"> = ["All", "Active", "Passed", "Failed", "Executed", "Pending"];

function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active: ProposalStatus | "All";
  onChange: (f: ProposalStatus | "All") => void;
  counts: Record<ProposalStatus | "All", number>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
            active === f
              ? "bg-primary text-white border-primary"
              : "bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-primary/40 hover:text-primary"
          }`}
        >
          {f}
          <span
            className={`ml-1.5 text-xs ${active === f ? "text-white/70" : "text-on-surface-variant/60"}`}
          >
            {counts[f]}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GovernancePage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProposalStatus | "All">("All");

  const load = useCallback(async () => {
    const data = await fetchProposals();
    setProposals(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Refresh every 30 s for real-time vote counts
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered =
    filter === "All" ? proposals : proposals.filter((p) => p.status === filter);

  const counts = FILTERS.reduce(
    (acc, f) => {
      acc[f] =
        f === "All" ? proposals.length : proposals.filter((p) => p.status === f).length;
      return acc;
    },
    {} as Record<ProposalStatus | "All", number>
  );

  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Hero banner */}
      <section className="pt-32 pb-12 px-8 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">
                ILN Governance
              </p>
              <h1 className="text-4xl md:text-5xl font-headline mb-3">Proposals</h1>
              <p className="text-on-surface-variant max-w-xl text-base leading-relaxed">
                Shape the future of the protocol. Review active proposals and cast your vote using your ILN token balance.
              </p>
            </div>
            <Link
              href="/governance/new"
              className="shrink-0 inline-flex items-center gap-2 bg-primary text-white px-5 py-3 rounded-xl text-sm font-bold shadow-md hover:bg-primary/90 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Create Proposal
            </Link>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      {!loading && (
        <section className="bg-surface-container py-5 px-8 border-b border-outline-variant/10">
          <div className="max-w-7xl mx-auto flex flex-wrap gap-8">
            {[
              { label: "Total Proposals", value: proposals.length },
              { label: "Active", value: counts["Active"] },
              { label: "Passed", value: counts["Passed"] },
              { label: "Executed", value: counts["Executed"] },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-2xl font-bold text-on-surface">{value}</p>
                <p className="text-xs text-on-surface-variant">{label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main content */}
      <section className="py-12 px-8">
        <div className="max-w-7xl mx-auto">
          {/* Filter tabs */}
          <div className="mb-8">
            <FilterTabs active={filter} onChange={setFilter} counts={counts} />
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 rounded-2xl bg-surface-container animate-pulse"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 block mb-4">
                inbox
              </span>
              <p className="text-on-surface-variant">No {filter !== "All" ? filter.toLowerCase() : ""} proposals yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filtered.map((p) => (
                <ProposalCard key={p.id} proposal={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Footer from "../../../components/Footer";
import Navbar from "../../../components/Navbar";
import VoteProgressBar from "../../../components/VoteProgressBar";
import { useToast } from "../../../context/ToastContext";
import { useWallet } from "../../../context/WalletContext";
import {
    Proposal,
    ProposalStatus,
    VoteChoice,
    castVote,
    executeProposal,
    fetchProposal,
    formatVotingPower,
    getVotingPower,
    quorumReached,
    timeRemaining,
    totalVotes,
} from "../../../utils/governance";

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
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${color}`}
    >
      <span
        className="material-symbols-outlined text-[14px]"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {icon}
      </span>
      {status}
    </span>
  );
}

// ─── Proposal type label ──────────────────────────────────────────────────────

function TypePill({ type }: { type: Proposal["type"] }) {
  const label: Record<Proposal["type"], { text: string; icon: string }> = {
    ParameterUpdate: { text: "Parameter Update", icon: "tune" },
    ProtocolUpgrade: { text: "Protocol Upgrade", icon: "upgrade" },
    TextProposal: { text: "Signal / Text", icon: "record_voice_over" },
  };
  const { text, icon } = label[type];
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-surface-container text-on-surface-variant border border-outline-variant/30">
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {text}
    </span>
  );
}

// ─── Vote button ──────────────────────────────────────────────────────────────

function VoteButton({
  choice,
  selected,
  disabled,
  onClick,
}: {
  choice: VoteChoice;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const styles: Record<VoteChoice, { base: string; active: string; icon: string }> = {
    For: {
      base: "border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10",
      active: "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20",
      icon: "thumb_up",
    },
    Against: {
      base: "border-red-500/40 text-red-500 hover:bg-red-500/10",
      active: "bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20",
      icon: "thumb_down",
    },
    Abstain: {
      base: "border-outline text-on-surface-variant hover:bg-surface-container-high",
      active: "bg-outline text-white border-outline shadow-lg",
      icon: "do_not_disturb",
    },
  };
  const s = styles[choice];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 font-semibold text-sm transition-all duration-200 active:scale-95
        ${selected ? s.active : s.base}
        ${disabled ? "opacity-40 cursor-not-allowed" : ""}
      `}
    >
      <span className="material-symbols-outlined text-[22px]" style={selected ? { fontVariationSettings: "'FILL' 1" } : {}}>
        {s.icon}
      </span>
      {choice}
    </button>
  );
}

// ─── Parameter change table ───────────────────────────────────────────────────

function ParameterChangeTable({ changes }: { changes: NonNullable<Proposal["parameterChanges"]> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-container text-on-surface-variant">
            <th className="text-left px-4 py-3 font-semibold">Parameter</th>
            <th className="text-left px-4 py-3 font-semibold">Current Value</th>
            <th className="text-left px-4 py-3 font-semibold">Proposed Value</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c, i) => (
            <tr
              key={i}
              className="border-t border-outline-variant/10 bg-surface-container-lowest"
            >
              <td className="px-4 py-3 font-mono text-primary">{c.parameter}</td>
              <td className="px-4 py-3 text-on-surface-variant">{c.currentValue}</td>
              <td className="px-4 py-3 font-semibold text-emerald-500">{c.newValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProposalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { address, isConnected, connect } = useWallet();
  const { addToast, updateToast } = useToast();

  const proposalId = Number(params.id);

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [votingPower, setVotingPower] = useState<number>(0);
  const [selectedVote, setSelectedVote] = useState<VoteChoice | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const { signTx } = useWallet();

  const load = useCallback(async () => {
    const data = await fetchProposal(proposalId);
    if (!data) {
      router.replace("/governance");
      return;
    }
    setProposal(data);
    setLoading(false);
  }, [proposalId, router]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (isConnected && address) {
      getVotingPower(address).then(setVotingPower);
    }
  }, [isConnected, address]);

  const handleVote = async () => {
    if (!selectedVote || !proposal || !address) return;

    setIsVoting(true);
    const toastId = addToast({ type: "pending", title: `Casting vote: ${selectedVote}…` });
    try {
      const txHash = await castVote(proposal.id, selectedVote, address, signTx);
      updateToast(toastId, {
        type: "success",
        title: "Vote submitted",
        txHash,
      });
      // Re-fetch to reflect updated counts
      await load();
    } catch (err) {
      updateToast(toastId, {
        type: "error",
        title: "Vote failed",
        message: err instanceof Error ? err.message : "Transaction rejected",
      });
    } finally {
      setIsVoting(false);
    }
  };

  const handleExecute = async () => {
    if (!proposal || !address) return;

    setIsExecuting(true);
    const toastId = addToast({ type: "pending", title: "Executing proposal…" });
    try {
      const txHash = await executeProposal(proposal.id, address, signTx);
      updateToast(toastId, {
        type: "success",
        title: "Proposal executed",
        txHash,
      });
      await load();
    } catch (err) {
      updateToast(toastId, {
        type: "error",
        title: "Execution failed",
        message: err instanceof Error ? err.message : "Transaction rejected",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // ─── Derived state ──────────────────────────────────────────────────────────

  const alreadyVoted = !!proposal?.userVote;
  const isActive = proposal?.status === "Active";
  const isPassed = proposal?.status === "Passed";
  const canVote = isActive && !alreadyVoted && isConnected && votingPower > 0;
  const canExecute = isPassed && isConnected;
  const voteButtonsDisabled = !canVote || isVoting;

  const remaining = proposal ? timeRemaining(proposal) : "";
  const total = proposal ? totalVotes(proposal) : 0;
  const quorum = proposal ? quorumReached(proposal) : false;

  // ─── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-28 pb-20 px-8 max-w-7xl mx-auto animate-pulse space-y-6">
          <div className="h-6 w-24 bg-surface-container rounded-full" />
          <div className="h-10 w-2/3 bg-surface-container rounded-xl" />
          <div className="h-4 w-full bg-surface-container rounded" />
          <div className="h-4 w-3/4 bg-surface-container rounded" />
        </div>
      </main>
    );
  }

  if (!proposal) return null;

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-28 pb-20 px-8">
        <div className="max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <nav className="mb-8">
            <Link
              href="/governance"
              className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              All Proposals
            </Link>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ─── Left: Details ────────────────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header */}
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <TypePill type={proposal.type} />
                  <StatusBadge status={proposal.status} />
                  <span className="text-sm text-on-surface-variant ml-auto">
                    Proposal #{proposal.id}
                  </span>
                </div>
                <h1 className="text-3xl md:text-4xl font-headline leading-tight mb-3">
                  {proposal.title}
                </h1>
                <p className="text-sm text-on-surface-variant">
                  Proposed by{" "}
                  <span className="font-mono text-primary">{proposal.proposer}</span>
                </p>
              </div>

              {/* Description */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">description</span>
                  Description
                </h2>
                <p className="text-on-surface-variant leading-relaxed">{proposal.description}</p>
              </div>

              {/* Parameter changes */}
              {proposal.parameterChanges && proposal.parameterChanges.length > 0 && (
                <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
                    Parameter Changes
                  </h2>
                  <ParameterChangeTable changes={proposal.parameterChanges} />
                </div>
              )}

              {/* Timeline */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">timeline</span>
                  Timeline
                </h2>
                <ol className="relative border-l border-outline-variant/30 ml-2 space-y-5">
                  {[
                    {
                      label: "Proposal submitted",
                      ts: proposal.createdAt,
                      done: true,
                      icon: "edit",
                    },
                    {
                      label: "Voting opened",
                      ts: proposal.votingStartsAt,
                      done: Date.now() / 1000 >= proposal.votingStartsAt,
                      icon: "how_to_vote",
                    },
                    {
                      label: "Voting closes",
                      ts: proposal.votingEndsAt,
                      done: Date.now() / 1000 >= proposal.votingEndsAt,
                      icon: "lock_clock",
                    },
                    ...(proposal.executableAfter
                      ? [
                          {
                            label: "Timelock expires — executable",
                            ts: proposal.executableAfter,
                            done: Date.now() / 1000 >= proposal.executableAfter,
                            icon: "rocket_launch",
                          },
                        ]
                      : []),
                  ].map((step, i) => (
                    <li key={i} className="ml-5">
                      <span
                        className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full border ${
                          step.done
                            ? "bg-primary border-primary text-white"
                            : "bg-surface-container border-outline-variant text-on-surface-variant"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]" style={step.done ? { fontVariationSettings: "'FILL' 1" } : {}}>
                          {step.icon}
                        </span>
                      </span>
                      <p className={`text-sm font-medium ${step.done ? "text-on-surface" : "text-on-surface-variant"}`}>
                        {step.label}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {new Date(step.ts * 1000).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* ─── Right: Voting panel ──────────────────────────────────────── */}
            <div className="space-y-5">
              {/* Vote breakdown */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
                <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">bar_chart</span>
                  Vote Breakdown
                </h2>
                <p className="text-xs text-on-surface-variant mb-5">
                  {total.toLocaleString()} ILN total &middot;{" "}
                  {quorum ? (
                    <span className="text-emerald-500">Quorum reached</span>
                  ) : (
                    <span className="text-amber-500">Quorum not yet reached</span>
                  )}
                </p>
                <VoteProgressBar
                  votesFor={proposal.votesFor}
                  votesAgainst={proposal.votesAgainst}
                  votesAbstain={proposal.votesAbstain}
                  quorumRequired={proposal.quorumRequired}
                />
              </div>

              {/* Time remaining */}
              {isActive && remaining && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-amber-500">schedule</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-500">Voting in progress</p>
                    <p className="text-xs text-on-surface-variant">{remaining}</p>
                  </div>
                </div>
              )}

              {/* Voting power */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                  Your Voting Power
                </p>
                {isConnected ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-primary">
                      {formatVotingPower(votingPower)}
                    </span>
                    {votingPower === 0 && (
                      <span className="text-xs text-on-surface-variant">(no voting power)</span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={connect}
                    className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all"
                  >
                    Connect wallet to vote
                  </button>
                )}
              </div>

              {/* Cast vote */}
              {isActive && (
                <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold mb-0.5">Cast Your Vote</h2>
                    {alreadyVoted ? (
                      <p className="text-xs text-on-surface-variant">
                        You voted{" "}
                        <span
                          className={`font-bold ${
                            proposal.userVote === "For"
                              ? "text-emerald-500"
                              : proposal.userVote === "Against"
                              ? "text-red-500"
                              : "text-on-surface-variant"
                          }`}
                        >
                          {proposal.userVote}
                        </span>
                      </p>
                    ) : !isConnected ? (
                      <p className="text-xs text-on-surface-variant">Connect your wallet to vote.</p>
                    ) : votingPower === 0 ? (
                      <p className="text-xs text-on-surface-variant">
                        You need ILN tokens to vote.
                      </p>
                    ) : (
                      <p className="text-xs text-on-surface-variant">Select your stance below.</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {(["For", "Against", "Abstain"] as VoteChoice[]).map((choice) => (
                      <VoteButton
                        key={choice}
                        choice={choice}
                        selected={
                          alreadyVoted
                            ? proposal.userVote === choice
                            : selectedVote === choice
                        }
                        disabled={voteButtonsDisabled || alreadyVoted}
                        onClick={() => !alreadyVoted && setSelectedVote(choice)}
                      />
                    ))}
                  </div>

                  {!alreadyVoted && isConnected && votingPower > 0 && (
                    <button
                      onClick={handleVote}
                      disabled={!selectedVote || isVoting}
                      className={`w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                        selectedVote && !isVoting
                          ? "bg-primary text-white hover:bg-primary/90 shadow-md"
                          : "bg-surface-container text-on-surface-variant cursor-not-allowed"
                      }`}
                    >
                      {isVoting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="animate-spin material-symbols-outlined text-[16px]">
                            progress_activity
                          </span>
                          Submitting…
                        </span>
                      ) : selectedVote ? (
                        `Confirm: Vote ${selectedVote}`
                      ) : (
                        "Select a choice above"
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Execute button (Passed proposals) */}
              {isPassed && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                    <p className="text-sm font-semibold">Proposal passed — ready to execute</p>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    The timelock delay has elapsed. Anyone can now trigger on-chain execution.
                  </p>
                  {isConnected ? (
                    <button
                      onClick={handleExecute}
                      disabled={isExecuting}
                      className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all shadow-md disabled:opacity-50"
                    >
                      {isExecuting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="animate-spin material-symbols-outlined text-[16px]">
                            progress_activity
                          </span>
                          Executing…
                        </span>
                      ) : (
                        "Execute Proposal"
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={connect}
                      className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all"
                    >
                      Connect wallet to execute
                    </button>
                  )}
                </div>
              )}

              {/* Executed state */}
              {proposal.status === "Executed" && (
                <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 px-5 py-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-purple-500" style={{ fontVariationSettings: "'FILL' 1" }}>
                    verified
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-purple-500">Executed on-chain</p>
                    <p className="text-xs text-on-surface-variant">
                      Changes are live on the protocol.
                    </p>
                  </div>
                </div>
              )}

              {/* Failed state */}
              {proposal.status === "Failed" && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-red-500" style={{ fontVariationSettings: "'FILL' 1" }}>
                    cancel
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-red-500">Proposal failed</p>
                    <p className="text-xs text-on-surface-variant">
                      {quorum ? "Did not achieve majority." : "Did not reach quorum."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}

"use client";

import { rpc } from "@stellar/stellar-sdk";
import { useCallback, useEffect, useState } from "react";
import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
import { RPC_URL } from "../../constants";
import { useToast } from "../../context/ToastContext";
import { useWallet } from "../../context/WalletContext";
import { formatAddress, formatDate, formatUSDC } from "../../utils/format";
import { getAllInvoices, Invoice, markPaid } from "../../utils/soroban";

const server = new rpc.Server(RPC_URL);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysRemaining(dueDateTimestamp: bigint): number {
  const nowMs = Date.now();
  const dueMs = Number(dueDateTimestamp) * 1000;
  return Math.ceil((dueMs - nowMs) / (1000 * 60 * 60 * 24));
}

function isOverdue(dueDateTimestamp: bigint): boolean {
  return daysRemaining(dueDateTimestamp) < 0;
}

function DaysChip({ due_date }: { due_date: bigint }) {
  const days = daysRemaining(due_date);
  const overdue = days < 0;
  const urgent = days >= 0 && days <= 3;

  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/15 text-red-500 border border-red-500/30 text-xs font-semibold">
        <span
          className="material-symbols-outlined text-[12px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          warning
        </span>
        {Math.abs(days)}d overdue
      </span>
    );
  }
  if (urgent) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 text-xs font-semibold">
        <span className="material-symbols-outlined text-[12px]">schedule</span>
        {days}d left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container border border-outline-variant/20 text-on-surface-variant text-xs font-medium">
      <span className="material-symbols-outlined text-[12px]">event</span>
      {days}d left
    </span>
  );
}

// ─── Settle confirmation modal ────────────────────────────────────────────────

interface SettleModalProps {
  invoice: Invoice;
  isSettling: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function SettleConfirmModal({
  invoice,
  isSettling,
  onConfirm,
  onCancel,
}: SettleModalProps) {
  const overdue = isOverdue(invoice.due_date);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/20 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-outline-variant/10">
          <h4 className="text-xl font-bold flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary text-[22px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              payments
            </span>
            Settle Invoice #{invoice.id.toString()}
          </h4>
          <p className="text-sm text-on-surface-variant mt-1">
            Review the details before confirming.
          </p>
        </div>

        {/* Overdue warning */}
        {overdue && (
          <div className="mx-6 mt-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 flex items-start gap-2 text-xs text-red-500">
            <span
              className="material-symbols-outlined text-[16px] mt-0.5 shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              warning
            </span>
            <span>
              This invoice is{" "}
              <strong>{Math.abs(daysRemaining(invoice.due_date))} days overdue.</strong>{" "}
              Settling now clears your obligation.
            </span>
          </div>
        )}

        {/* Details */}
        <div className="p-6 space-y-3">
          <div className="rounded-xl bg-surface-container p-4 space-y-3 text-sm">
            <Row label="Invoice ID" value={`#${invoice.id.toString()}`} mono />
            <Row label="Freelancer" value={formatAddress(invoice.freelancer)} mono />
            <Row label="Due Date" value={formatDate(invoice.due_date)} />
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
              Payment summary
            </p>
            <Row label="Amount you will send" value={formatUSDC(invoice.amount)} bold />
            <p className="text-xs text-on-surface-variant pt-1">
              USDC will be transferred from your wallet to the contract, which
              immediately releases it to the liquidity provider.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            disabled={isSettling}
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold text-sm border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={isSettling}
            onClick={onConfirm}
            className="flex-[2] py-3 rounded-xl font-bold text-sm bg-primary text-white hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
          >
            {isSettling ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Settling…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                Confirm & Settle
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-on-surface-variant">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${bold ? "font-bold text-base" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ connected }: { connected: boolean }) {
  if (!connected) {
    return (
      <div className="text-center py-24">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 block mb-4">
          account_balance_wallet
        </span>
        <p className="text-on-surface-variant font-medium">
          Connect your wallet to view your invoices
        </p>
      </div>
    );
  }
  return (
    <div className="text-center py-24">
      <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 block mb-4">
        receipt_long
      </span>
      <p className="text-on-surface-variant font-medium">No funded invoices assigned to your address</p>
      <p className="text-sm text-on-surface-variant/60 mt-1">
        Invoices where you are the payer will appear here once funded.
      </p>
    </div>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-6 py-5">
          <div className="h-4 bg-surface-container rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Sort header ──────────────────────────────────────────────────────────────

function SortTh({
  label,
  sortKey,
  activeSortKey,
  sortOrder,
  onSort,
}: {
  label: string;
  sortKey: keyof Invoice;
  activeSortKey: keyof Invoice;
  sortOrder: "asc" | "desc";
  onSort: (k: keyof Invoice) => void;
}) {
  const active = sortKey === activeSortKey;
  return (
    <th
      className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider cursor-pointer select-none hover:text-primary transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="material-symbols-outlined text-[13px]">
          {active ? (sortOrder === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
        </span>
      </span>
    </th>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayerDashboard() {
  const { address, isConnected, connect, signTx } = useWallet();
  const { addToast, updateToast } = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [justPaid, setJustPaid] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<keyof Invoice>("due_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const fetchData = useCallback(async () => {
    if (!isConnected || !address) return;
    setLoading(true);
    try {
      const all = await getAllInvoices();
      setInvoices(all);
    } catch (err) {
      console.error("Failed to fetch invoices", err);
    } finally {
      setLoading(false);
    }
  }, [isConnected, address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived invoice list ──────────────────────────────────────────────────
  const myInvoices = invoices.filter(
    (inv) =>
      inv.payer === address &&
      (inv.status === "Funded" || justPaid.has(inv.id.toString()))
  );

  const sortedInvoices = [...myInvoices].sort((a: any, b: any) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av < bv) return sortOrder === "asc" ? -1 : 1;
    if (av > bv) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const overdueCount = myInvoices.filter((inv) => isOverdue(inv.due_date)).length;
  const totalOwed = myInvoices.reduce(
    (sum, inv) => (justPaid.has(inv.id.toString()) ? sum : sum + inv.amount),
    BigInt(0)
  );

  const toggleSort = (key: keyof Invoice) => {
    if (sortKey === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  // ── Settle handler ────────────────────────────────────────────────────────
  const confirmSettle = async () => {
    if (!selectedInvoice || !address) return;

    setIsSettling(true);
    const toastId = addToast({
      type: "pending",
      title: `Settling Invoice #${selectedInvoice.id}…`,
    });

    try {
      const tx = await markPaid(address, selectedInvoice.id);
      const signedXdr = await signTx(tx.toXDR());

      const sendResult = await server.sendTransaction(
        rpc.Transaction.fromXDR(signedXdr, "Test SDF Network ; September 2015")
      );

      if (sendResult.status === "PENDING") {
        let txStatus = await server.getTransaction(sendResult.hash);
        while (txStatus.status === "NOT_FOUND") {
          await new Promise((r) => setTimeout(r, 1000));
          txStatus = await server.getTransaction(sendResult.hash);
        }

        if (txStatus.status === "SUCCESS") {
          updateToast(toastId, {
            type: "success",
            title: `Invoice #${selectedInvoice.id} settled`,
            txHash: sendResult.hash,
          });

          // Optimistic UI: mark paid locally before re-fetch
          setJustPaid((prev) => new Set(prev).add(selectedInvoice.id.toString()));
          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === selectedInvoice.id ? { ...inv, status: "Paid" } : inv
            )
          );
          setSelectedInvoice(null);

          // Background refresh
          fetchData();
        } else {
          throw new Error(`Transaction failed: ${txStatus.status}`);
        }
      } else {
        throw new Error(`Failed to send transaction: ${sendResult.status}`);
      }
    } catch (err: any) {
      updateToast(toastId, {
        type: "error",
        title: "Settlement failed",
        message: err.message || "An unknown error occurred",
      });
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <main className="min-h-screen">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-10 px-8 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">
                Payer Dashboard
              </p>
              <h1 className="text-4xl md:text-5xl font-headline mb-3">
                My Invoices
              </h1>
              <p className="text-on-surface-variant max-w-xl text-base leading-relaxed">
                Funded invoices assigned to your address. Settle them on-chain
                with a single click using your Freighter wallet.
              </p>
            </div>

            {isConnected ? (
              <button
                onClick={fetchData}
                disabled={loading}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-medium text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${loading ? "animate-spin" : ""}`}
                >
                  refresh
                </span>
                Refresh
              </button>
            ) : (
              <button
                onClick={connect}
                className="shrink-0 inline-flex items-center gap-2 bg-primary text-white px-5 py-3 rounded-xl text-sm font-bold shadow-md hover:bg-primary/90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────────────── */}
      {isConnected && !loading && myInvoices.length > 0 && (
        <section className="bg-surface-container py-5 px-8 border-b border-outline-variant/10">
          <div className="max-w-7xl mx-auto flex flex-wrap gap-10">
            <div>
              <p className="text-2xl font-bold text-on-surface">{myInvoices.length}</p>
              <p className="text-xs text-on-surface-variant">Pending invoices</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-on-surface">{formatUSDC(totalOwed)}</p>
              <p className="text-xs text-on-surface-variant">Total outstanding</p>
            </div>
            {overdueCount > 0 && (
              <div>
                <p className="text-2xl font-bold text-red-500">{overdueCount}</p>
                <p className="text-xs text-on-surface-variant">Overdue</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Overdue banner ────────────────────────────────────────────────── */}
      {isConnected && !loading && overdueCount > 0 && (
        <div className="px-8 pt-6 max-w-7xl mx-auto">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 flex items-center gap-3">
            <span
              className="material-symbols-outlined text-red-500 text-[22px] shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              error
            </span>
            <div>
              <p className="text-sm font-semibold text-red-500">
                {overdueCount} overdue invoice{overdueCount > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-on-surface-variant">
                These invoices have passed their due date. Settle them to avoid further
                complications.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Main table ───────────────────────────────────────────────────── */}
      <section className="py-8 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider">
                      Freelancer
                    </th>
                    <SortTh
                      label="Amount Owed"
                      sortKey="amount"
                      activeSortKey={sortKey}
                      sortOrder={sortOrder}
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="Due Date"
                      sortKey="due_date"
                      activeSortKey={sortKey}
                      sortOrder={sortOrder}
                      onSort={toggleSort}
                    />
                    <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {!isConnected ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState connected={false} />
                      </td>
                    </tr>
                  ) : loading ? (
                    <>
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                    </>
                  ) : sortedInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState connected={true} />
                      </td>
                    </tr>
                  ) : (
                    sortedInvoices.map((invoice) => {
                      const overdue = isOverdue(invoice.due_date);
                      const paid =
                        invoice.status === "Paid" ||
                        justPaid.has(invoice.id.toString());

                      return (
                        <tr
                          key={invoice.id.toString()}
                          className={`transition-colors ${
                            overdue && !paid
                              ? "bg-red-500/[0.03] hover:bg-red-500/[0.06]"
                              : "hover:bg-surface-container/50"
                          }`}
                        >
                          {/* ID */}
                          <td className="px-6 py-5">
                            <span className={`font-bold text-sm ${overdue && !paid ? "text-red-500" : "text-primary"}`}>
                              #{invoice.id.toString()}
                            </span>
                          </td>

                          {/* Freelancer */}
                          <td className="px-6 py-5">
                            <span className="text-sm font-mono text-on-surface-variant">
                              {formatAddress(invoice.freelancer)}
                            </span>
                          </td>

                          {/* Amount */}
                          <td className="px-6 py-5">
                            <span className={`font-bold text-sm ${overdue && !paid ? "text-red-500" : "text-on-surface"}`}>
                              {formatUSDC(invoice.amount)}
                            </span>
                          </td>

                          {/* Due date + days remaining */}
                          <td className="px-6 py-5">
                            <div className="flex flex-col gap-1.5">
                              <span className="text-sm text-on-surface">
                                {formatDate(invoice.due_date)}
                              </span>
                              {!paid && <DaysChip due_date={invoice.due_date} />}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-6 py-5">
                            {paid ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-xs font-semibold">
                                <span
                                  className="material-symbols-outlined text-[12px]"
                                  style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                  check_circle
                                </span>
                                Paid
                              </span>
                            ) : overdue ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-500 border border-red-500/30 text-xs font-semibold">
                                <span
                                  className="material-symbols-outlined text-[12px]"
                                  style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                  error
                                </span>
                                Overdue
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 text-xs font-semibold">
                                <span
                                  className="material-symbols-outlined text-[12px]"
                                  style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                  pending
                                </span>
                                Funded
                              </span>
                            )}
                          </td>

                          {/* Action */}
                          <td className="px-6 py-5 text-right">
                            {paid ? (
                              <span className="text-xs text-on-surface-variant flex items-center justify-end gap-1">
                                <span className="material-symbols-outlined text-[14px] text-emerald-500">
                                  task_alt
                                </span>
                                Settled
                              </span>
                            ) : (
                              <button
                                onClick={() => setSelectedInvoice(invoice)}
                                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-sm ${
                                  overdue
                                    ? "bg-red-500 text-white hover:bg-red-600"
                                    : "bg-primary text-white hover:bg-primary/90"
                                }`}
                              >
                                <span className="material-symbols-outlined text-[14px]">payments</span>
                                Settle
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      {/* ── Settle modal ─────────────────────────────────────────────────── */}
      {selectedInvoice && (
        <SettleConfirmModal
          invoice={selectedInvoice}
          isSettling={isSettling}
          onConfirm={confirmSettle}
          onCancel={() => !isSettling && setSelectedInvoice(null)}
        />
      )}
    </main>
  );
}

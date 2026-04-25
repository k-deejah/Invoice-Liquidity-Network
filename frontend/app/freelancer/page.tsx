"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import InvoiceFilterBar from "../../components/InvoiceFilterBar";
import { useWallet } from "../../context/WalletContext";
import { useToast } from "../../context/ToastContext";
import { useApprovedTokens } from "../../hooks/useApprovedTokens";
import { applyInvoiceFilters, useInvoiceFilters } from "../../hooks/useInvoiceFilters";
import {
  getAllInvoices,
  submitInvoice,
  Invoice,
} from "../../utils/soroban";
import {
  formatUSDC,
  formatAddress,
  formatDate,
} from "../../utils/format";
import { rpc, TransactionBuilder } from "@stellar/stellar-sdk";
import { RPC_URL, NETWORK_PASSPHRASE } from "../../constants";
import SkeletonRow, { FREELANCER_COLUMNS } from "../../components/SkeletonRow";
import { ExportButton } from "../../components/ExportButton";
import { EmptyState } from "../../components/EmptyState";
import { FreelancerEmptyIllustration } from "../../components/illustrations/EmptyIllustrations";

const server = new rpc.Server(RPC_URL);

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = "submit" | "my-invoices";

interface FormState {
  payer: string;
  amount: string;
  dueDate: string;
  discountRate: string;
}

const EMPTY_FORM: FormState = {
  payer: "",
  amount: "",
  dueDate: "",
  discountRate: "",
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Pending:
      "bg-primary-container text-on-primary-container",
    Funded:
      "bg-[#dbeafe] text-[#1d4ed8] dark:bg-[#1e3a8a]/30 dark:text-[#93c5fd]",
    Paid: "bg-[#dcfce7] text-[#15803d] dark:bg-[#14532d]/30 dark:text-[#86efac]",
    Defaulted:
      "bg-error-container text-on-error-container",
  };
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${
        styles[status] ?? "bg-surface-container text-on-surface-variant"
      }`}
    >
      {status}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FreelancerPage() {
  const { address, isConnected, connect } = useWallet();
  const { addToast, updateToast } = useToast();
  const { signTx } = useWallet();
  const { tokenMap, defaultToken } = useApprovedTokens();

  const [screen, setScreen] = useState<Screen>("submit");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedId, setConfirmedId] = useState<bigint | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const {
    filters,
    setFilters,
    clearFilters,
    activeFilterCount,
  } = useInvoiceFilters({ namespace: "freelancerInvoices" });

  // ── Fetch invoices for connected wallet ─────────────────────────────────────
  const fetchMyInvoices = useCallback(async () => {
    if (!address) return;
    setLoadingInvoices(true);
    try {
      const all = await getAllInvoices();
      setInvoices(all.filter((inv) => inv.freelancer === address));
    } catch (err) {
      console.error("Failed to fetch invoices", err);
    } finally {
      setLoadingInvoices(false);
    }
  }, [address]);

  useEffect(() => {
    if (screen === "my-invoices") {
      fetchMyInvoices();
      refreshIntervalRef.current = setInterval(fetchMyInvoices, 30_000);
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [screen, fetchMyInvoices]);

  const filteredInvoices = useMemo(
    () =>
      applyInvoiceFilters(invoices, filters, {
        resolveTokenSymbol: (invoice) => {
          const token = tokenMap.get(invoice.token ?? defaultToken?.contractId ?? "");
          return token?.symbol ?? "USDC";
        },
      }),
    [defaultToken?.contractId, filters, invoices, tokenMap],
  );

  // ── Form validation ──────────────────────────────────────────────────────────
  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!form.payer.trim() || form.payer.trim().length < 56) {
      next.payer = "Enter a valid Stellar address (56 characters).";
    }
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      next.amount = "Enter a positive USDC amount.";
    }
    if (!form.dueDate) {
      next.dueDate = "Select a due date.";
    } else if (new Date(form.dueDate) <= new Date()) {
      next.dueDate = "Due date must be in the future.";
    }
    const rate = parseFloat(form.discountRate);
    if (!form.discountRate || isNaN(rate) || rate < 0 || rate > 100) {
      next.discountRate = "Enter a discount rate between 0 and 100.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ── Submit handler ───────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected) {
      await connect();
      return;
    }
    if (!validate()) return;

    setIsSubmitting(true);
    const toastId = addToast({ type: "pending", title: "Submitting Invoice…" });

    try {
      // Convert amount (USDC decimal) → stroops (× 10_000_000)
      const amountStroops = BigInt(Math.round(parseFloat(form.amount) * 10_000_000));
      // Convert due date string to unix seconds
      const dueDateUnix = Math.floor(new Date(form.dueDate).getTime() / 1000);
      // Convert percent → basis-points×100 (contract expects rate * 100, e.g. 5% → 500)
      const discountBps = Math.round(parseFloat(form.discountRate) * 100);

      const { tx, invoiceId } = await submitInvoice({
        freelancer: address!,
        payer: form.payer.trim(),
        amount: amountStroops,
        dueDate: dueDateUnix,
        discountRate: discountBps,
      });

      const signedXdr = await signTx(tx.toXDR());
      const sendResult = await server.sendTransaction(
        TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)
      );

      if ((sendResult as any).status === "PENDING") {
        let txStatus = await server.getTransaction((sendResult as any).hash);
        let tries = 0;
        while (
          (txStatus as any).status === "NOT_FOUND" &&
          tries < 20
        ) {
          await new Promise((r) => setTimeout(r, 1500));
          txStatus = await server.getTransaction((sendResult as any).hash);
          tries++;
        }

        setConfirmedId(invoiceId);
        setForm(EMPTY_FORM);
        setErrors({});
        updateToast(toastId, {
          type: "success",
          title: "Invoice Submitted!",
          txHash: (sendResult as any).hash,
        });
      } else {
        throw new Error(
          `Transaction rejected: ${(sendResult as any).status}`
        );
      }
    } catch (err: any) {
      updateToast(toastId, {
        type: "error",
        title: "Submission Failed",
        message: err?.message ?? "An unknown error occurred.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-28 pb-20 px-4">
        <div className="max-w-4xl mx-auto">

          {/* ── Page Header ──────────────────────────────────────────────────── */}
          <div className="mb-8">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-2">
              Freelancer Portal
            </p>
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Invoice Dashboard
            </h1>
            <p className="text-on-surface-variant max-w-xl">
              Submit unpaid invoices to the ILN protocol and get paid early by
              liquidity providers — all on Stellar testnet.
            </p>
          </div>

          {/* ── Tab switcher ─────────────────────────────────────────────────── */}
          <div className="flex bg-surface-container-low p-1 rounded-xl w-fit mb-8 gap-1">
            {(["submit", "my-invoices"] as Screen[]).map((s) => (
              <button
                key={s}
                id={`tab-${s}`}
                onClick={() => {
                  setScreen(s);
                  setConfirmedId(null);
                }}
                className={`px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                  screen === s
                    ? "bg-primary text-surface-container-lowest shadow-md"
                    : "text-on-surface-variant hover:bg-surface-variant/30"
                }`}
              >
                {s === "submit" ? (
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">
                      add_circle
                    </span>
                    Submit Invoice
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">
                      receipt_long
                    </span>
                    My Invoices
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SCREEN 1 — Submit Invoice
          ════════════════════════════════════════════════════════════════════ */}
          {screen === "submit" && (
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/10 overflow-hidden">
              {/* Card header */}
              <div className="p-6 border-b border-surface-dim">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">
                    send
                  </span>
                  Submit a New Invoice
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  Fill in the details below. Your Freighter wallet will sign the
                  transaction.
                </p>
              </div>

              {/* Wallet gate */}
              {!isConnected ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 gap-5">
                  <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-3xl">
                      account_balance_wallet
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-lg">Connect your wallet first</p>
                    <p className="text-sm text-on-surface-variant mt-1">
                      You need Freighter to submit invoices on Stellar testnet.
                    </p>
                  </div>
                  <button
                    id="connect-wallet-submit"
                    onClick={connect}
                    className="bg-primary text-surface-container-lowest px-8 py-3 rounded-xl text-sm font-bold shadow-md hover:bg-primary/90 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      account_balance_wallet
                    </span>
                    Connect Freighter
                  </button>
                </div>
              ) : (
                <>
                  {/* Success confirmation banner */}
                  {confirmedId !== null && (
                    <div className="mx-6 mt-6 p-4 rounded-xl bg-[#dcfce7] border border-[#bbf7d0] text-[#15803d] dark:bg-[#14532d]/20 dark:border-[#166534]/30 dark:text-[#86efac] flex items-start gap-3">
                      <span className="material-symbols-outlined mt-0.5">
                        check_circle
                      </span>
                      <div>
                        <p className="font-bold text-sm">
                          Invoice submitted successfully!
                        </p>
                        <p className="text-xs mt-0.5 opacity-90">
                          Your invoice ID is{" "}
                          <span className="font-mono font-bold">
                            #{confirmedId.toString()}
                          </span>
                          . Switch to &quot;My Invoices&quot; to track its
                          status.
                        </p>
                      </div>
                      <button
                        onClick={() => setConfirmedId(null)}
                        className="ml-auto opacity-60 hover:opacity-100 transition-opacity"
                        aria-label="Dismiss"
                      >
                        <span className="material-symbols-outlined text-sm">
                          close
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Form */}
                  <form
                    id="submit-invoice-form"
                    onSubmit={handleSubmit}
                    className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6"
                    noValidate
                  >
                    {/* Payer address — full width */}
                    <div className="md:col-span-2">
                      <label
                        htmlFor="field-payer"
                        className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5"
                      >
                        Payer Stellar Address
                      </label>
                      <input
                        id="field-payer"
                        type="text"
                        placeholder="G…"
                        value={form.payer}
                        onChange={(e) =>
                          setForm({ ...form, payer: e.target.value })
                        }
                        className={`w-full bg-surface-container-low border rounded-xl px-4 py-3 text-sm font-mono placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                          errors.payer
                            ? "border-error"
                            : "border-outline-variant/30"
                        }`}
                      />
                      {errors.payer && (
                        <p className="text-error text-xs mt-1.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">
                            error
                          </span>
                          {errors.payer}
                        </p>
                      )}
                    </div>

                    {/* Invoice Amount */}
                    <div>
                      <label
                        htmlFor="field-amount"
                        className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5"
                      >
                        Invoice Amount (USDC)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm font-bold">
                          $
                        </span>
                        <input
                          id="field-amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="0.00"
                          value={form.amount}
                          onChange={(e) =>
                            setForm({ ...form, amount: e.target.value })
                          }
                          className={`w-full bg-surface-container-low border rounded-xl pl-7 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                            errors.amount
                              ? "border-error"
                              : "border-outline-variant/30"
                          }`}
                        />
                      </div>
                      {errors.amount && (
                        <p className="text-error text-xs mt-1.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">
                            error
                          </span>
                          {errors.amount}
                        </p>
                      )}
                    </div>

                    {/* Due Date */}
                    <div>
                      <label
                        htmlFor="field-due-date"
                        className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5"
                      >
                        Due Date
                      </label>
                      <input
                        id="field-due-date"
                        type="date"
                        value={form.dueDate}
                        min={new Date(Date.now() + 86_400_000)
                          .toISOString()
                          .slice(0, 10)}
                        onChange={(e) =>
                          setForm({ ...form, dueDate: e.target.value })
                        }
                        className={`w-full bg-surface-container-low border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                          errors.dueDate
                            ? "border-error"
                            : "border-outline-variant/30"
                        }`}
                      />
                      {errors.dueDate && (
                        <p className="text-error text-xs mt-1.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">
                            error
                          </span>
                          {errors.dueDate}
                        </p>
                      )}
                    </div>

                    {/* Discount Rate */}
                    <div>
                      <label
                        htmlFor="field-discount"
                        className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5"
                      >
                        Discount Rate (%)
                      </label>
                      <div className="relative">
                        <input
                          id="field-discount"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="e.g. 5"
                          value={form.discountRate}
                          onChange={(e) =>
                            setForm({ ...form, discountRate: e.target.value })
                          }
                          className={`w-full bg-surface-container-low border rounded-xl px-4 pr-9 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                            errors.discountRate
                              ? "border-error"
                              : "border-outline-variant/30"
                          }`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm font-bold">
                          %
                        </span>
                      </div>
                      {errors.discountRate && (
                        <p className="text-error text-xs mt-1.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">
                            error
                          </span>
                          {errors.discountRate}
                        </p>
                      )}
                      <p className="text-[11px] text-on-surface-variant mt-1.5">
                        The discount an LP earns for early payment (e.g. 5 = 5%).
                      </p>
                    </div>

                    {/* Preview pill — shown when form has values */}
                    {form.amount && form.discountRate && (
                      <div className="md:col-span-2 bg-primary-container/30 border border-primary/10 rounded-xl px-5 py-4 flex flex-wrap gap-6">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                            You receive (net)
                          </p>
                          <p className="font-bold mt-0.5">
                            {(() => {
                              const amt = parseFloat(form.amount) || 0;
                              const rate = parseFloat(form.discountRate) || 0;
                              const net = amt * (1 - rate / 100);
                              return `$${net.toFixed(2)} USDC`;
                            })()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                            LP yield
                          </p>
                          <p className="font-bold mt-0.5 text-primary">
                            {(() => {
                              const amt = parseFloat(form.amount) || 0;
                              const rate = parseFloat(form.discountRate) || 0;
                              return `$${(amt * rate / 100).toFixed(2)} USDC`;
                            })()}
                          </p>
                        </div>
                        {form.dueDate && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                              Due
                            </p>
                            <p className="font-bold mt-0.5">
                              {new Date(form.dueDate).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Submit button — full width */}
                    <div className="md:col-span-2">
                      <button
                        id="submit-invoice-btn"
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-primary text-surface-container-lowest py-3.5 rounded-xl font-bold text-sm shadow-md hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <span className="w-4 h-4 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin" />
                            Submitting to Stellar…
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[18px]">
                              send
                            </span>
                            Submit Invoice
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SCREEN 2 — My Invoices
          ════════════════════════════════════════════════════════════════════ */}
          {screen === "my-invoices" && (
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/10 overflow-hidden min-h-[400px]">
              {/* Card header */}
              <div className="p-6 border-b border-surface-dim flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">
                      receipt_long
                    </span>
                    My Invoices
                  </h2>
                  <p className="text-sm text-on-surface-variant mt-1">
                    Showing invoices submitted by your wallet. Auto-refreshes
                    every 30 s.
                  </p>
                </div>
                <button
                  id="refresh-invoices-btn"
                  onClick={fetchMyInvoices}
                  disabled={loadingInvoices}
                  className="flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      loadingInvoices ? "animate-spin" : ""
                    }`}
                  >
                    refresh
                  </span>
                  Refresh
                </button>
              </div>

              {/* Wallet gate */}
              {!isConnected ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 gap-5">
                  <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-3xl">
                      account_balance_wallet
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-lg">
                      Connect your wallet to view invoices
                    </p>
                    <p className="text-sm text-on-surface-variant mt-1">
                      Only invoices submitted from your address are shown.
                    </p>
                  </div>
                  <button
                    id="connect-wallet-invoices"
                    onClick={connect}
                    className="bg-primary text-surface-container-lowest px-8 py-3 rounded-xl text-sm font-bold shadow-md hover:bg-primary/90 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      account_balance_wallet
                    </span>
                    Connect Freighter
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="px-6 pt-4 flex flex-col gap-3">
                    <InvoiceFilterBar
                      filters={filters}
                      onFiltersChange={setFilters}
                      onClearFilters={clearFilters}
                      activeFilterCount={activeFilterCount}
                    />
                    <ExportButton data={filteredInvoices} filenamePrefix="iln-freelancer-export" />
                  </div>
                  <table className="w-full text-left" id="my-invoices-table">
                    <thead className="bg-surface-container-low">
                      <tr>
                        {[
                          "ID",
                          "Payer",
                          "Amount",
                          "Discount",
                          "Due Date",
                          "Status",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-dim">
                      {loadingInvoices ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <SkeletonRow key={i} columns={FREELANCER_COLUMNS} />
                        ))
                      ) : filteredInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12">
                            <EmptyState
                              title="No Invoices Yet"
                              description="You haven't submitted any invoices. Submit your first invoice to get started."
                              illustration={<FreelancerEmptyIllustration />}
                              action={
                                <button
                                  onClick={() => setScreen("submit")}
                                  className="bg-primary text-surface-container-lowest px-6 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-all active:scale-95"
                                >
                                  Submit your first invoice →
                                </button>
                              }
                            />
                          </td>
                        </tr>
                      ) : (
                        filteredInvoices.map((inv) => (
                          <tr
                            key={inv.id.toString()}
                            className="hover:bg-surface-variant/10 transition-colors"
                          >
                            <td className="px-6 py-5 font-bold text-primary whitespace-nowrap">
                              #{inv.id.toString()}
                            </td>
                            <td className="px-6 py-5">
                              <span className="font-mono text-sm">
                                {formatAddress(inv.payer)}
                              </span>
                            </td>
                            <td className="px-6 py-5 font-bold whitespace-nowrap">
                              {formatUSDC(inv.amount)}
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <span className="bg-primary-container text-on-primary-container px-2 py-0.5 rounded text-xs font-bold">
                                {(inv.discount_rate / 100).toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-6 py-5 text-sm whitespace-nowrap">
                              {formatDate(inv.due_date)}
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <StatusBadge status={inv.status} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

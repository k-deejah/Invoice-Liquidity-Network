"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import TokenSelector, { TokenAmount } from "./TokenSelector";
import { useApprovedTokens } from "../hooks/useApprovedTokens";
import {
  buildApproveTokenTransaction,
  getAllInvoices,
  getTokenAllowance,
  fundInvoice,
  Invoice,
  submitSignedTransaction,
} from "../utils/soroban";
import { formatAddress, formatDate, formatTokenAmount, calculateYield } from "../utils/format";
import { formatUSDC, formatAddress, formatDate, calculateYield } from "../utils/format";
import { usePayerScores } from "../hooks/usePayerScores";
import RiskBadge from "./RiskBadge";
import { RISK_SORT_ORDER } from "../utils/risk";

type Tab = "discovery" | "my-funded";
type FundingStep = "approve" | "fund";

export default function LPDashboard() {
  const { address, connect, signTx } = useWallet();
  const { addToast, updateToast } = useToast();
  const { tokens, tokenMap, defaultToken } = useApprovedTokens();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("discovery");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isFunding, setIsFunding] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof Invoice | "risk">("amount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllInvoices();
      setInvoices(all);
    } catch (error) {
      console.error("Failed to fetch invoices", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchData]);

  // Fetch payer scores in batch whenever invoices change
  const discoveryInvoicesList = invoices.filter(i => i.status === "Pending");
  const { scores: payerScores, risks: payerRisks } = usePayerScores(discoveryInvoicesList);

  const handleFund = async (invoice: Invoice) => {
    if (!address) {
      await connect();
      return;
    }
    setFundingError(null);
    setAllowance(null);
    setSelectedInvoice(invoice);
  };

  const refreshAllowance = useCallback(async (invoice: Invoice, walletAddress: string) => {
    setIsCheckingAllowance(true);
    setFundingError(null);

    try {
      const nextAllowance = await getTokenAllowance({
        owner: walletAddress,
        tokenId: invoice.token ?? defaultToken?.contractId,
      });
      setAllowance(nextAllowance);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch token allowance.";
      setFundingError(message);
    } finally {
      setIsCheckingAllowance(false);
    }
  }, [defaultToken]);

  useEffect(() => {
    if (!selectedInvoice || !address) return;

    const timer = setTimeout(() => {
      void refreshAllowance(selectedInvoice, address);
    }, 0);

    return () => clearTimeout(timer);
  }, [address, refreshAllowance, selectedInvoice]);

  const requiredAmount = selectedInvoice?.amount ?? 0n;
  const needsApproval = allowance === null || allowance < requiredAmount;
  const currentStep: FundingStep = allowance !== null && allowance >= requiredAmount ? "fund" : "approve";
  const selectedInvoiceToken = selectedInvoice
    ? tokenMap.get(selectedInvoice.token ?? defaultToken?.contractId ?? "") ?? defaultToken ?? null
    : null;

  const approveToken = async () => {
    if (!selectedInvoice || !address || !selectedInvoiceToken) return;
    setIsApproving(true);

    const toastId = addToast({ type: "pending", title: `Approving ${selectedInvoiceToken.symbol}...` });
    try {
      const tx = await buildApproveTokenTransaction({
        owner: address,
        amount: selectedInvoice.amount,
        tokenId: selectedInvoiceToken.contractId,
      });
      const result = await submitSignedTransaction({ tx, signTx });

      updateToast(toastId, {
        type: "success",
        title: `${selectedInvoiceToken.symbol} approved`,
        message: `Allowance updated for ${formatTokenAmount(selectedInvoice.amount, selectedInvoiceToken)}.`,
        txHash: result.txHash,
      });

      setAllowance(selectedInvoice.amount);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approval failed.";
      setFundingError(message);
      updateToast(toastId, {
        type: "error",
        title: "Approval failed",
        message,
      });
    } finally {
      setIsApproving(false);
    }
  };

  const confirmFunding = async () => {
    if (!selectedInvoice || !address) return;
    setIsFunding(true);
    const toastId = addToast({ type: "pending", title: "Funding Invoice..." });

    try {
      const tx = await fundInvoice(address, selectedInvoice.id);
      const result = await submitSignedTransaction({ tx, signTx });

      updateToast(toastId, {
        type: "success",
        title: "Funded Successfully",
        txHash: result.txHash,
      });
      setSelectedInvoice(null);
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An unknown error occurred";
      setFundingError(message);
      updateToast(toastId, {
        type: "error",
        title: "Funding Failed",
        message,
      });
    } finally {
      setIsFunding(false);
    }
  };

  const sortedInvoices = [...invoices].sort((a, b) => {
    const aVal = a[sortKey] as string | number | bigint | undefined;
    const bVal = b[sortKey] as string | number | bigint | undefined;
  const sortedInvoices = [...invoices].sort((a: any, b: any) => {
    if (sortKey === "risk") {
      const ra = RISK_SORT_ORDER[payerRisks.get(a.payer) ?? "Unknown"];
      const rb = RISK_SORT_ORDER[payerRisks.get(b.payer) ?? "Unknown"];
      return sortOrder === "asc" ? ra - rb : rb - ra;
    }
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const discoveryInvoices = sortedInvoices.filter(i => i.status === "Pending");
  const myFundedInvoices = sortedInvoices.filter(i => i.funder === address);

  const toggleSort = (key: keyof Invoice | "risk") => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-xl overflow-hidden border border-outline-variant/10 min-h-[500px]">
      <div className="p-6 border-b border-surface-dim flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">monitoring</span>
            LP Dashboard
          </h3>
          <p className="text-sm text-on-surface-variant mt-1">
            Browse and fund invoices to earn yield.
          </p>
        </div>
        
        <div className="flex bg-surface-container-low p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("discovery")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "discovery"
                ? "bg-primary text-surface-container-lowest shadow-md"
                : "text-on-surface-variant hover:bg-surface-variant/30"
            }`}
          >
            Discovery
          </button>
          <button
            onClick={() => setActiveTab("my-funded")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "my-funded"
                ? "bg-primary text-surface-container-lowest shadow-md"
                : "text-on-surface-variant hover:bg-surface-variant/30"
            }`}
          >
            My Funded
          </button>
        </div>
      </div>

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
              <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider cursor-pointer group" onClick={() => toggleSort("amount")}>
                Amount {sortKey === "amount" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider cursor-pointer group" onClick={() => toggleSort("discount_rate")}>
                Discount {sortKey === "discount_rate" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider cursor-pointer group" onClick={() => toggleSort("due_date")}>
                Due Date {sortKey === "due_date" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider">
                Est. Yield
              </th>
              {activeTab === "discovery" && (
                <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider cursor-pointer" onClick={() => toggleSort("risk")}>
                  Risk {sortKey === "risk" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
              )}
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-dim">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant italic">
                  Loading invoices from Stellar...
                </td>
              </tr>
            ) : (activeTab === "discovery" ? discoveryInvoices : myFundedInvoices).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant italic">
                  No {activeTab === "discovery" ? "pending" : "funded"} invoices found.
                </td>
              </tr>
            ) : (
              (activeTab === "discovery" ? discoveryInvoices : myFundedInvoices).map((invoice) => (
                <tr key={invoice.id.toString()} className="hover:bg-surface-variant/10 transition-colors">
                  <td className="px-6 py-5 font-bold text-primary">#{invoice.id.toString()}</td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{formatAddress(invoice.freelancer)}</span>
                      <span className="text-[10px] text-on-surface-variant">Payer: {formatAddress(invoice.payer)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 font-bold">
                    <TokenAwareAmount amount={invoice.amount} invoice={invoice} tokenMap={tokenMap} defaultToken={defaultToken} />
                  </td>
                  <td className="px-6 py-5">
                    <span className="bg-primary-container text-on-primary-container px-2 py-0.5 rounded text-xs font-bold">
                      {(invoice.discount_rate / 100).toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-6 py-5 text-sm">{formatDate(invoice.due_date)}</td>
                  <td className="px-6 py-5 font-bold text-green-600">
                    <TokenAwareAmount amount={calculateYield(invoice.amount, invoice.discount_rate)} invoice={invoice} tokenMap={tokenMap} defaultToken={defaultToken} />
                  </td>
                  {activeTab === "discovery" && (
                    <td className="px-6 py-5">
                      <RiskBadge
                        risk={payerRisks.get(invoice.payer) ?? "Unknown"}
                        score={payerScores.get(invoice.payer) ?? null}
                      />
                    </td>
                  )}
                  <td className="px-6 py-5 text-right">
                    {activeTab === "discovery" ? (
                      <button
                        onClick={() => handleFund(invoice)}
                        className="bg-primary text-surface-container-lowest text-xs px-4 py-2 rounded-lg font-bold hover:bg-primary/90 shadow-sm active:scale-95 transition-all"
                      >
                        Fund
                      </button>
                    ) : (
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${
                        invoice.status === 'Funded' ? 'bg-blue-100 text-blue-700' : 
                        invoice.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {invoice.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/20 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-surface-dim">
              <h4 className="text-xl font-bold">Fund Invoice #{selectedInvoice.id.toString()}</h4>
              <p className="text-sm text-on-surface-variant mt-1">The funding token is fixed by the invoice. Approve it only when the current allowance is too low, then complete funding.</p>
            </div>
            
            <div className="p-6 space-y-4">
              {selectedInvoiceToken ? (
                <TokenSelector
                  label="Invoice token"
                  value={selectedInvoiceToken.contractId}
                  tokens={tokens}
                  readOnly
                />
              ) : null}

              {needsApproval ? (
                <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                  <div className="flex items-start gap-3">
                    <StepPill active={currentStep === "approve"} complete={currentStep === "fund"}>
                      1
                    </StepPill>
                    <div className="min-w-0">
                      <p className="text-sm font-bold">Step 1: Approve {selectedInvoiceToken?.symbol ?? "token"}</p>
                      <p className="text-xs text-on-surface-variant mt-1">
                        {isCheckingAllowance
                          ? "Checking current allowance..."
                          : `Approve exactly ${selectedInvoiceToken ? formatTokenAmount(selectedInvoice.amount, selectedInvoiceToken) : selectedInvoice.amount.toString()} for the ILN contract.`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-on-surface-variant">
                    <span>Current allowance</span>
                    <span className="font-bold text-on-surface">
                      {allowance === null || !selectedInvoiceToken ? "--" : formatTokenAmount(allowance, selectedInvoiceToken)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-primary/15 bg-primary-container/20 px-4 py-3 text-sm text-on-surface">
                  Allowance already covers this invoice. You can go straight to funding.
                </div>
              )}

              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                <div className="flex items-start gap-3">
                    <StepPill active={currentStep === "fund"}>{needsApproval ? 2 : 1}</StepPill>
                  <div>
                    <p className="text-sm font-bold">{needsApproval ? "Step 2: Fund Invoice" : "Step 1: Fund Invoice"}</p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Send the invoice principal once the ILN contract can spend your {selectedInvoiceToken?.symbol ?? "token"}.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">You will send:</span>
                <span className="font-bold">
                  {selectedInvoiceToken ? (
                    <TokenAmount amount={formatTokenAmount(selectedInvoice.amount, selectedInvoiceToken)} token={selectedInvoiceToken} />
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between text-sm text-green-600 font-medium">
                <span>Freelancer receives immediately:</span>
                <span>
                  {selectedInvoiceToken ? (
                    <TokenAmount
                      amount={formatTokenAmount(selectedInvoice.amount - calculateYield(selectedInvoice.amount, selectedInvoice.discount_rate), selectedInvoiceToken)}
                      token={selectedInvoiceToken}
                    />
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">You receive on settlement:</span>
                <span className="font-bold">
                  {selectedInvoiceToken ? (
                    <TokenAmount amount={formatTokenAmount(selectedInvoice.amount, selectedInvoiceToken)} token={selectedInvoiceToken} />
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between text-sm border-t border-surface-dim pt-4">
                <span className="text-on-surface-variant">Your yield (discount):</span>
                <span className="font-bold text-green-600">
                  {selectedInvoiceToken ? (
                    <TokenAmount
                      amount={`${formatTokenAmount(calculateYield(selectedInvoice.amount, selectedInvoice.discount_rate), selectedInvoiceToken)} (${(selectedInvoice.discount_rate / 100).toFixed(2)}%)`}
                      token={selectedInvoiceToken}
                    />
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Estimated due date:</span>
                <span className="font-bold">{formatDate(selectedInvoice.due_date)}</span>
              </div>

              {fundingError ? (
                <div className="rounded-xl border border-error/15 bg-error-container/70 px-4 py-3 text-sm text-on-error-container">
                  {fundingError}
                </div>
              ) : null}
            </div>

            <div className="p-6 bg-surface-container-low flex gap-3">
              <button
                disabled={isFunding || isApproving}
                onClick={() => setSelectedInvoice(null)}
                className="flex-1 py-3 rounded-xl font-bold text-sm border border-outline-variant hover:bg-surface-dim transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={isFunding || isApproving || isCheckingAllowance}
                onClick={currentStep === "approve" ? approveToken : confirmFunding}
                className="flex-[2] py-3 rounded-xl font-bold text-sm bg-primary text-surface-container-lowest hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isCheckingAllowance ? (
                  <>
                    <span className="w-4 h-4 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin"></span>
                    Checking allowance...
                  </>
                ) : isApproving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin"></span>
                    Approving {selectedInvoiceToken?.symbol ?? "token"}...
                  </>
                ) : isFunding ? (
                  <>
                    <span className="w-4 h-4 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin"></span>
                    Funding...
                  </>
                ) : currentStep === "approve" ? `Approve ${selectedInvoiceToken?.symbol ?? "token"}` : "Fund Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TokenAwareAmount({
  amount,
  invoice,
  tokenMap,
  defaultToken,
}: {
  amount: bigint;
  invoice: Invoice;
  tokenMap: Map<string, ReturnType<typeof useApprovedTokens>["tokens"][number]>;
  defaultToken: ReturnType<typeof useApprovedTokens>["defaultToken"];
}) {
  const token = tokenMap.get(invoice.token ?? defaultToken?.contractId ?? "") ?? defaultToken;

  if (!token) {
    return <span>{amount.toString()}</span>;
  }

  return <TokenAmount amount={formatTokenAmount(amount, token)} token={token} />;
}

function StepPill({
  active,
  complete,
  children,
}: {
  active: boolean;
  complete?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
        complete
          ? "bg-primary text-surface-container-lowest"
          : active
            ? "bg-primary-container text-on-primary-container"
            : "bg-surface-container-high text-on-surface-variant"
      }`}
    >
      {children}
    </div>
  );
}

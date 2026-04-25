"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import TokenSelector, { TokenAmount } from "./TokenSelector";
import InvoiceFilterBar from "./InvoiceFilterBar";
import { useApprovedTokens } from "../hooks/useApprovedTokens";
import { applyInvoiceFilters, useInvoiceFilters } from "../hooks/useInvoiceFilters";
import SkeletonRow, { LP_DISCOVERY_COLUMNS } from "./SkeletonRow";
import { EmptyState } from "./EmptyState";
import { LPDiscoveryEmptyIllustration, NotificationsEmptyIllustration } from "./illustrations/EmptyIllustrations";
import {
  buildApproveTokenTransaction,
  claimDefault,
  getAllInvoices,
  getTokenAllowance,
  fundInvoice,
  Invoice,
  submitSignedTransaction,
} from "../utils/soroban";
import { formatUSDC, formatAddress, formatDate, calculateYield } from "../utils/format";
import { formatAddress, formatDate, formatTokenAmount, calculateYield } from "../utils/format";
import { useWatchlist } from "../hooks/useWatchlist";
import { usePayerScores } from "../hooks/usePayerScores";
import RiskBadge from "./RiskBadge";
import LPPortfolio from "./LPPortfolio";
import { RISK_SORT_ORDER } from "../utils/risk";
import { ExportButton } from "./ExportButton";


type Tab = "discovery" | "my-funded" | "watchlist";
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
  const [sortKey, setSortKey] = useState<keyof Invoice | "risk" | "yield">("amount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [claimingInvoiceId, setClaimingInvoiceId] = useState<string | null>(null);
  const {
    filters,
    setFilters,
    clearFilters,
    activeFilterCount,
  } = useInvoiceFilters({ namespace: "lpInvoices" });

  const { watchlist, toggleWatchlist, isInWatchlist } = useWatchlist(address || null);

  const handleWatchlistToggle = (invoiceId: bigint, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      toggleWatchlist(invoiceId);
      if (!isInWatchlist(invoiceId)) {
        addToast({ type: "success", title: "Added to Watchlist" });
      } else {
        addToast({ type: "success", title: "Removed from Watchlist" });
      }
    } catch (error: any) {
      addToast({ type: "error", title: "Watchlist Error", message: error.message });
    }
  };

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

  const handleClaimDefault = async (invoice: Invoice) => {
    if (!address) {
      await connect();
      return;
    }

    setClaimingInvoiceId(invoice.id.toString());
    const toastId = addToast({ type: "pending", title: `Claiming default for #${invoice.id.toString()}...` });
    try {
      const tx = await claimDefault(address, invoice.id);
      const result = await submitSignedTransaction({ tx, signTx });
      updateToast(toastId, {
        type: "success",
        title: "Default claimed",
        txHash: result.txHash,
      });
      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to claim default.";
      updateToast(toastId, {
        type: "error",
        title: "Claim failed",
        message,
      });
    } finally {
      setClaimingInvoiceId(null);
    }
  };
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

  const sortedInvoices = [...filteredInvoices].sort((a: any, b: any) => {
    if (sortKey === "risk") {
      const ra = RISK_SORT_ORDER[payerRisks.get(a.payer) ?? "Unknown"];
      const rb = RISK_SORT_ORDER[payerRisks.get(b.payer) ?? "Unknown"];
      return sortOrder === "asc" ? ra - rb : rb - ra;
    }
    if (sortKey === "yield") {
      const ay = calculateYield(a.amount, a.discount_rate);
      const by = calculateYield(b.amount, b.discount_rate);
      if (ay < by) return sortOrder === "asc" ? -1 : 1;
      if (ay > by) return sortOrder === "asc" ? 1 : -1;
      return 0;
    }
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const discoveryInvoices = sortedInvoices.filter(i => i.status === "Pending");
  const myFundedInvoices = sortedInvoices.filter(i => i.funder === address);
  
  const watchlistInvoices = sortedInvoices
    .filter(i => watchlist.some(w => w.id === i.id.toString()))
    .map(i => {
      const watchItem = watchlist.find(w => w.id === i.id.toString());
      return { ...i, watchAddedAt: watchItem?.addedAt || 0 };
    });

  const toggleSort = (key: keyof Invoice | "risk" | "yield") => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const commonColumns: ColumnDefinition<any>[] = [
    {
      id: "id",
      label: "ID",
      isMandatory: true,
      sortable: true,
      renderCell: (inv) => <span className="font-bold text-primary">#{inv.id.toString()}</span>,
    },
    {
      id: "freelancer",
      label: "Freelancer",
      sortable: false,
      renderCell: (inv) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{formatAddress(inv.freelancer)}</span>
          <span className="text-[10px] text-on-surface-variant">Payer: {formatAddress(inv.payer)}</span>
        </div>
      ),
    },
    {
      id: "amount",
      label: "Amount",
      sortable: true,
      renderCell: (inv) => (
        <TokenAwareAmount amount={inv.amount} invoice={inv} tokenMap={tokenMap} defaultToken={defaultToken} />
      ),
    },
    {
      id: "discount_rate",
      label: "Discount",
      sortable: true,
      renderCell: (inv) => (
        <span className="bg-primary-container text-on-primary-container px-2 py-0.5 rounded text-xs font-bold">
          {(inv.discount_rate / 100).toFixed(2)}%
        </span>
      ),
    },
    {
      id: "due_date",
      label: "Due Date",
      sortable: true,
      renderCell: (inv) => <span className="text-sm">{formatDate(inv.due_date)}</span>,
    },
    {
      id: "yield",
      label: "Est. Yield",
      sortable: false,
      renderCell: (inv) => (
        <span className="font-bold text-green-600">
          <TokenAwareAmount
            amount={calculateYield(inv.amount, inv.discount_rate)}
            invoice={inv}
            tokenMap={tokenMap}
            defaultToken={defaultToken}
          />
        </span>
      ),
    },
  ];

  const discoveryColumns: ColumnDefinition<any>[] = [
    ...commonColumns,
    {
      id: "risk",
      label: "Risk",
      sortable: true,
      renderCell: (inv) => (
        <RiskBadge
          risk={payerRisks.get(inv.payer) ?? "Unknown"}
          score={payerScores.get(inv.payer) ?? null}
        />
      ),
    },
    {
      id: "actions",
      label: "",
      sortable: false,
      renderCell: (inv) => (
        <div className="flex items-center justify-end gap-2 text-right">
          <button
            onClick={(e) => handleWatchlistToggle(inv.id, e)}
            className={`p-2 rounded-full transition-colors ${
              isInWatchlist(inv.id) ? "text-red-500 hover:bg-red-50" : "text-on-surface-variant hover:bg-surface-variant/50"
            }`}
            title={isInWatchlist(inv.id) ? "Remove from watchlist" : "Add to watchlist"}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: isInWatchlist(inv.id) ? "'FILL' 1" : "'FILL' 0" }}
            >
              bookmark
            </span>
          </button>
          <button
            onClick={() => handleFund(inv)}
            className="bg-primary text-surface-container-lowest text-xs px-4 py-2 rounded-lg font-bold hover:bg-primary/90 shadow-sm active:scale-95 transition-all"
          >
            Fund
          </button>
        </div>
      ),
    },
  ];

  const watchlistColumns: ColumnDefinition<any>[] = [
    ...commonColumns,
    {
      id: "watchAddedAt",
      label: "Added",
      sortable: true,
      renderCell: (inv) => (
        <span className="text-xs text-on-surface-variant">
          {new Date(inv.watchAddedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      label: "",
      sortable: false,
      renderCell: (inv) => (
        <div className="flex items-center justify-end gap-2 text-right">
          <button
            onClick={(e) => handleWatchlistToggle(inv.id, e)}
            className="p-2 rounded-full transition-colors text-red-500 hover:bg-red-50"
            title="Remove from watchlist"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              bookmark
            </span>
          </button>
          {inv.status === "Pending" ? (
            <button
              onClick={() => handleFund(inv)}
              className="bg-primary text-surface-container-lowest text-xs px-4 py-2 rounded-lg font-bold hover:bg-primary/90 shadow-sm active:scale-95 transition-all"
            >
              Fund
            </button>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <span
                className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${
                  inv.status === "Funded" ? "bg-blue-100 text-blue-700" : inv.status === "Paid" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}
              >
                {inv.status}
              </span>
              <span className="text-[10px] bg-error-container text-on-error-container px-2 py-0.5 rounded flex items-center gap-1">
                <span className="material-symbols-outlined text-[10px]">warning</span>
                Already funded
              </span>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-xl overflow-hidden border border-outline-variant/10 min-h-[500px]">
      <div data-testid="lp-dashboard-header" className="p-6 border-b border-surface-dim flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">monitoring</span>
            LP Dashboard
          </h3>
          <p className="text-sm text-on-surface-variant mt-1">Browse and fund invoices to earn yield.</p>
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
            onClick={() => setActiveTab("watchlist")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "watchlist"
                ? "bg-primary text-surface-container-lowest shadow-md"
                : "text-on-surface-variant hover:bg-surface-variant/30"
            }`}
          >
            Watchlist
            {watchlist.length > 0 && (
              <span className="ml-2 bg-primary-container text-on-primary-container px-1.5 py-0.5 rounded-full text-[10px]">
                {watchlist.length}
              </span>
            )}
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
      <div className="px-6 pt-4 flex flex-col gap-3">
        <InvoiceFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
        />
        <ExportButton data={filteredInvoices} filenamePrefix="iln-lp-export" />
      </div>

      {activeTab === "my-funded" ? (
        <LPPortfolio
          invoices={myFundedInvoices}
          isLoading={loading}
          onClaimDefault={handleClaimDefault}
          claimingInvoiceId={claimingInvoiceId}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider">ID</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider">Freelancer</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider cursor-pointer group" onClick={() => toggleSort("amount")}>
                  Amount {sortKey === "amount" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th id="risk-badge" className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider cursor-pointer group" onClick={() => toggleSort("discount_rate")}>
                  Discount {sortKey === "discount_rate" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider cursor-pointer group" onClick={() => toggleSort("due_date")}>
                  Due Date {sortKey === "due_date" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider">Est. Yield</th>
                {activeTab === "watchlist" && (
                  <th className="px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider">Added</th>
                )}
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
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} columns={LP_DISCOVERY_COLUMNS} />
                ))
              ) : (activeTab === "discovery" ? discoveryInvoices : watchlistInvoices).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12">
                    <EmptyState
                      title={activeTab === "discovery" ? "No Pending Invoices" : "Watchlist Empty"}
                      description={
                        activeTab === "discovery"
                          ? "There are currently no active invoices waiting to be funded."
                          : "You haven't added any invoices to your watchlist yet."
                      }
                      illustration={
                        activeTab === "discovery" 
                          ? <LPDiscoveryEmptyIllustration /> 
                          : <NotificationsEmptyIllustration />
                      }
                    />
                  </td>
                </tr>
              ) : (
                (activeTab === "discovery" ? discoveryInvoices : watchlistInvoices).map((invoice: any, index: number) => (
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
                    {activeTab === "watchlist" && (
                      <td className="px-6 py-5 text-xs text-on-surface-variant">
                        {new Date(invoice.watchAddedAt).toLocaleDateString()}
                      </td>
                    )}
                    {activeTab === "discovery" && (
                      <td className="px-6 py-5">
                        <RiskBadge
                          risk={payerRisks.get(invoice.payer) ?? "Unknown"}
                          score={payerScores.get(invoice.payer) ?? null}
                        />
                      </td>
                    )}
                    <td className="px-6 py-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={(e) => handleWatchlistToggle(invoice.id, e)}
                          className={`p-2 rounded-full transition-colors ${
                            isInWatchlist(invoice.id)
                              ? "text-red-500 hover:bg-red-50"
                              : "text-on-surface-variant hover:bg-surface-variant/50"
                          }`}
                          title={isInWatchlist(invoice.id) ? "Remove from watchlist" : "Add to watchlist"}
                        >
                          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: isInWatchlist(invoice.id) ? "'FILL' 1" : "'FILL' 0" }}>
                            bookmark
                          </span>
                        </button>
                        <button
                          id={index === 0 ? "fund-button" : undefined}
                          onClick={() => handleFund(invoice)}
                          className="bg-primary text-surface-container-lowest text-xs px-4 py-2 rounded-lg font-bold hover:bg-primary/90 shadow-sm active:scale-95 transition-all"
                        >
                          Fund
                        </button>
                        {activeTab === "watchlist" && invoice.status !== "Pending" && (
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${
                                invoice.status === "Funded"
                                  ? "bg-blue-100 text-blue-700"
                                  : invoice.status === "Paid"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {invoice.status}
                            </span>
                            <span className="text-[10px] bg-error-container text-on-error-container px-2 py-0.5 rounded flex items-center gap-1">
                              <span className="material-symbols-outlined text-[10px]">warning</span>
                              Already funded
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

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
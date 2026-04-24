"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
import { CONTRACT_ID, NETWORK_NAME } from "../../constants";
import { useWallet } from "../../context/WalletContext";
import { formatAddress, formatDate, formatUSDC } from "../../utils/format";
import { getAllInvoices, type Invoice } from "../../utils/soroban";

const REFRESH_INTERVAL_MS = 30_000;
const STELLAR_EXPERT_CONTRACT_URL = `https://stellar.expert/explorer/${NETWORK_NAME.toLowerCase()}/contract/${CONTRACT_ID}`;

export type FreelancerStatusFilter = "All" | "Pending" | "Funded" | "Paid" | "Defaulted" | "Cancelled";
export type FreelancerSortKey = "amount" | "due_date";
export type SortOrder = "asc" | "desc";

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "Pending":
      return "bg-slate-100 text-slate-700";
    case "Funded":
      return "bg-blue-100 text-blue-700";
    case "Paid":
      return "bg-green-100 text-green-700";
    case "Defaulted":
      return "bg-red-100 text-red-700";
    case "Cancelled":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function applyFreelancerFiltersAndSort(
  invoices: Invoice[],
  statusFilter: FreelancerStatusFilter,
  sortKey: FreelancerSortKey,
  sortOrder: SortOrder,
): Invoice[] {
  const filtered = statusFilter === "All" ? invoices : invoices.filter((invoice) => invoice.status === statusFilter);
  return [...filtered].sort((a, b) => {
    const aValue = a[sortKey];
    const bValue = b[sortKey];

    if (aValue < bValue) {
      return sortOrder === "asc" ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortOrder === "asc" ? 1 : -1;
    }
    return 0;
  });
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getStatusBadgeClass(status)}`}>
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const { address, connect, isConnected } = useWallet();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedPayer, setCopiedPayer] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FreelancerStatusFilter>("All");
  const [sortKey, setSortKey] = useState<FreelancerSortKey>("due_date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const fetchInvoices = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const allInvoices = await getAllInvoices();
      setInvoices(allInvoices.filter((invoice) => invoice.freelancer === address));
    } catch (error) {
      console.error("Failed to fetch freelancer invoices", error);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    if (!address) return;
    const interval = setInterval(() => {
      void fetchInvoices();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [address, fetchInvoices]);

  const displayedInvoices = useMemo(
    () => applyFreelancerFiltersAndSort(invoices, statusFilter, sortKey, sortOrder),
    [invoices, statusFilter, sortKey, sortOrder],
  );

  const onSort = (nextSortKey: FreelancerSortKey) => {
    if (sortKey === nextSortKey) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextSortKey);
    setSortOrder("asc");
  };

  const copyPayerAddress = async (payer: string) => {
    try {
      await navigator.clipboard.writeText(payer);
      setCopiedPayer(payer);
      setTimeout(() => setCopiedPayer((current) => (current === payer ? null : current)), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <main className="min-h-screen">
      <Navbar />
      <section className="pt-32 pb-10 px-6 md:px-8 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Freelancer Dashboard</p>
            <h1 className="text-3xl md:text-5xl font-headline">My Submitted Invoices</h1>
            <p className="text-on-surface-variant mt-2">
              Track every invoice you submitted, monitor statuses, and open the transaction context on Stellar Expert.
            </p>
          </div>
          {!isConnected ? (
            <button
              onClick={connect}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white"
            >
              Connect Wallet
            </button>
          ) : (
            <button
              onClick={() => void fetchInvoices()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-4 py-2.5 text-sm font-medium text-on-surface-variant disabled:opacity-50"
            >
              Refresh
            </button>
          )}
        </div>
      </section>

      <section className="px-6 md:px-8 py-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
            <div className="flex items-center gap-2">
              <label htmlFor="status-filter" className="text-sm font-medium text-on-surface-variant">
                Status
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as FreelancerStatusFilter)}
                className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm"
              >
                <option value="All">All</option>
                <option value="Pending">Pending</option>
                <option value="Funded">Funded</option>
                <option value="Paid">Paid</option>
                <option value="Defaulted">Defaulted</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <p className="text-xs text-on-surface-variant">
              Auto-refreshes every 30 seconds.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-outline-variant/10 bg-surface-container-lowest">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-4 md:px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">ID</th>
                  <th className="px-4 md:px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Payer</th>
                  <th
                    className="px-4 md:px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant cursor-pointer"
                    onClick={() => onSort("amount")}
                  >
                    Amount {sortKey === "amount" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="px-4 md:px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Discount</th>
                  <th
                    className="px-4 md:px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant cursor-pointer"
                    onClick={() => onSort("due_date")}
                  >
                    Due Date {sortKey === "due_date" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="px-4 md:px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Status</th>
                  <th className="px-4 md:px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {!isConnected ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center text-on-surface-variant">
                      Connect your wallet to view submitted invoices.
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center text-on-surface-variant">
                      Loading invoices...
                    </td>
                  </tr>
                ) : displayedInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center text-on-surface-variant">
                      No invoices found for this wallet.
                    </td>
                  </tr>
                ) : (
                  displayedInvoices.map((invoice) => (
                    <tr key={invoice.id.toString()} className="hover:bg-surface-container-low">
                      <td className="px-4 md:px-6 py-5 font-bold text-primary">#{invoice.id.toString()}</td>
                      <td className="px-4 md:px-6 py-5">
                        <div className="inline-flex items-center gap-2">
                          <span className="font-mono text-sm">{formatAddress(invoice.payer)}</span>
                          <button
                            onClick={() => void copyPayerAddress(invoice.payer)}
                            className="rounded border border-outline-variant/30 px-2 py-1 text-[10px] font-bold uppercase text-on-surface-variant"
                          >
                            {copiedPayer === invoice.payer ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 md:px-6 py-5 font-bold">{formatUSDC(invoice.amount)}</td>
                      <td className="px-4 md:px-6 py-5">{(invoice.discount_rate / 100).toFixed(2)}%</td>
                      <td className="px-4 md:px-6 py-5">{formatDate(invoice.due_date)}</td>
                      <td className="px-4 md:px-6 py-5">
                        <InvoiceStatusBadge status={invoice.status} />
                      </td>
                      <td className="px-4 md:px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col gap-1 flex-1">
                            <Link className="text-xs font-medium text-primary hover:underline" href={`/i/${invoice.id.toString()}`}>
                              Public invoice page
                            </Link>
                            <a
                              className="text-xs font-medium text-primary hover:underline"
                              href={STELLAR_EXPERT_CONTRACT_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Stellar Expert
                            </a>
                          </div>
                          
                          {/* Row Action Menu */}
                          <div className="relative group">
                            <button 
                              className="p-1 rounded-full hover:bg-surface-container-high transition-colors"
                              aria-label="More actions"
                            >
                              <span className="material-symbols-outlined text-lg text-on-surface-variant">more_vert</span>
                            </button>
                            <div className="absolute right-0 bottom-full mb-2 hidden group-focus-within:block group-hover:block bg-surface-container-high border border-outline-variant/30 rounded-xl shadow-xl z-10 py-1 min-w-[160px]">
                              <Link 
                                href={{
                                  pathname: '/submit',
                                  query: {
                                    prefill_id: invoice.id.toString(),
                                    payer: invoice.payer,
                                    amount: (Number(invoice.amount) / 10_000_000).toString(),
                                    discount: (invoice.discount_rate / 100).toString(),
                                    token: invoice.tokenId || "",
                                  }
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-highest transition-colors w-full text-left"
                              >
                                <span className="material-symbols-outlined text-[18px]">content_copy</span>
                                Submit similar
                              </Link>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

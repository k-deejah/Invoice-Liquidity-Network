"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import { getAllInvoices, fundInvoice, Invoice } from "../utils/soroban";
import { formatUSDC, formatAddress, formatDate, calculateYield } from "../utils/format";
import { rpc } from "@stellar/stellar-sdk";
import { RPC_URL } from "../constants";

const server = new rpc.Server(RPC_URL);

type Tab = "discovery" | "my-funded";

export default function LPDashboard() {
  const { address, connect, signTx } = useWallet();
  const { addToast, updateToast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("discovery");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isFunding, setIsFunding] = useState(false);
  const [sortKey, setSortKey] = useState<keyof Invoice>("amount");
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
    fetchData();
  }, [fetchData]);

  const handleFund = async (invoice: Invoice) => {
    if (!address) {
      await connect();
      return;
    }
    setSelectedInvoice(invoice);
  };

  const confirmFunding = async () => {
    if (!selectedInvoice || !address) return;
    setIsFunding(true);
    const toastId = addToast({ type: "pending", title: "Funding Invoice..." });

    try {
      const tx = await fundInvoice(address, selectedInvoice.id);
      const signedTxXdr = await signTx(tx.toXDR());
      
      const sendResult = await server.sendTransaction(rpc.Transaction.fromXDR(signedTxXdr, "Test SDF Network ; September 2015"));
      
      if (sendResult.status === "PENDING") {
        let txStatus = await server.getTransaction(sendResult.hash);
        while (txStatus.status === "NOT_FOUND" || txStatus.status === "SUCCESS") {
           if (txStatus.status === "SUCCESS") break;
           await new Promise(r => setTimeout(r, 1000));
           txStatus = await server.getTransaction(sendResult.hash);
        }
        
        updateToast(toastId, {
          type: "success",
          title: "Funded Successfully",
          txHash: sendResult.hash,
        });
        setSelectedInvoice(null);
        fetchData();
      } else {
        throw new Error(`Failed to send transaction: ${sendResult.status}`);
      }
    } catch (error: any) {
      updateToast(toastId, {
        type: "error",
        title: "Funding Failed",
        message: error.message || "An unknown error occurred",
      });
    } finally {
      setIsFunding(false);
    }
  };

  const sortedInvoices = [...invoices].sort((a: any, b: any) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const discoveryInvoices = sortedInvoices.filter(i => i.status === "Pending");
  const myFundedInvoices = sortedInvoices.filter(i => i.funder === address);

  const toggleSort = (key: keyof Invoice) => {
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
                  <td className="px-6 py-5 font-bold">{formatUSDC(invoice.amount)}</td>
                  <td className="px-6 py-5">
                    <span className="bg-primary-container text-on-primary-container px-2 py-0.5 rounded text-xs font-bold">
                      {(invoice.discount_rate / 100).toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-6 py-5 text-sm">{formatDate(invoice.due_date)}</td>
                  <td className="px-6 py-5 font-bold text-green-600">
                    {formatUSDC(calculateYield(invoice.amount, invoice.discount_rate))}
                  </td>
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
              <p className="text-sm text-on-surface-variant mt-1">Please confirm the details below.</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">You will send:</span>
                <span className="font-bold">{formatUSDC(selectedInvoice.amount)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600 font-medium">
                <span>Freelancer receives immediately:</span>
                <span>{formatUSDC(selectedInvoice.amount - calculateYield(selectedInvoice.amount, selectedInvoice.discount_rate))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">You receive on settlement:</span>
                <span className="font-bold">{formatUSDC(selectedInvoice.amount)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-surface-dim pt-4">
                <span className="text-on-surface-variant">Your yield (discount):</span>
                <span className="font-bold text-green-600">{formatUSDC(calculateYield(selectedInvoice.amount, selectedInvoice.discount_rate))} ({(selectedInvoice.discount_rate / 100).toFixed(2)}%)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Estimated due date:</span>
                <span className="font-bold">{formatDate(selectedInvoice.due_date)}</span>
              </div>
            </div>

            <div className="p-6 bg-surface-container-low flex gap-3">
              <button
                disabled={isFunding}
                onClick={() => setSelectedInvoice(null)}
                className="flex-1 py-3 rounded-xl font-bold text-sm border border-outline-variant hover:bg-surface-dim transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={isFunding}
                onClick={confirmFunding}
                className="flex-[2] py-3 rounded-xl font-bold text-sm bg-primary text-surface-container-lowest hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isFunding ? (
                  <>
                    <span className="w-4 h-4 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin"></span>
                    Funding...
                  </>
                ) : "Confirm & Fund"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

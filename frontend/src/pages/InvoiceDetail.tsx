"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import ActivityFeed from "../../components/ActivityFeed";
import { useWallet } from "../../context/WalletContext";
import { getInvoice, type Invoice } from "../../utils/soroban";
import { formatAddress, formatDate, formatUSDC } from "../../utils/format";
import { TESTNET_USDC_TOKEN_ID } from "../../constants";

interface InvoiceDetailPageProps {
  id: string;
}

export default function InvoiceDetailPage({ id }: InvoiceDetailPageProps) {
  const router = useRouter();
  const { address } = useWallet();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoice = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getInvoice(BigInt(id));
      setInvoice(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-container-lowest">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-container-lowest px-4">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-headline text-on-surface">Invoice not found</h1>
          <p className="mt-4 text-on-surface-variant">{error || "The requested invoice could not be located."}</p>
          <Link href="/dashboard" className="mt-8 inline-block text-primary font-bold hover:underline">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isFreelancer = address === invoice.freelancer;

  return (
    <main className="min-h-screen bg-surface-container-lowest">
      <Navbar />
      
      <section className="pt-32 pb-16 px-6 md:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-bold uppercase tracking-[0.28em] text-primary">Invoice Detail</span>
                <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                  invoice.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                  invoice.status === 'Defaulted' ? 'bg-red-100 text-red-700' :
                  'bg-primary-container text-on-primary-container'
                }`}>
                  {invoice.status}
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-headline">Invoice #{invoice.id.toString()}</h1>
            </div>

            <div className="flex flex-wrap gap-3">
              {isFreelancer && (
                <Link
                  href={{
                    pathname: "/submit",
                    query: {
                      prefill_id: invoice.id.toString(),
                      payer: invoice.payer,
                      amount: (Number(invoice.amount) / 10_000_000).toString(),
                      discount: (invoice.discount_rate / 100).toString(),
                      token: invoice.tokenId || "",
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-bold text-surface-container-lowest shadow-lg hover:bg-primary/90 transition-all active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[20px]">content_copy</span>
                  Submit similar
                </Link>
              )}
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-2xl border border-outline-variant/30 px-6 py-3.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high transition-all"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="md:col-span-2 space-y-6">
              <div className="rounded-[32px] border border-outline-variant/15 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-bold mb-6">Financial Overview</h3>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Face Value</p>
                    <p className="text-2xl font-bold">{formatUSDC(invoice.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Discount Rate</p>
                    <p className="text-2xl font-bold">{(invoice.discount_rate / 100).toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Due Date</p>
                    <p className="text-lg font-semibold">{formatDate(invoice.due_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Settlement Asset</p>
                    <p className="text-lg font-mono font-bold text-primary">USDC</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[32px] border border-outline-variant/15 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-bold mb-6">Wallet Participants</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Freelancer (Provider)</p>
                    <p className="font-mono text-sm break-all bg-surface-container-low p-3 rounded-xl">{invoice.freelancer}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Payer (Client)</p>
                    <p className="font-mono text-sm break-all bg-surface-container-low p-3 rounded-xl">{invoice.payer}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <ActivityFeed invoiceId={invoice.id} />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

/**
 * Public Invoice Status Page
 * Route: /i/[id]
 *
 * A wallet-free, publicly shareable page that lets payers verify an invoice
 * is on-chain. Polls the Soroban contract every 30 s without a full reload.
 *
 * Features
 * ─────────
 * • Displays: Invoice ID, amount (USDC), token, due date, status, discount rate
 * • Privacy toggle: wallet addresses hidden by default; revealed on demand
 * • Status banners: "Paid" (green) | "Defaulted" (neutral) | others
 * • QR code linking to this page's URL
 * • Copy Link + Share on X/Twitter buttons
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getInvoice, type Invoice } from "../../../utils/soroban";
import { formatUsdcFromStroops } from "../../../utils/invoiceSubmission";
import { TESTNET_USDC_TOKEN_ID, NETWORK_NAME } from "../../../constants";

// ─── Types ───────────────────────────────────────────────────────────────────

type LoadState = "loading" | "success" | "error";

const POLL_INTERVAL_MS = 30_000;

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  Open: "Open",
  Funded: "Funded",
  Paid: "Paid",
  Defaulted: "Defaulted",
};

function statusLabel(raw: string): string {
  return STATUS_LABEL[raw] ?? raw;
}

/** Returns Tailwind-compatible classes for the status chip */
function statusChipClass(status: string): string {
  switch (status) {
    case "Paid":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
    case "Defaulted":
      return "bg-amber-500/15 text-amber-400 border-amber-500/25";
    case "Funded":
      return "bg-primary-container/60 text-on-primary-container border-primary/20";
    default:
      return "bg-surface-container-high text-on-surface-variant border-outline-variant/20";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(unixSeconds: bigint): string {
  const ms = Number(unixSeconds) * 1_000;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(ms));
}

function formatDiscountRate(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function shortenAddress(addr: string, chars = 6): string {
  if (addr.length <= chars * 2) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

function tokenLabel(tokenId: string): string {
  if (tokenId === TESTNET_USDC_TOKEN_ID) return "USDC";
  return `${tokenId.slice(0, 4)}…${tokenId.slice(-4)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] ${className}`}
    >
      {children}
    </span>
  );
}

function DataRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-outline-variant/10 py-3.5 last:border-0">
      <span className="shrink-0 text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">
        {label}
      </span>
      <span
        className={`text-right text-sm font-semibold text-on-surface ${mono ? "font-mono break-all" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function PaidBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4"
    >
      <span
        aria-hidden="true"
        className="material-symbols-outlined text-2xl text-emerald-400"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        check_circle
      </span>
      <div>
        <p className="text-sm font-bold text-emerald-400">Invoice settled</p>
        <p className="mt-0.5 text-xs text-emerald-400/80">
          This invoice has been fully paid and settled on-chain.
        </p>
      </div>
    </div>
  );
}

function DefaultedBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4"
    >
      <span
        aria-hidden="true"
        className="material-symbols-outlined text-2xl text-amber-400"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        info
      </span>
      <div>
        <p className="text-sm font-bold text-amber-400">Invoice past due</p>
        <p className="mt-0.5 text-xs text-amber-400/80">
          The due date has passed and this invoice has not been settled.
        </p>
      </div>
    </div>
  );
}

function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-4 border-outline-variant/30 border-t-primary"
      />
      <p className="text-sm font-semibold text-on-surface-variant">{label}</p>
    </div>
  );
}

// ─── Copy-link button ─────────────────────────────────────────────────────────

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  };

  return (
    <button
      id="share-copy-link"
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Link copied to clipboard" : "Copy shareable link"}
      className="flex items-center gap-2 rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-2.5 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-high"
    >
      <span
        className="material-symbols-outlined text-base"
        aria-hidden="true"
        style={{ fontVariationSettings: copied ? "'FILL' 1" : "'FILL' 0" }}
      >
        {copied ? "check" : "link"}
      </span>
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

// ─── Share on X button ────────────────────────────────────────────────────────

function ShareOnXButton({ invoiceId, url }: { invoiceId: bigint; url: string }) {
  const text = encodeURIComponent(
    `Check out Invoice #${invoiceId} on the Invoice Liquidity Network (ILN) — verified on-chain on Stellar ${NETWORK_NAME}.`
  );
  const twitterUrl = `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`;

  return (
    <a
      id="share-on-x"
      href={twitterUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Share this invoice on X (Twitter)"
      className="flex items-center gap-2 rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-2.5 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-high"
    >
      {/* X / Twitter logo — inline SVG to avoid image deps */}
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="shrink-0"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.402 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.264 5.633 5.9-5.633Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Share on X
    </a>
  );
}

// ─── Address row with privacy toggle ─────────────────────────────────────────

function AddressSection({
  freelancer,
  payer,
  funder,
  revealed,
}: {
  freelancer: string;
  payer: string;
  funder?: string;
  revealed: boolean;
}) {
  if (!revealed) return null;
  return (
    <>
      <DataRow label="Freelancer" value={shortenAddress(freelancer)} mono />
      <DataRow label="Payer" value={shortenAddress(payer)} mono />
      {funder && <DataRow label="Funder (LP)" value={shortenAddress(funder)} mono />}
    </>
  );
}

// ─── Polling hook ─────────────────────────────────────────────────────────────

function useInvoicePolling(id: bigint | null) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchInvoice = useCallback(async () => {
    if (id === null) return;
    try {
      const data = await getInvoice(id);
      setInvoice(data);
      setLoadState("success");
      setLastUpdated(new Date());
      setErrorMessage("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load invoice.";
      setErrorMessage(msg);
      setLoadState((prev) => (prev === "loading" ? "error" : prev)); // keep data visible on re-poll error
    }
  }, [id]);

  // Initial fetch
  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  // Polling every 30 s
  useEffect(() => {
    const timer = setInterval(() => {
      fetchInvoice();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchInvoice]);

  return { invoice, loadState, errorMessage, lastUpdated };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvoiceStatusPage({
  params,
}: {
  params: { id: string };
}) {
  // Parse & validate the invoice ID from the URL
  const invoiceId: bigint | null = (() => {
    try {
      const parsed = BigInt(params.id);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  })();

  const { invoice, loadState, errorMessage, lastUpdated } = useInvoicePolling(invoiceId);

  const [addressesRevealed, setAddressesRevealed] = useState(false);

  // Derive the canonical share URL from the browser (client-only)
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  // ── Invalid ID ───────────────────────────────────────────────────────────
  if (invoiceId === null) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <span
            className="material-symbols-outlined text-5xl text-on-surface-variant"
            style={{ fontVariationSettings: "'FILL' 0" }}
            aria-hidden="true"
          >
            receipt_long
          </span>
          <h1 className="mt-4 text-2xl font-headline">Invalid invoice ID</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            The link you followed doesn&apos;t contain a valid invoice identifier. Please check the
            URL and try again.
          </p>
        </div>
      </main>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <main className="min-h-screen px-4">
        <Spinner label={`Loading Invoice #${invoiceId}…`} />
      </main>
    );
  }

  // ── Error (no cached data) ───────────────────────────────────────────────
  if (loadState === "error" && !invoice) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <span
            className="material-symbols-outlined text-5xl text-error"
            style={{ fontVariationSettings: "'FILL' 0" }}
            aria-hidden="true"
          >
            error_outline
          </span>
          <h1 className="mt-4 text-2xl font-headline">Invoice not found</h1>
          <p className="mt-2 text-sm text-on-surface-variant">{errorMessage}</p>
          <p className="mt-1 text-xs text-on-surface-variant/60">Invoice #{params.id}</p>
        </div>
      </main>
    );
  }

  // ── Success (invoice loaded) ─────────────────────────────────────────────
  const inv = invoice!;

  return (
    <>
      {/* SEO / meta injected via Next.js metadata API is not available in
          client components; for public shareability the title is set here
          via a plain <title> update pattern we keep lightweight. */}
      <main className="min-h-screen px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-2xl">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="mb-8 flex flex-col gap-1">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">
              Invoice Liquidity Network · {NETWORK_NAME}
            </p>
            <h1 className="font-headline text-3xl sm:text-4xl">
              Invoice #{inv.id.toString()}
            </h1>
            {lastUpdated && (
              <p className="mt-1 text-xs text-on-surface-variant">
                Last updated{" "}
                {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {" "}— auto-refreshes every 30 s
              </p>
            )}
          </div>

          {/* ── Status banner ────────────────────────────────────────────── */}
          {inv.status === "Paid" && <PaidBanner />}
          {inv.status === "Defaulted" && <DefaultedBanner />}

          {/* ── Data card ────────────────────────────────────────────────── */}
          <section
            aria-label="Invoice details"
            className="mt-6 rounded-[24px] border border-outline-variant/15 bg-surface-container-lowest p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                Invoice details
              </p>
              <Pill className={statusChipClass(inv.status)}>
                {statusLabel(inv.status)}
              </Pill>
            </div>

            {/* Core fields */}
            <DataRow label="Invoice ID" value={`#${inv.id.toString()}`} />
            <DataRow
              label="Amount"
              value={`${formatUsdcFromStroops(inv.amount)} USDC`}
            />
            <DataRow
              label="Token"
              value={tokenLabel(TESTNET_USDC_TOKEN_ID)}
              mono
            />
            <DataRow label="Due date" value={formatDate(inv.due_date)} />
            <DataRow
              label="Discount rate"
              value={formatDiscountRate(inv.discount_rate)}
            />
            {inv.funded_at && (
              <DataRow label="Funded at" value={formatDate(inv.funded_at)} />
            )}

            {/* Privacy: wallet addresses */}
            <div className="mt-2 border-t border-outline-variant/10 pt-4">
              <button
                id="toggle-address-details"
                type="button"
                onClick={() => setAddressesRevealed((v) => !v)}
                aria-expanded={addressesRevealed}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-primary transition-opacity hover:opacity-80"
              >
                <span
                  className="material-symbols-outlined text-base"
                  aria-hidden="true"
                  style={{ fontVariationSettings: addressesRevealed ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {addressesRevealed ? "visibility_off" : "visibility"}
                </span>
                {addressesRevealed ? "Hide details" : "Show details"}
              </button>

              <AddressSection
                freelancer={inv.freelancer}
                payer={inv.payer}
                funder={inv.funder}
                revealed={addressesRevealed}
              />
            </div>
          </section>

          {/* ── Share panel ──────────────────────────────────────────────── */}
          <section
            aria-label="Share this invoice"
            className="mt-6 rounded-[24px] border border-outline-variant/15 bg-surface-container-lowest p-6 shadow-xl"
          >
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">
              Share this invoice
            </p>

            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              {/* QR code */}
              {shareUrl && (
                <div
                  aria-label="QR code linking to this invoice status page"
                  className="shrink-0 self-start rounded-2xl border border-outline-variant/15 bg-white p-3"
                >
                  <QRCodeSVG
                    value={shareUrl}
                    size={148}
                    bgColor="#ffffff"
                    fgColor="#1e212b"
                    level="M"
                    aria-hidden="true"
                  />
                </div>
              )}

              {/* Buttons + hint */}
              <div className="flex flex-col gap-3">
                <p className="text-sm text-on-surface-variant">
                  Anyone with this link can verify the on-chain status of Invoice&nbsp;
                  <strong className="font-bold text-on-surface">#{inv.id.toString()}</strong>{" "}
                  without connecting a wallet.
                </p>

                <div className="flex flex-wrap gap-2">
                  <CopyLinkButton url={shareUrl} />
                  <ShareOnXButton invoiceId={inv.id} url={shareUrl} />
                </div>

                {shareUrl && (
                  <p className="break-all text-[11px] text-on-surface-variant/60">{shareUrl}</p>
                )}
              </div>
            </div>
          </section>

          {/* ── Footer note ──────────────────────────────────────────────── */}
          <p className="mt-8 text-center text-xs text-on-surface-variant/50">
            Invoice data is read directly from the Stellar Soroban smart contract. No wallet
            connection required to view this page.
          </p>
        </div>
      </main>
    </>
  );
}

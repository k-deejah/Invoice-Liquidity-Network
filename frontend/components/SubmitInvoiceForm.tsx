"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { NETWORK_NAME } from "../constants";
import TokenSelector, { TokenAmount } from "../components/TokenSelector";
import { useToast } from "../context/ToastContext";
import { useWallet } from "../context/WalletContext";
import { useApprovedTokens } from "../hooks/useApprovedTokens";
import {
  getMinimumDueDate,
  getYieldPreview,
  type InvoiceFormValues,
  validateInvoiceForm,
  parseAmountToUnits,
  parseDiscountRateToBps,
  toUnixTimestamp,
} from "../utils/invoiceSubmission";
import { submitInvoiceTransaction } from "../utils/soroban";

const INITIAL_FORM: InvoiceFormValues = {
  payer: "",
  amount: "",
  dueDate: "",
  discountRate: "3.00",
  tokenId: "",
};

interface SubmitInvoiceFormProps {
  initialValues?: Partial<InvoiceFormValues>;
  prefillId?: string;
}

export default function SubmitInvoiceForm({ initialValues, prefillId }: SubmitInvoiceFormProps) {
  const { addToast, updateToast } = useToast();
  const { address, isConnected, connect, disconnect, networkMismatch, error: walletError, signTx } = useWallet();
  const { tokens, tokenMap, defaultToken, isLoading: tokensLoading, error: tokensError } = useApprovedTokens();
  
  const [showBanner, setShowBanner] = useState(!!prefillId);
  const [form, setForm] = useState<InvoiceFormValues>({
    ...INITIAL_FORM,
    ...initialValues,
    dueDate: "", // Always blank per requirements
  });
  const [errors, setErrors] = useState<Partial<Record<keyof InvoiceFormValues | "wallet" | "submit", string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedInvoiceId, setSubmittedInvoiceId] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const effectiveTokenId = form.tokenId || defaultToken?.contractId || "";
  const selectedToken = tokenMap.get(effectiveTokenId) ?? defaultToken ?? null;
  const preview = getYieldPreview(form.amount, form.discountRate, selectedToken?.decimals ?? 7);

  const setField = (field: keyof InvoiceFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, submit: undefined, wallet: undefined }));
    setSubmittedInvoiceId(null);
  };

  const handleCopyInvoiceId = async () => {
    if (!submittedInvoiceId) return;

    try {
      await navigator.clipboard.writeText(submittedInvoiceId);
      addToast({ type: "success", title: "Invoice ID copied", message: `Invoice #${submittedInvoiceId} copied to clipboard.` });
    } catch {
      addToast({ type: "error", title: "Copy failed", message: "Unable to copy the invoice ID on this device." });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateInvoiceForm(
      { ...form, tokenId: effectiveTokenId },
      isConnected,
      selectedToken?.decimals ?? 7,
      selectedToken?.symbol ?? "token",
    );
    if (networkMismatch) {
      nextErrors.wallet = `Freighter must be connected to ${NETWORK_NAME}.`;
    }
    if (!selectedToken && !tokensLoading) {
      nextErrors.tokenId = "No approved tokens are currently available.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const amount = parseAmountToUnits(form.amount, selectedToken?.decimals ?? 7);
    const dueDate = toUnixTimestamp(form.dueDate);
    const discountRate = parseDiscountRateToBps(form.discountRate);

    if (!address || !selectedToken || amount === null || dueDate === null || discountRate === null) {
      setErrors({ submit: "Please review the form values and try again." });
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    setSubmittedInvoiceId(null);

    const toastId = addToast({ type: "pending", title: "Submitting invoice to Stellar testnet..." });

    try {
      const result = await submitInvoiceTransaction({
        freelancer: address,
        payer: form.payer.trim(),
        amount,
        dueDate,
        discountRate,
        signTx,
        token: selectedToken.contractId,
      });

      const invoiceId = result.invoiceId.toString();
      setSubmittedInvoiceId(invoiceId);
      setLastTxHash(result.txHash);
      updateToast(toastId, {
        type: "success",
        title: "Invoice submitted",
        message: `Invoice #${invoiceId} is now live on ${NETWORK_NAME}.`,
        txHash: result.txHash,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The transaction did not complete successfully.";
      setErrors({ submit: message });
      updateToast(toastId, {
        type: "error",
        title: "Submission failed",
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="submit-invoice-form" className="bg-surface-container-lowest p-6 sm:p-8 rounded-[28px] shadow-xl border border-outline-variant/15">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">Freelancer Portal</p>
            <h3 className="text-2xl font-headline mt-2">Submit a new invoice on Stellar testnet</h3>
            <p className="text-sm text-on-surface-variant mt-2 max-w-xl">
              Connect Freighter, enter the payer wallet, choose an approved token, and publish an invoice with an instant yield preview for you and liquidity providers.
            </p>
          </div>

          <div className="sm:min-w-[220px]">
            {isConnected ? (
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">
                      Wallet
                    </p>
                    <p className="font-mono text-sm break-all mt-1">{address}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                      networkMismatch
                        ? "bg-error-container text-on-error-container"
                        : "bg-primary-container text-on-primary-container"
                    }`}
                  >
                    {networkMismatch ? "Wrong network" : NETWORK_NAME}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={disconnect}
                  className="mt-4 w-full rounded-xl border border-outline-variant/20 px-4 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={connect}
                className="w-full rounded-2xl bg-primary px-5 py-4 text-sm font-bold text-surface-container-lowest shadow-lg hover:bg-primary/90 transition-colors"
              >
                Connect Freighter wallet
              </button>
            )}
          </div>
        </div>

        {errors.wallet || walletError ? (
          <div className="rounded-2xl border border-error/15 bg-error-container/70 px-4 py-3 text-sm text-on-error-container">
            {errors.wallet ?? walletError}
          </div>
        ) : null}

        {showBanner && prefillId && (
          <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4 transition-all animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">info</span>
              <p className="text-sm font-bold text-primary">Pre-filled from invoice #{prefillId}</p>
            </div>
            <button 
              type="button"
              onClick={() => setShowBanner(false)}
              className="rounded-full p-1 hover:bg-primary/20 text-primary transition-colors"
              aria-label="Dismiss banner"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        )}

        <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" onSubmit={handleSubmit}>
          <div className="space-y-5">
            <Field
              label="Payer Stellar address"
              error={errors.payer}
              hint="Use the payer's public account address on Stellar testnet."
            >
              <input
                value={form.payer}
                onChange={(event) => setField("payer", event.target.value)}
                className="w-full rounded-2xl bg-surface-container-low px-4 py-3.5 text-sm border border-outline-variant/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                placeholder="G..."
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            <TokenSelector
              label="Settlement token"
              value={effectiveTokenId}
              tokens={tokens}
              error={errors.tokenId}
              disabled={tokensLoading || isSubmitting}
              onChange={(value) => setField("tokenId", value)}
              hint={
                tokensError
                  ? tokensError
                  : tokensLoading
                    ? "Loading approved tokens from the contract..."
                    : "Approved tokens are fetched dynamically from the ILN token registry."
              }
            />

            <div className="grid gap-5 md:grid-cols-2">
              <Field label={`Invoice amount${selectedToken ? ` (${selectedToken.symbol})` : ""}`} error={errors.amount}>
                <input
                  value={form.amount}
                  onChange={(event) => setField("amount", event.target.value)}
                  className="w-full rounded-2xl bg-surface-container-low px-4 py-3.5 text-sm border border-outline-variant/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="5000.00"
                  inputMode="decimal"
                />
              </Field>

              <Field label="Due date" error={errors.dueDate}>
                <input
                  value={form.dueDate}
                  onChange={(event) => setField("dueDate", event.target.value)}
                  min={getMinimumDueDate()}
                  className="w-full rounded-2xl bg-surface-container-low px-4 py-3.5 text-sm border border-outline-variant/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  type="date"
                />
              </Field>
            </div>

            <Field
              label="Discount rate (%)"
              error={errors.discountRate}
              hint="The spread a liquidity provider earns when the payer settles in full."
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                <input
                  value={form.discountRate}
                  onChange={(event) => setField("discountRate", event.target.value)}
                  className="w-full rounded-2xl bg-surface-container-low px-4 py-3.5 text-sm border border-outline-variant/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="3.00"
                  inputMode="decimal"
                />
                <div className="rounded-2xl bg-primary-container/70 px-4 py-3 text-center text-sm font-bold text-on-primary-container">
                  {preview.discountRatePercent.toFixed(2)}%
                </div>
              </div>
            </Field>

            {errors.submit ? (
              <div className="rounded-2xl border border-error/15 bg-error-container/70 px-4 py-3 text-sm text-on-error-container">
                {errors.submit}
              </div>
            ) : null}

            {submittedInvoiceId ? (
              <div className="rounded-2xl border border-primary/15 bg-primary-container/35 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-on-primary-container/80">Submission successful</p>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-on-primary-container/80">Returned invoice ID</p>
                    <p className="text-2xl font-bold text-on-primary-container">#{submittedInvoiceId}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyInvoiceId}
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-surface-container-lowest hover:bg-primary/90 transition-colors"
                  >
                    Copy invoice ID
                  </button>
                </div>
                {lastTxHash ? (
                  <p className="mt-3 text-xs text-on-primary-container/80 break-all">Transaction hash: {lastTxHash}</p>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-primary px-5 py-4 text-sm font-bold text-surface-container-lowest shadow-lg hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? "Submitting invoice..." : "Submit invoice"}
            </button>
          </div>

          <aside className="rounded-[24px] bg-surface-container-low p-5 border border-outline-variant/15 h-fit">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Live yield preview</p>
            <div className="mt-5 space-y-4">
              <PreviewRow label="Invoice face value" value={`${preview.amountFormatted} ${selectedToken?.symbol ?? ""}`.trim()} token={selectedToken ?? undefined} />
              <PreviewRow label="Freelancer payout" value={`${preview.payoutFormatted} ${selectedToken?.symbol ?? ""}`.trim()} token={selectedToken ?? undefined} accent />
              <PreviewRow label="LP yield at settlement" value={`${preview.yieldFormatted} ${selectedToken?.symbol ?? ""}`.trim()} token={selectedToken ?? undefined} />
              <PreviewRow label="Discount rate" value={`${preview.discountRatePercent.toFixed(2)}%`} />
            </div>
            <div className="mt-5 rounded-2xl bg-surface-container-high px-4 py-4 text-sm text-on-surface-variant">
              Submission is limited to {NETWORK_NAME}. The selected token is sent on-chain using that token contract&apos;s decimals, and the payer must later settle with the same asset.
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-on-surface-variant">{label}</span>
        {error ? <span className="text-xs font-bold text-error">{error}</span> : null}
      </div>
      {children}
      {hint ? <p className="mt-2 text-xs text-on-surface-variant">{hint}</p> : null}
    </label>
  );
}

function PreviewRow({
  label,
  value,
  token,
  accent,
}: {
  label: string;
  value: string;
  token?: { symbol: string; iconLabel: string; contractId: string; name: string; decimals: number };
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-container-lowest px-4 py-3">
      <span className="text-sm text-on-surface-variant">{label}</span>
      {token ? (
        <TokenAmount
          amount={value}
          token={token}
          className={`text-sm font-bold ${accent ? "text-primary" : "text-on-surface"}`}
        />
      ) : (
        <span className={`text-sm font-bold ${accent ? "text-primary" : "text-on-surface"}`}>{value}</span>
      )}
    </div>
  );
}

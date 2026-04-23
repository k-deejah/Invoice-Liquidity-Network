"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Footer from "../../../components/Footer";
import Navbar from "../../../components/Navbar";
import { useToast } from "../../../context/ToastContext";
import { useWallet } from "../../../context/WalletContext";
import {
    AcceptedToken,
    CreateProposalFormType,
    CreateProposalPayload,
    ProtocolParameters,
    createProposal,
    fetchProtocolParameters,
    formatVotingPower,
    getVotingPower,
    isValidStellarAddress,
    lookupToken,
} from "../../../utils/governance";

// ─── Constants ────────────────────────────────────────────────────────────────

const FORM_TYPES: Array<{
  id: CreateProposalFormType;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: "FeeRate",
    label: "Fee Rate",
    description: "Adjust the protocol fee charged on invoice settlements",
    icon: "percent",
  },
  {
    id: "MaxDiscountRate",
    label: "Max Discount Rate",
    description: "Change the maximum discount rate freelancers can offer LPs",
    icon: "trending_down",
  },
  {
    id: "AddToken",
    label: "Add Token",
    description: "Propose a new asset to be accepted by the protocol",
    icon: "add_circle",
  },
  {
    id: "RemoveToken",
    label: "Remove Token",
    description: "Deprecate an asset currently accepted by the protocol",
    icon: "remove_circle",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 space-y-5">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function FieldLabel({
  label,
  required,
  hint,
}: {
  label: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-1.5">
      <label className="text-sm font-medium text-on-surface">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-on-surface-variant mt-0.5">{hint}</p>}
    </div>
  );
}

function InputWrapper({
  error,
  children,
}: {
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px]">error</span>
          {error}
        </p>
      )}
    </div>
  );
}

function CurrentValueChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/20 text-xs">
      <span className="text-on-surface-variant">{label}:</span>
      <span className="font-semibold font-mono text-primary">{value}</span>
    </div>
  );
}

// ─── Proposal type selector card ──────────────────────────────────────────────

function TypeCard({
  type,
  selected,
  onSelect,
}: {
  type: (typeof FORM_TYPES)[0];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left w-full rounded-xl border-2 p-4 transition-all duration-150 active:scale-[0.98] ${
        selected
          ? "border-primary bg-primary/8 shadow-md"
          : "border-outline-variant/30 bg-surface-container-lowest hover:border-primary/40 hover:bg-surface-container"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`material-symbols-outlined text-[22px] mt-0.5 ${
            selected ? "text-primary" : "text-on-surface-variant"
          }`}
          style={selected ? { fontVariationSettings: "'FILL' 1" } : {}}
        >
          {type.icon}
        </span>
        <div>
          <p
            className={`text-sm font-semibold ${
              selected ? "text-primary" : "text-on-surface"
            }`}
          >
            {type.label}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
            {type.description}
          </p>
        </div>
        {selected && (
          <span
            className="material-symbols-outlined text-primary text-[18px] ml-auto shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
        )}
      </div>
    </button>
  );
}

// ─── BPS input with live % preview ───────────────────────────────────────────

function BpsInput({
  value,
  onChange,
  min,
  max,
  error,
  currentBps,
  paramLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  error?: string;
  currentBps: number;
  paramLabel: string;
}) {
  const numVal = Number(value);
  const pct = isNaN(numVal) ? null : (numVal / 100).toFixed(2);

  return (
    <InputWrapper error={error}>
      <div className="flex gap-3 items-start flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <div className="relative">
            <input
              type="number"
              min={min}
              max={max}
              step={1}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`e.g. ${currentBps}`}
              className={`w-full px-4 py-2.5 pr-16 rounded-xl border text-sm bg-surface-container-lowest text-on-surface transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                error
                  ? "border-red-500/60"
                  : "border-outline-variant/30 focus:border-primary"
              }`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant font-medium">
              bps
            </span>
          </div>
          {pct !== null && !isNaN(numVal) && value !== "" && (
            <p className="mt-1 text-xs text-primary font-medium">= {pct}%</p>
          )}
        </div>
        <CurrentValueChip
          label={`Current ${paramLabel}`}
          value={`${currentBps} bps (${(currentBps / 100).toFixed(2)}%)`}
        />
      </div>
      <p className="mt-1.5 text-xs text-on-surface-variant">
        Enter a value between {min} and {max} basis points.
        {max === 1000 && " (0–10.00%)"}
        {max === 5000 && " (0–50.00%)"}
      </p>
    </InputWrapper>
  );
}

// ─── Token address field with lookup ─────────────────────────────────────────

function TokenAddressField({
  value,
  onChange,
  onResolved,
  resolvedToken,
  error,
  isLooking,
}: {
  value: string;
  onChange: (v: string) => void;
  onResolved: (token: AcceptedToken | null) => void;
  resolvedToken: AcceptedToken | null;
  error?: string;
  isLooking: boolean;
}) {
  return (
    <InputWrapper error={error}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onResolved(null);
          }}
          placeholder="G... (56-character Stellar address)"
          spellCheck={false}
          className={`w-full px-4 py-2.5 rounded-xl border text-sm font-mono bg-surface-container-lowest text-on-surface transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
            error
              ? "border-red-500/60"
              : resolvedToken
              ? "border-emerald-500/60"
              : "border-outline-variant/30 focus:border-primary"
          }`}
        />
        {isLooking && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="animate-spin material-symbols-outlined text-primary text-[18px]">
              progress_activity
            </span>
          </span>
        )}
        {resolvedToken && !isLooking && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-emerald-500 text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
        )}
      </div>
      {resolvedToken && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/8 border border-emerald-500/20 text-xs">
          <span
            className="material-symbols-outlined text-emerald-500 text-[15px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            token
          </span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {resolvedToken.name}
          </span>
          <span className="text-on-surface-variant">({resolvedToken.symbol})</span>
        </div>
      )}
      <p className="mt-1.5 text-xs text-on-surface-variant">
        The token's contract address on Stellar testnet. Must be a valid Soroban token contract.
      </p>
    </InputWrapper>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface FormErrors {
  formType?: string;
  title?: string;
  description?: string;
  bpsValue?: string;
  tokenAddress?: string;
  removeToken?: string;
}

export default function NewProposalPage() {
  const router = useRouter();
  const { address, isConnected, connect } = useWallet();
  const { signTx } = useWallet();
  const { addToast, updateToast } = useToast();

  // ── Server data ─────────────────────────────────────────────────────────────
  const [params, setParams] = useState<ProtocolParameters | null>(null);
  const [paramsLoading, setParamsLoading] = useState(true);
  const [votingPower, setVotingPower] = useState<number>(0);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [selectedType, setSelectedType] = useState<CreateProposalFormType | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bpsValue, setBpsValue] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [resolvedToken, setResolvedToken] = useState<AcceptedToken | null>(null);
  const [removeTokenAddress, setRemoveTokenAddress] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // debounce ref for address lookup
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load protocol params ────────────────────────────────────────────────────
  useEffect(() => {
    fetchProtocolParameters().then((p) => {
      setParams(p);
      setParamsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (isConnected && address) {
      getVotingPower(address).then(setVotingPower);
    }
  }, [isConnected, address]);

  // ── Auto-generate title when type + value are filled ───────────────────────
  useEffect(() => {
    if (!selectedType || !params) return;
    let autoTitle = "";
    switch (selectedType) {
      case "FeeRate":
        if (bpsValue)
          autoTitle = `Change Protocol Fee Rate to ${(Number(bpsValue) / 100).toFixed(2)}%`;
        break;
      case "MaxDiscountRate":
        if (bpsValue)
          autoTitle = `Change Max Discount Rate to ${(Number(bpsValue) / 100).toFixed(2)}%`;
        break;
      case "AddToken":
        if (resolvedToken)
          autoTitle = `Add ${resolvedToken.symbol} as Accepted Protocol Token`;
        break;
      case "RemoveToken": {
        const tok = params.acceptedTokens.find((t) => t.address === removeTokenAddress);
        if (tok) autoTitle = `Remove ${tok.symbol} from Accepted Tokens`;
        break;
      }
    }
    if (autoTitle) setTitle(autoTitle);
  }, [selectedType, bpsValue, resolvedToken, removeTokenAddress, params]);

  // ── Token address debounce lookup ───────────────────────────────────────────
  const handleTokenAddressChange = useCallback(
    (val: string) => {
      setTokenAddress(val);
      setResolvedToken(null);
      setErrors((e) => ({ ...e, tokenAddress: undefined }));

      if (lookupTimer.current) clearTimeout(lookupTimer.current);

      if (!isValidStellarAddress(val.trim())) return;

      lookupTimer.current = setTimeout(async () => {
        setIsLookingUp(true);
        try {
          const token = await lookupToken(val.trim());
          setResolvedToken(token);
          setErrors((e) => ({ ...e, tokenAddress: undefined }));
        } catch (err) {
          setErrors((e) => ({
            ...e,
            tokenAddress: err instanceof Error ? err.message : "Invalid token address",
          }));
        } finally {
          setIsLookingUp(false);
        }
      }, 600);
    },
    []
  );

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: FormErrors = {};

    if (!selectedType) {
      errs.formType = "Please select a proposal type.";
    }

    if (!title.trim()) {
      errs.title = "Title is required.";
    } else if (title.trim().length < 10) {
      errs.title = "Title must be at least 10 characters.";
    } else if (title.trim().length > 120) {
      errs.title = "Title must be 120 characters or fewer.";
    }

    if (!description.trim()) {
      errs.description = "Description is required.";
    } else if (description.trim().length < 30) {
      errs.description = "Please provide a more detailed description (at least 30 characters).";
    } else if (description.trim().length > 1000) {
      errs.description = "Description must be 1,000 characters or fewer.";
    }

    if (selectedType === "FeeRate" || selectedType === "MaxDiscountRate") {
      const max = selectedType === "FeeRate" ? 1000 : 5000;
      const num = Number(bpsValue);
      if (!bpsValue || isNaN(num)) {
        errs.bpsValue = "Please enter a numeric value.";
      } else if (num < 1 || num > max) {
        errs.bpsValue = `Value must be between 1 and ${max} bps.`;
      } else if (!Number.isInteger(num)) {
        errs.bpsValue = "Value must be a whole number.";
      }
    }

    if (selectedType === "AddToken") {
      if (!tokenAddress.trim()) {
        errs.tokenAddress = "Token address is required.";
      } else if (!isValidStellarAddress(tokenAddress.trim())) {
        errs.tokenAddress = "Invalid Stellar address.";
      } else if (!resolvedToken) {
        errs.tokenAddress = "Token address could not be resolved. Please check and try again.";
      }
    }

    if (selectedType === "RemoveToken") {
      if (!removeTokenAddress) {
        errs.removeToken = "Please select a token to remove.";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !selectedType || !address) return;

    setIsSubmitting(true);
    const toastId = addToast({ type: "pending", title: "Submitting proposal…" });

    try {
      const payload: CreateProposalPayload = {
        formType: selectedType,
        title: title.trim(),
        description: description.trim(),
        newValueBps: bpsValue ? Number(bpsValue) : undefined,
        tokenAddress: tokenAddress.trim() || undefined,
        tokenName: resolvedToken?.name,
        removeTokenAddress: removeTokenAddress || undefined,
      };

      const { txHash, proposalId } = await createProposal(payload, address, signTx);

      updateToast(toastId, {
        type: "success",
        title: "Proposal created",
        txHash,
      });

      router.push(`/governance/${proposalId}`);
    } catch (err) {
      updateToast(toastId, {
        type: "error",
        title: "Submission failed",
        message: err instanceof Error ? err.message : "Transaction rejected",
      });
      setIsSubmitting(false);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const hasEnoughILN = params ? votingPower >= params.minProposalILN : false;
  const canSubmit = isConnected && hasEnoughILN && !isSubmitting;

  const descLength = description.length;
  const descMax = 1000;

  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Header */}
      <section className="pt-32 pb-10 px-8 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div className="max-w-3xl mx-auto">
          <nav className="mb-6">
            <Link
              href="/governance"
              className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              All Proposals
            </Link>
          </nav>
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">
            ILN Governance
          </p>
          <h1 className="text-4xl font-headline mb-2">Create a Proposal</h1>
          <p className="text-on-surface-variant text-base leading-relaxed">
            Propose a change to the ILN protocol. Once submitted, the community will have{" "}
            <strong>7 days</strong> to vote.
          </p>
        </div>
      </section>

      {/* Body */}
      <div className="py-12 px-8">
        <div className="max-w-3xl mx-auto">
          {/* Eligibility banner */}
          <div className="mb-8">
            {!isConnected ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span className="material-symbols-outlined text-amber-500 text-[22px]">
                  account_balance_wallet
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    Wallet not connected
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Connect your Freighter wallet to submit a proposal.
                  </p>
                </div>
                <button
                  onClick={connect}
                  className="shrink-0 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all"
                >
                  Connect Wallet
                </button>
              </div>
            ) : paramsLoading ? (
              <div className="h-16 rounded-xl bg-surface-container animate-pulse" />
            ) : !hasEnoughILN ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 flex items-start gap-3">
                <span
                  className="material-symbols-outlined text-red-500 text-[22px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  block
                </span>
                <div>
                  <p className="text-sm font-semibold text-red-500">
                    Insufficient ILN balance
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    You need at least{" "}
                    <strong>{formatVotingPower(params!.minProposalILN)}</strong> to create a
                    proposal. Your balance:{" "}
                    <strong>{formatVotingPower(votingPower)}</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 flex items-center gap-3">
                <span
                  className="material-symbols-outlined text-emerald-500 text-[22px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified
                </span>
                <div>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    Eligible to propose
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Your voting power: <strong>{formatVotingPower(votingPower)}</strong> ·
                    Minimum required:{" "}
                    <strong>{formatVotingPower(params!.minProposalILN)}</strong>
                  </p>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* ── Step 1: Type selector ──────────────────────────────────── */}
            <SectionCard title="Proposal Type" icon="category">
              <p className="text-sm text-on-surface-variant -mt-2">
                Choose the kind of change you are proposing.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FORM_TYPES.map((t) => (
                  <TypeCard
                    key={t.id}
                    type={t}
                    selected={selectedType === t.id}
                    onSelect={() => {
                      setSelectedType(t.id);
                      setBpsValue("");
                      setTokenAddress("");
                      setResolvedToken(null);
                      setRemoveTokenAddress("");
                      setTitle("");
                      setErrors({});
                    }}
                  />
                ))}
              </div>
              {errors.formType && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">error</span>
                  {errors.formType}
                </p>
              )}
            </SectionCard>

            {/* ── Step 2: Dynamic fields ─────────────────────────────────── */}
            {selectedType && (
              <SectionCard title="Proposal Details" icon="tune">
                {/* FeeRate */}
                {selectedType === "FeeRate" && (
                  <div>
                    <FieldLabel
                      label="New Fee Rate"
                      required
                      hint="The fee deducted from invoice settlements, expressed in basis points."
                    />
                    <BpsInput
                      value={bpsValue}
                      onChange={setBpsValue}
                      min={1}
                      max={1000}
                      error={errors.bpsValue}
                      currentBps={params?.feeRateBps ?? 50}
                      paramLabel="fee rate"
                    />
                  </div>
                )}

                {/* MaxDiscountRate */}
                {selectedType === "MaxDiscountRate" && (
                  <div>
                    <FieldLabel
                      label="New Maximum Discount Rate"
                      required
                      hint="The highest discount rate a freelancer may offer a liquidity provider."
                    />
                    <BpsInput
                      value={bpsValue}
                      onChange={setBpsValue}
                      min={1}
                      max={5000}
                      error={errors.bpsValue}
                      currentBps={params?.maxDiscountRateBps ?? 500}
                      paramLabel="max discount rate"
                    />
                  </div>
                )}

                {/* AddToken */}
                {selectedType === "AddToken" && (
                  <div className="space-y-4">
                    <div>
                      <FieldLabel
                        label="Token Contract Address"
                        required
                        hint="The Soroban-compatible token contract address to add."
                      />
                      <TokenAddressField
                        value={tokenAddress}
                        onChange={handleTokenAddressChange}
                        onResolved={setResolvedToken}
                        resolvedToken={resolvedToken}
                        error={errors.tokenAddress}
                        isLooking={isLookingUp}
                      />
                    </div>

                    {/* Currently accepted tokens for context */}
                    {params && (
                      <div>
                        <p className="text-xs font-medium text-on-surface-variant mb-2">
                          Currently accepted tokens:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {params.acceptedTokens.map((t) => (
                            <span
                              key={t.address}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container border border-outline-variant/20 text-xs"
                            >
                              <span
                                className="material-symbols-outlined text-primary text-[12px]"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                              >
                                check_circle
                              </span>
                              <span className="font-medium">{t.symbol}</span>
                              <span className="text-on-surface-variant font-mono text-[10px]">
                                {t.address.slice(0, 6)}…
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* RemoveToken */}
                {selectedType === "RemoveToken" && (
                  <div className="space-y-4">
                    <div>
                      <FieldLabel
                        label="Token to Remove"
                        required
                        hint="Select which currently accepted token you wish to deprecate."
                      />
                      <InputWrapper error={errors.removeToken}>
                        {paramsLoading ? (
                          <div className="h-10 rounded-xl bg-surface-container animate-pulse" />
                        ) : params && params.acceptedTokens.length > 0 ? (
                          <div className="space-y-2">
                            {params.acceptedTokens.map((token) => (
                              <label
                                key={token.address}
                                className={`flex items-center gap-4 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                                  removeTokenAddress === token.address
                                    ? "border-red-500/50 bg-red-500/5"
                                    : "border-outline-variant/30 hover:border-red-500/30 hover:bg-surface-container"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="removeToken"
                                  value={token.address}
                                  checked={removeTokenAddress === token.address}
                                  onChange={() => {
                                    setRemoveTokenAddress(token.address);
                                    setErrors((e) => ({ ...e, removeToken: undefined }));
                                  }}
                                  className="accent-red-500 w-4 h-4"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold">
                                    {token.symbol}{" "}
                                    <span className="text-on-surface-variant font-normal">
                                      — {token.name}
                                    </span>
                                  </p>
                                  <p className="text-xs font-mono text-on-surface-variant truncate">
                                    {token.address}
                                  </p>
                                </div>
                                {removeTokenAddress === token.address && (
                                  <span
                                    className="material-symbols-outlined text-red-500 text-[18px] shrink-0"
                                    style={{ fontVariationSettings: "'FILL' 1" }}
                                  >
                                    remove_circle
                                  </span>
                                )}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-on-surface-variant py-3">
                            No accepted tokens available to remove.
                          </p>
                        )}
                      </InputWrapper>
                    </div>

                    {removeTokenAddress && params && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                        <span className="material-symbols-outlined text-[15px] mt-0.5">warning</span>
                        <span>
                          Removing a token will prevent any new invoices from being
                          denominated in it. Existing funded invoices are unaffected.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>
            )}

            {/* ── Step 3: Title & description ────────────────────────────── */}
            {selectedType && (
              <SectionCard title="Title & Description" icon="edit_note">
                {/* Title */}
                <div>
                  <FieldLabel
                    label="Proposal Title"
                    required
                    hint="A concise summary (auto-filled based on your inputs above)."
                  />
                  <InputWrapper error={errors.title}>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setErrors((er) => ({ ...er, title: undefined }));
                      }}
                      maxLength={120}
                      placeholder="e.g. Reduce Protocol Fee Rate to 0.25%"
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm bg-surface-container-lowest text-on-surface transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                        errors.title
                          ? "border-red-500/60"
                          : "border-outline-variant/30 focus:border-primary"
                      }`}
                    />
                    <div className="flex justify-end mt-1">
                      <span className="text-[11px] text-on-surface-variant">
                        {title.length}/120
                      </span>
                    </div>
                  </InputWrapper>
                </div>

                {/* Description */}
                <div>
                  <FieldLabel
                    label="Description"
                    required
                    hint="Explain why this change is beneficial and what impact it will have. This is stored in the transaction memo."
                  />
                  <InputWrapper error={errors.description}>
                    <textarea
                      rows={6}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setErrors((er) => ({ ...er, description: undefined }));
                      }}
                      maxLength={descMax}
                      placeholder="Provide the rationale for this proposal, potential benefits, risks, and any supporting data…"
                      className={`w-full px-4 py-3 rounded-xl border text-sm bg-surface-container-lowest text-on-surface leading-relaxed resize-none transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                        errors.description
                          ? "border-red-500/60"
                          : "border-outline-variant/30 focus:border-primary"
                      }`}
                    />
                    <div className="flex justify-end mt-1">
                      <span
                        className={`text-[11px] ${
                          descLength > descMax * 0.9
                            ? "text-amber-500"
                            : "text-on-surface-variant"
                        }`}
                      >
                        {descLength}/{descMax}
                      </span>
                    </div>
                  </InputWrapper>
                </div>
              </SectionCard>
            )}

            {/* ── Submit ──────────────────────────────────────────────────── */}
            {selectedType && (
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-semibold text-on-surface">
                      Ready to submit?
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Submitting will sign a Soroban transaction via Freighter.
                      {params && (
                        <>
                          {" "}
                          Minimum{" "}
                          <span className="font-semibold">
                            {formatVotingPower(params.minProposalILN)}
                          </span>{" "}
                          required.
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex gap-3 shrink-0">
                    <Link
                      href="/governance"
                      className="px-5 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
                    >
                      Cancel
                    </Link>
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                        canSubmit
                          ? "bg-primary text-white hover:bg-primary/90 shadow-md"
                          : "bg-surface-container text-on-surface-variant cursor-not-allowed"
                      }`}
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin material-symbols-outlined text-[16px]">
                            progress_activity
                          </span>
                          Submitting…
                        </span>
                      ) : !isConnected ? (
                        "Connect wallet first"
                      ) : !hasEnoughILN ? (
                        "Insufficient ILN"
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px]">
                            rocket_launch
                          </span>
                          Submit Proposal
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      <Footer />
    </main>
  );
}

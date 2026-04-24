/**
 * @file SubmitInvoiceForm.test.tsx
 *
 * Covers:
 *  - Field-level validation (invalid & valid inputs)
 *  - Wallet-not-connected guard
 *  - Network mismatch guard
 *  - Successful submission flow (invoice ID + tx hash displayed)
 *  - Contract error reflected in the UI error banner
 *  - Submit button disabled while in-flight
 *  - Live yield preview reacts to amount / discount-rate changes
 */

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SubmitInvoiceForm from "../SubmitInvoiceForm";

// ─── Stable mock handles ────────────────────────────────────────────────────

const addToast = vi.fn(() => "toast-id-1");
const updateToast = vi.fn();
const submitInvoiceTransaction = vi.fn();

/** Mutable wallet state shared across tests – reset in beforeEach. */
const walletState = {
  address: null as string | null,
  isConnected: false,
  isInstalled: true,
  error: null as string | null,
  networkMismatch: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  signTx: vi.fn(),
};

// ─── Module mocks ────────────────────────────────────────────────────────────

/** Mock Freighter API so no browser extension is required. */
vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn().mockResolvedValue(false),
  getAddress: vi.fn().mockResolvedValue({ address: null }),
  setAllowed: vi.fn().mockResolvedValue(false),
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: "signed-xdr" }),
  getNetwork: vi.fn().mockResolvedValue({ network: "TESTNET" }),
}));

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ addToast, updateToast }),
}));

vi.mock("../../context/WalletContext", () => ({
  useWallet: () => walletState,
}));

vi.mock("../../utils/soroban", () => ({
  submitInvoiceTransaction: (...args: unknown[]) => submitInvoiceTransaction(...args),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_STELLAR_PAYER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const VALID_STELLAR_FREELANCER = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC6";

function connectWallet(address = VALID_STELLAR_FREELANCER) {
  walletState.address = address;
  walletState.isConnected = true;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SubmitInvoiceForm", () => {
  beforeEach(() => {
    walletState.address = null;
    walletState.isConnected = false;
    walletState.error = null;
    walletState.networkMismatch = false;
    walletState.connect.mockReset();
    walletState.disconnect.mockReset();
    walletState.signTx.mockReset();
    addToast.mockClear();
    updateToast.mockClear();
    submitInvoiceTransaction.mockReset();
  });

  // ── Disconnected state ────────────────────────────────────────────────────

  it("renders the 'Connect Freighter wallet' button when disconnected", () => {
    render(<SubmitInvoiceForm />);
    expect(screen.getByRole("button", { name: /connect freighter wallet/i })).toBeInTheDocument();
  });

  it("shows the wallet error banner when submitting without a connected wallet", async () => {
    render(<SubmitInvoiceForm />);
    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    expect(
      await screen.findByText(/connect your freighter wallet to submit an invoice/i),
    ).toBeInTheDocument();
    expect(submitInvoiceTransaction).not.toHaveBeenCalled();
  });

  // ── Field validation ──────────────────────────────────────────────────────

  it("rejects an empty payer address", async () => {
    connectWallet();
    render(<SubmitInvoiceForm />);

    // Amount and dueDate are also empty so multiple errors fire – we only care about payer
    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));
    expect(await screen.findByText(/payer stellar address is required/i)).toBeInTheDocument();
  });

  it("rejects a payer address that is not a valid Stellar public key", async () => {
    connectWallet();
    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("G..."), {
      target: { value: "not-a-stellar-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    expect(
      await screen.findByText(/enter a valid stellar public key for the payer/i),
    ).toBeInTheDocument();
  });

  it("rejects a non-numeric invoice amount", async () => {
    connectWallet();
    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("5000.00"), {
      target: { value: "not-a-number" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    expect(await screen.findByText(/enter a valid invoice amount in usdc/i)).toBeInTheDocument();
  });

  it("rejects a zero invoice amount", async () => {
    connectWallet();
    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("5000.00"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    expect(await screen.findByText(/enter a valid invoice amount in usdc/i)).toBeInTheDocument();
  });

  it("rejects a due date that is missing", async () => {
    connectWallet();
    render(<SubmitInvoiceForm />);

    // Leave dueDate empty
    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));
    expect(await screen.findByText(/select a valid due date/i)).toBeInTheDocument();
  });

  it("rejects a discount rate of 0", async () => {
    connectWallet();
    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("3.00"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    expect(
      await screen.findByText(/discount rate must be between 0\.01% and 50%/i),
    ).toBeInTheDocument();
  });

  it("rejects a discount rate above 50%", async () => {
    connectWallet();
    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("3.00"), { target: { value: "51" } });
    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    expect(
      await screen.findByText(/discount rate must be between 0\.01% and 50%/i),
    ).toBeInTheDocument();
  });

  // ── Network mismatch guard ────────────────────────────────────────────────

  it("shows a network-mismatch wallet error when the wallet is on the wrong network", async () => {
    connectWallet();
    walletState.networkMismatch = true;
    render(<SubmitInvoiceForm />);

    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    expect(
      await screen.findByText(/freighter must be connected to testnet/i),
    ).toBeInTheDocument();
    expect(submitInvoiceTransaction).not.toHaveBeenCalled();
  });

  it("renders the 'Wrong network' badge in the wallet panel when networkMismatch is true", () => {
    connectWallet();
    walletState.networkMismatch = true;
    render(<SubmitInvoiceForm />);

    expect(screen.getByText("Wrong network")).toBeInTheDocument();
  });

  // ── Live yield preview ────────────────────────────────────────────────────

  it("updates the live yield preview as the user types amount and discount rate", () => {
    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("5000.00"), { target: { value: "10000" } });
    fireEvent.change(screen.getByPlaceholderText("3.00"), { target: { value: "5" } });

    // Face value
    expect(screen.getByText("$10,000.00")).toBeInTheDocument();
    // Freelancer payout = 10000 – (10000 * 5%) = 9500
    expect(screen.getByText("$9,500.00")).toBeInTheDocument();
    // LP yield = 10000 * 5% = 500
    expect(screen.getByText("$500.00")).toBeInTheDocument();
  });

  it("resets the preview to zero when an invalid amount is entered", () => {
    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("5000.00"), { target: { value: "abc" } });

    // All amounts should show 0
    expect(screen.getAllByText("$0.00")).toHaveLength(3);
  });

  // ── Successful submission ─────────────────────────────────────────────────

  it("submits a fully valid invoice and displays the returned invoice ID and tx hash", async () => {
    connectWallet();
    submitInvoiceTransaction.mockResolvedValue({ invoiceId: 99n, txHash: "deadbeef" });

    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("G..."), {
      target: { value: VALID_STELLAR_PAYER },
    });
    fireEvent.change(screen.getByPlaceholderText("5000.00"), { target: { value: "2000" } });
    fireEvent.change(screen.getByDisplayValue("3.00"), { target: { value: "3.5" } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: "2099-06-15" } });
    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    // Contract call is made with correctly parsed values
    await waitFor(() => {
      expect(submitInvoiceTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          freelancer: VALID_STELLAR_FREELANCER,
          payer: VALID_STELLAR_PAYER,
          amount: 20_000_000_000n, // 2000 USDC in stroops (7 decimal places)
          discountRate: 350, // 3.5% → 350 bps
        }),
      );
    });

    // Success banner with invoice ID
    expect(await screen.findByText("Returned invoice ID")).toBeInTheDocument();
    expect(screen.getByText("#99")).toBeInTheDocument();
    expect(screen.getByText(/Transaction hash: deadbeef/)).toBeInTheDocument();
  });

  it("disables the submit button while the transaction is in-flight", async () => {
    connectWallet();
    // Never-resolving promise keeps the button disabled for the assertion
    submitInvoiceTransaction.mockReturnValue(new Promise(() => {}));

    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("G..."), { target: { value: VALID_STELLAR_PAYER } });
    fireEvent.change(screen.getByPlaceholderText("5000.00"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: "2099-01-01" } });

    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /submitting invoice/i })).toBeDisabled(),
    );
  });

  // ── Error states ──────────────────────────────────────────────────────────

  it("shows the contract error message in the submit-error banner", async () => {
    connectWallet();
    submitInvoiceTransaction.mockRejectedValue(new Error("contract: insufficient gas"));

    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("G..."), { target: { value: VALID_STELLAR_PAYER } });
    fireEvent.change(screen.getByPlaceholderText("5000.00"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: "2099-03-01" } });

    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    expect(await screen.findByText("contract: insufficient gas")).toBeInTheDocument();
    expect(updateToast).toHaveBeenCalledWith(
      "toast-id-1",
      expect.objectContaining({ type: "error", title: "Submission failed" }),
    );
  });

  it("calls addToast with a pending toast on submit then updates it on success", async () => {
    connectWallet();
    submitInvoiceTransaction.mockResolvedValue({ invoiceId: 7n, txHash: "0xabc" });

    render(<SubmitInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("G..."), { target: { value: VALID_STELLAR_PAYER } });
    fireEvent.change(screen.getByPlaceholderText("5000.00"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: "2099-09-09" } });

    fireEvent.click(screen.getByRole("button", { name: /submit invoice/i }));

    await waitFor(() => expect(updateToast).toHaveBeenCalled());

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pending", title: /submitting invoice/i }),
    );
    expect(updateToast).toHaveBeenCalledWith(
      "toast-id-1",
      expect.objectContaining({ type: "success", title: "Invoice submitted" }),
    );
  });

  // ── Connected state ───────────────────────────────────────────────────────

  it("renders the wallet address and 'Disconnect' button when connected", () => {
    connectWallet(VALID_STELLAR_FREELANCER);
    render(<SubmitInvoiceForm />);

    expect(screen.getByText(VALID_STELLAR_FREELANCER)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });

  it("calls disconnect when the Disconnect button is clicked", () => {
    connectWallet(VALID_STELLAR_FREELANCER);
    render(<SubmitInvoiceForm />);

    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(walletState.disconnect).toHaveBeenCalledOnce();
  });
});

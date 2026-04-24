/**
 * @file FundConfirmModal.test.tsx
 *
 * The ILN does not have a standalone FundConfirmModal component; the confirmation
 * modal lives inside LPDashboard. These tests exercise the modal's exact surface:
 *
 *  - Expected yield figures are accurately derived from the mocked invoice props
 *    (amount, discount_rate) and displayed in the UI.
 *  - "Fund Invoice" (Confirm) button triggers `fundInvoice` + `submitSignedTransaction`
 *    when the USDC allowance is already sufficient (step 2 path).
 *  - "Approve USDC" button triggers `buildApproveUsdcTransaction` + `submitSignedTransaction`
 *    when the allowance is insufficient (step 1 path).
 *  - Error messages from contract calls are surfaced in the modal.
 *  - "Cancel" button closes the modal without calling any contract function.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LPDashboard from "../LPDashboard";

// ─── Stable mock handles ─────────────────────────────────────────────────────

const addToast = vi.fn(() => "toast-id");
const updateToast = vi.fn();
const getAllInvoices = vi.fn();
const getUsdcAllowance = vi.fn();
const buildApproveUsdcTransaction = vi.fn();
const fundInvoice = vi.fn();
const submitSignedTransaction = vi.fn();

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn().mockResolvedValue(false),
  getAddress: vi.fn().mockResolvedValue({ address: null }),
  setAllowed: vi.fn().mockResolvedValue(false),
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: "signed-xdr" }),
  getNetwork: vi.fn().mockResolvedValue({ network: "TESTNET" }),
}));

vi.mock("../../context/WalletContext", () => ({
  useWallet: () => ({
    address: "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC6",
    connect: vi.fn(),
    signTx: vi.fn().mockResolvedValue("signed-xdr"),
  }),
}));

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ addToast, updateToast }),
}));

vi.mock("../../utils/soroban", () => ({
  getAllInvoices: (...args: unknown[]) => getAllInvoices(...args),
  getUsdcAllowance: (...args: unknown[]) => getUsdcAllowance(...args),
  buildApproveUsdcTransaction: (...args: unknown[]) => buildApproveUsdcTransaction(...args),
  fundInvoice: (...args: unknown[]) => fundInvoice(...args),
  submitSignedTransaction: (...args: unknown[]) => submitSignedTransaction(...args),
}));

// ─── Test data ────────────────────────────────────────────────────────────────

/**
 * 1 000 USDC at 3 % discount rate.
 *   Amount in stroops  = 1_000 × 10_000_000 = 10_000_000_000
 *   Yield  = amount × discount_rate / 10_000 = 10_000_000_000 × 300 / 10_000 = 300_000_000 stroops = 30 USDC
 *   Freelancer payout = 10_000_000_000 − 300_000_000 = 9_700_000_000 stroops = 970 USDC
 */
const mockInvoice = {
  id: 7n,
  freelancer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  payer: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRY",
  amount: 10_000_000_000n,  // 1,000 USDC in stroops
  due_date: 1_900_000_000n, // far-future unix timestamp
  discount_rate: 300,       // 3.00 %
  status: "Pending",
  funder: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FundConfirmModal (via LPDashboard)", () => {
  beforeEach(() => {
    addToast.mockClear();
    updateToast.mockClear();
    getAllInvoices.mockReset().mockResolvedValue([mockInvoice]);
    getUsdcAllowance.mockReset();
    buildApproveUsdcTransaction.mockReset();
    fundInvoice.mockReset();
    submitSignedTransaction.mockReset();
  });

  // ── Yield calculation display ─────────────────────────────────────────────

  describe("yield calculation display", () => {
    it("shows the invoice face value (amount sent) correctly", async () => {
      getUsdcAllowance.mockResolvedValue(10_000_000_000n); // sufficient allowance

      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));

      await waitFor(() =>
        expect(screen.getByText(/Fund Invoice #7/i)).toBeInTheDocument(),
      );

      // "You will send" row – 1,000 USDC displayed via formatUSDC (7 decimals → 100.0000000 USDC)
      expect(screen.getAllByText(/1,000\.0000000 USDC/i).length).toBeGreaterThanOrEqual(1);
    });

    it("shows the freelancer payout (amount − yield) correctly", async () => {
      getUsdcAllowance.mockResolvedValue(10_000_000_000n);

      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));

      await waitFor(() =>
        expect(screen.getByText(/Fund Invoice #7/i)).toBeInTheDocument(),
      );

      // 1000 − 30 = 970 USDC  →  9_700_000_000 stroops → "970.0000000 USDC"
      expect(screen.getByText(/970\.0000000 USDC/i)).toBeInTheDocument();
    });

    it("shows the LP yield (discount) correctly", async () => {
      getUsdcAllowance.mockResolvedValue(10_000_000_000n);

      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));

      await waitFor(() =>
        expect(screen.getByText(/Fund Invoice #7/i)).toBeInTheDocument(),
      );

      // 1000 × 3% = 30 USDC  →  300_000_000 stroops → "30.0000000 USDC"
      expect(screen.getByText(/30\.0000000 USDC/i)).toBeInTheDocument();
      // discount-rate badge in the modal footer
      expect(screen.getByText(/3\.00%/)).toBeInTheDocument();
    });
  });

  // ── Confirm (Fund) button – sufficient allowance path ────────────────────

  describe("when allowance is already sufficient", () => {
    beforeEach(() => {
      getUsdcAllowance.mockResolvedValue(10_000_000_000n); // equal to invoice amount
    });

    it("renders the 'Fund Invoice' action button, not 'Approve USDC'", async () => {
      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Fund Invoice" })).toBeInTheDocument(),
      );

      expect(screen.queryByRole("button", { name: "Approve USDC" })).not.toBeInTheDocument();
    });

    it("calls fundInvoice and submitSignedTransaction when 'Fund Invoice' is clicked", async () => {
      fundInvoice.mockResolvedValue("unsigned-tx-xdr");
      submitSignedTransaction.mockResolvedValue({ txHash: "deadbeef" });

      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));
      fireEvent.click(await screen.findByRole("button", { name: "Fund Invoice" }));

      await waitFor(() => expect(fundInvoice).toHaveBeenCalledTimes(1));
      expect(fundInvoice).toHaveBeenCalledWith(
        "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC6",
        mockInvoice.id,
      );
      expect(submitSignedTransaction).toHaveBeenCalledTimes(1);
    });

    it("fires a success toast after a successful fund call", async () => {
      fundInvoice.mockResolvedValue("unsigned-tx-xdr");
      submitSignedTransaction.mockResolvedValue({ txHash: "tx-ok" });

      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));
      fireEvent.click(await screen.findByRole("button", { name: "Fund Invoice" }));

      await waitFor(() =>
        expect(updateToast).toHaveBeenCalledWith(
          "toast-id",
          expect.objectContaining({ type: "success", title: "Funded Successfully" }),
        ),
      );
    });

    it("shows an error message in the modal when fundInvoice rejects", async () => {
      fundInvoice.mockRejectedValue(new Error("Contract revert: insufficient balance"));
      submitSignedTransaction.mockResolvedValue({ txHash: "" });

      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));
      fireEvent.click(await screen.findByRole("button", { name: "Fund Invoice" }));

      expect(
        await screen.findByText(/Contract revert: insufficient balance/),
      ).toBeInTheDocument();
    });
  });

  // ── Approve button – insufficient allowance path ──────────────────────────

  describe("when allowance is insufficient", () => {
    beforeEach(() => {
      getUsdcAllowance.mockResolvedValue(0n);
    });

    it("renders 'Approve USDC' action button in step-1 state", async () => {
      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Approve USDC" })).toBeInTheDocument(),
      );
    });

    it("calls buildApproveUsdcTransaction and submitSignedTransaction on approve", async () => {
      buildApproveUsdcTransaction.mockResolvedValue("approve-tx-xdr");
      submitSignedTransaction.mockResolvedValue({ txHash: "approve-hash" });

      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));
      fireEvent.click(await screen.findByRole("button", { name: "Approve USDC" }));

      await waitFor(() => expect(buildApproveUsdcTransaction).toHaveBeenCalledTimes(1));
      expect(submitSignedTransaction).toHaveBeenCalledTimes(1);
    });

    it("fires a success toast after a successful approve call", async () => {
      buildApproveUsdcTransaction.mockResolvedValue("approve-tx-xdr");
      submitSignedTransaction.mockResolvedValue({ txHash: "approve-hash" });

      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));
      fireEvent.click(await screen.findByRole("button", { name: "Approve USDC" }));

      await waitFor(() =>
        expect(updateToast).toHaveBeenCalledWith(
          "toast-id",
          expect.objectContaining({ type: "success", title: "USDC approved" }),
        ),
      );
    });

    it("shows the funding-error message when approval fails", async () => {
      buildApproveUsdcTransaction.mockRejectedValue(new Error("User rejected tx"));

      render(<LPDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: "Fund" }));
      fireEvent.click(await screen.findByRole("button", { name: "Approve USDC" }));

      expect(await screen.findByText(/User rejected tx/)).toBeInTheDocument();
    });
  });

  // ── Cancel button ─────────────────────────────────────────────────────────

  it("closes the modal without calling any contract function when Cancel is clicked", async () => {
    getUsdcAllowance.mockResolvedValue(0n);

    render(<LPDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Fund" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByText(/Fund Invoice #7/i)).not.toBeInTheDocument(),
    );

    expect(fundInvoice).not.toHaveBeenCalled();
    expect(buildApproveUsdcTransaction).not.toHaveBeenCalled();
    expect(submitSignedTransaction).not.toHaveBeenCalled();
  });
});

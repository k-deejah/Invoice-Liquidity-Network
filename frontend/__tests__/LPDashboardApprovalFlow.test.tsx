import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LPDashboard from "../components/LPDashboard";

const approvedTokens = [
  { contractId: "token-usdc", name: "USD Coin", symbol: "USDC", decimals: 7, iconLabel: "US" },
  { contractId: "token-eurc", name: "Euro Coin", symbol: "EURC", decimals: 7, iconLabel: "EU" },
];

const mockInvoice = {
  id: 1n,
  freelancer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  payer: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRY",
  amount: 1_000_000_000n,
  due_date: 1_900_000_000n,
  discount_rate: 300,
  status: "Pending",
  token: "token-usdc",
};

const getAllInvoices = vi.fn();
const getUsdcAllowance = vi.fn();

vi.mock("../context/WalletContext", () => ({
  useWallet: () => ({
    address: "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC6",
    connect: vi.fn(),
    signTx: vi.fn(),
  }),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({
    addToast: vi.fn(() => "toast-id"),
    updateToast: vi.fn(),
  }),
}));

vi.mock("../hooks/useApprovedTokens", () => ({
  useApprovedTokens: () => ({
    tokens: approvedTokens,
    tokenMap: new Map(approvedTokens.map((token) => [token.contractId, token])),
    defaultToken: approvedTokens[0],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../utils/soroban", () => ({
  getAllInvoices: (...args: unknown[]) => getAllInvoices(...args),
  getTokenAllowance: (...args: unknown[]) => getUsdcAllowance(...args),
  buildApproveTokenTransaction: vi.fn(),
  fundInvoice: vi.fn(),
  submitSignedTransaction: vi.fn(),
  getPayerScoresBatch: vi.fn(async () => new Map()),
}));

describe("LPDashboard approval flow", () => {
  beforeEach(() => {
    getAllInvoices.mockReset();
    getUsdcAllowance.mockReset();
    getAllInvoices.mockResolvedValue([mockInvoice]);
  });

  it("skips step 1 when allowance is already sufficient", async () => {
    getUsdcAllowance.mockResolvedValue(1_000_000_000n);

    render(<LPDashboard />);

    fireEvent.click(await screen.findByText("Fund"));

    await waitFor(() => {
      expect(screen.getByText("Step 1: Fund Invoice")).toBeInTheDocument();
    });

    expect(screen.getByText("Allowance already covers this invoice. You can go straight to funding.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fund Invoice" })).toBeInTheDocument();
    expect(screen.queryByText("Step 1: Approve USDC")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve USDC" })).not.toBeInTheDocument();
  });

  it("shows step 1 when allowance is insufficient", async () => {
    getUsdcAllowance.mockResolvedValue(0n);

    render(<LPDashboard />);

    fireEvent.click(await screen.findByText("Fund"));

    await waitFor(() => {
      expect(screen.getByText("Step 1: Approve USDC")).toBeInTheDocument();
    });

    expect(screen.getByText("Approve exactly 100 USDC for the ILN contract.")).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("Approve exactly"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve USDC" })).toBeInTheDocument();
  });
});

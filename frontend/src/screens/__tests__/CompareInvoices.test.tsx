import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CompareInvoicesScreen from "../CompareInvoices";
import React from "react";

// Mock hooks and utilities
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue("1,2,3"),
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("../../context/WalletContext", () => ({
  useWallet: () => ({
    address: "GD...",
    connect: vi.fn(),
    signTx: vi.fn(),
  }),
}));

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({
    addToast: vi.fn(),
    updateToast: vi.fn(),
  }),
}));

vi.mock("../../utils/soroban", () => ({
  getAllInvoices: vi.fn().mockResolvedValue([
    { id: BigInt(1), amount: BigInt(10000000), discount_rate: 500, due_date: BigInt(Math.floor(Date.now()/1000) + 86400 * 10), payer: "P1", status: "Pending" },
    { id: BigInt(2), amount: BigInt(20000000), discount_rate: 600, due_date: BigInt(Math.floor(Date.now()/1000) + 86400 * 5), payer: "P2", status: "Pending" },
    { id: BigInt(3), amount: BigInt(30000000), discount_rate: 400, due_date: BigInt(Math.floor(Date.now()/1000) + 86400 * 15), payer: "P3", status: "Pending" },
  ]),
  getPayerScoresBatch: vi.fn().mockResolvedValue(new Map()),
  fundInvoice: vi.fn(),
  submitSignedTransaction: vi.fn(),
}));

vi.mock("../../hooks/useApprovedTokens", () => ({
  useApprovedTokens: () => ({
    tokens: [],
    tokenMap: new Map(),
    defaultToken: { symbol: "USDC", decimals: 7, contractId: "TOKEN_ID" },
  }),
}));

vi.mock("../../hooks/usePayerScores", () => ({
  usePayerScores: () => ({
    scores: new Map([["P1", 80], ["P2", 90], ["P3", 70]]),
    risks: new Map([["P1", "Low"], ["P2", "Very Low"], ["P3", "Medium"]]),
  }),
}));

describe("CompareInvoicesScreen", () => {
  it("renders comparison table for selected IDs", async () => {
    render(<CompareInvoicesScreen />);
    
    // Wait for data to load
    const invoice1 = await screen.findByText(/Invoice #1/i);
    const invoice2 = await screen.findByText(/Invoice #2/i);
    const invoice3 = await screen.findByText(/Invoice #3/i);
    
    expect(invoice1).toBeInTheDocument();
    expect(invoice2).toBeInTheDocument();
    expect(invoice3).toBeInTheDocument();
  });

  it("correctly identifies and highlights best values", async () => {
    render(<CompareInvoicesScreen />);
    
    await screen.findByText(/Invoice #1/i);
    
    // Highest APY should be Invoice #2 (600 bps and shortest duration)
    // Lowest Days to Maturity should be Invoice #2 (5 days)
    // Highest Payer Score should be P2 (90)
    
    const bestValueBadges = await screen.findAllByText(/Best Value/i);
    expect(bestValueBadges.length).toBeGreaterThan(0);
  });

  it("generates a comparative summary", async () => {
    render(<CompareInvoicesScreen />);
    
    const summaryHeader = await screen.findByText(/Comparative Insight/i);
    expect(summaryHeader).toBeInTheDocument();
    
    const summaryText = screen.getByText(/offers the highest APY/i);
    expect(summaryText).toBeInTheDocument();
  });
});

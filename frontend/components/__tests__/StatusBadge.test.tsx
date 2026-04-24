/**
 * @file StatusBadge.test.tsx
 *
 * The ILN renders inline status badges inside LPDashboard for funded invoices.
 * These tests drive the LPDashboard to render the "My Funded" tab where the status
 * badge is shown, and verify the correct text and Tailwind colour classes for all
 * five meaningful invoice statuses used in the protocol:
 *
 *  1. Pending  – grey / surface-dim  (shown in Discovery, not "My Funded" tab)
 *  2. Funded   – blue  (bg-blue-100  / text-blue-700)
 *  3. Paid     – green (bg-green-100 / text-green-700)
 *  4. Defaulted – red  (bg-red-100   / text-red-700)
 *  5. Cancelled – red  (bg-red-100   / text-red-700)
 *
 * We use the wallet address that matches invoice.funder so each invoice shows up
 * in the "My Funded" tab where badges are rendered.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LPDashboard from "../LPDashboard";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn().mockResolvedValue(false),
  getAddress: vi.fn().mockResolvedValue({ address: null }),
  setAllowed: vi.fn().mockResolvedValue(false),
  signTransaction: vi.fn(),
  getNetwork: vi.fn().mockResolvedValue({ network: "TESTNET" }),
}));

const LP_ADDRESS = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC6";

vi.mock("../../context/WalletContext", () => ({
  useWallet: () => ({
    address: LP_ADDRESS,
    connect: vi.fn(),
    signTx: vi.fn(),
  }),
}));

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({
    addToast: vi.fn(() => "toast-id"),
    updateToast: vi.fn(),
  }),
}));

const getAllInvoices = vi.fn();
const getUsdcAllowance = vi.fn();

vi.mock("../../utils/soroban", () => ({
  getAllInvoices: (...args: unknown[]) => getAllInvoices(...args),
  getUsdcAllowance: (...args: unknown[]) => getUsdcAllowance(...args),
  buildApproveUsdcTransaction: vi.fn(),
  fundInvoice: vi.fn(),
  submitSignedTransaction: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal invoice object whose funder matches the LP address so it
 *  appears in the "My Funded" tab. */
function makeInvoice(id: bigint, status: string) {
  return {
    id,
    freelancer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    payer:      "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRY",
    amount:     1_000_000_000n,
    due_date:   1_900_000_000n,
    discount_rate: 300,
    status,
    funder: LP_ADDRESS, // owned by the connected wallet → appears in "My Funded"
  };
}

/** Render the dashboard and navigate to the "My Funded" tab. */
async function renderMyFundedTab(invoice: ReturnType<typeof makeInvoice>) {
  getAllInvoices.mockResolvedValue([invoice]);
  render(<LPDashboard />);

  // Wait for the list to load then switch tab
  fireEvent.click(await screen.findByRole("button", { name: "My Funded" }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StatusBadge – all five invoice statuses", () => {
  beforeEach(() => {
    getAllInvoices.mockReset();
    getUsdcAllowance.mockReset();
  });

  it("renders the 'Funded' badge with blue classes", async () => {
    await renderMyFundedTab(makeInvoice(10n, "Funded"));

    await waitFor(() => {
      const badge = screen.getByText("Funded");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-blue-100");
      expect(badge.className).toContain("text-blue-700");
    });
  });

  it("renders the 'Paid' badge with green classes", async () => {
    await renderMyFundedTab(makeInvoice(11n, "Paid"));

    await waitFor(() => {
      const badge = screen.getByText("Paid");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-green-100");
      expect(badge.className).toContain("text-green-700");
    });
  });

  it("renders the 'Defaulted' badge with red classes", async () => {
    await renderMyFundedTab(makeInvoice(12n, "Defaulted"));

    await waitFor(() => {
      const badge = screen.getByText("Defaulted");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-red-100");
      expect(badge.className).toContain("text-red-700");
    });
  });

  it("renders the 'Cancelled' badge with red classes", async () => {
    await renderMyFundedTab(makeInvoice(13n, "Cancelled"));

    await waitFor(() => {
      const badge = screen.getByText("Cancelled");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-red-100");
      expect(badge.className).toContain("text-red-700");
    });
  });

  /**
   * 'Pending' invoices appear in the Discovery tab, not My Funded.
   * We still verify that the Discovery tab renders a "Fund" button (not a badge)
   * for Pending invoices.
   */
  it("renders a 'Fund' action button (not a badge) for Pending invoices in Discovery", async () => {
    const pendingInvoice = {
      id: 14n,
      freelancer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      payer:      "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRY",
      amount:     1_000_000_000n,
      due_date:   1_900_000_000n,
      discount_rate: 300,
      status: "Pending",
      funder: null,
    };

    getAllInvoices.mockResolvedValue([pendingInvoice]);
    render(<LPDashboard />);

    // Default tab is Discovery
    expect(await screen.findByRole("button", { name: "Fund" })).toBeInTheDocument();
    // Status badge should not appear in Discovery rows
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  it("renders multiple invoices with distinct correct badges simultaneously", async () => {
    getAllInvoices.mockResolvedValue([
      makeInvoice(20n, "Funded"),
      makeInvoice(21n, "Paid"),
      makeInvoice(22n, "Defaulted"),
    ]);

    render(<LPDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "My Funded" }));

    await waitFor(() => {
      const funded = screen.getByText("Funded");
      expect(funded.className).toContain("bg-blue-100");

      const paid = screen.getByText("Paid");
      expect(paid.className).toContain("bg-green-100");

      const defaulted = screen.getByText("Defaulted");
      expect(defaulted.className).toContain("bg-red-100");
    });
  });
});

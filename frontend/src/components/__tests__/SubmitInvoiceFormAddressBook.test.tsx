import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SubmitInvoiceForm from "../SubmitInvoiceForm";

// Mock the wallet context
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

// Mock toast context
const addToast = vi.fn(() => "toast-id-1");
const updateToast = vi.fn();

// Mock useAddressBook hook
const mockAddressBook = [
  { id: "1", address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABC", nickname: "Acme Corp" },
  { id: "2", address: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBD", nickname: "Beta LLC" },
];

vi.mock("../../context/WalletContext", () => ({
  useWallet: () => ({
    ...walletAddress,
    address: "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC6", // Freelancer address
    isConnected: true,
  }),
}));

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ addToast, updateToast }),
}));

vi.mock("../../hooks/useAddressBook", () => ({
  default: () => ({
    addressBook: mockAddressBook,
    searchAddresses: (query: string) => {
      if (!query) return mockAddressBook;
      const lowerQuery = query.toLowerCase();
      return mockAddressBook.filter(
        (entry) =>
          entry.nickname.toLowerCase().includes(lowerQuery) ||
          entry.address.toLowerCase().includes(lowerQuery)
      );
    },
  }),
}));

// Mock utils
vi.mock("../../utils/invoiceSubmission", () => ({
  getMinimumDueDate: () => "2026-01-01",
  getYieldPreview: () => ({
    amountFormatted: "0",
    payoutFormatted: "0",
    yieldFormatted: "0",
    discountRatePercent: 0,
  }),
  validateInvoiceForm: () => ({}),
  parseAmountToUnits: (amount: string) => BigInt(amount) * BigInt(1_000_000),
  parseDiscountRateToBps: (rate: string) => Math.round(parseFloat(rate) * 100),
  toUnixTimestamp: (date: string) => BigInt(new Date(date).getTime() / 1000),
}));

vi.mock("../../utils/soroban", () => ({
  submitInvoiceTransaction: vi.fn().mockResolvedValue({ invoiceId: 123n, txHash: "test-tx-hash" }),
}));

describe("SubmitInvoiceForm Address Book Integration", () => {
  beforeEach(() => {
    walletState.address = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC6";
    walletState.isConnected = true;
    walletState.error = null;
    walletState.networkMismatch = false;
    walletState.connect.mockReset();
    walletState.disconnect.mockReset();
    walletState.signTx.mockReset();
    addToast.mockClear();
    updateToast.mockClear();
  });

  it("shows address book dropdown when typing in payer field", async () => {
    render(<SubmitInvoiceForm />);
    
    const payerInput = screen.getByPlaceholderText("G...");
    fireEvent.change(payerInput, { target: { value: "Ac" } });
    
    // Should show dropdown with matching addresses
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("G...ABC")).toBeInTheDocument();
  });

  it("selects address from dropdown when clicking", async () => {
    render(<SubmitInvoiceForm />);
    
    const payerInput = screen.getByPlaceholderText("G...");
    fireEvent.change(payerInput, { target: { value: "Ac" } });
    
    // Click on the first matching address
    const acmeOption = screen.getByText("Acme Corp");
    fireEvent.click(acmeOption);
    
    // Payer field should be filled with the selected address
    expect(payerInput).toHaveValue("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABC");
  });

  it("navigates address book with keyboard", async () => {
    render(<SubmitInvoiceForm />);
    
    const payerInput = screen.getByPlaceholderText("G...");
    // Type to show dropdown
    fireEvent.change(payerInput, { target: { value: "a" } });
    
    // Press ArrowDown to highlight first item
    fireEvent.keyDown(payerInput, { key: "ArrowDown" });
    expect(screen.getByText("Acme Corp")).toHaveClass("bg-primary text-surface-container-lowest");
    
    // Press Enter to select
    fireEvent.keyDown(payerInput, { key: "Enter" });
    expect(payerInput).toHaveValue("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABC");
    
    // Dropdown should be closed
    expect(screen.queryByText("Acme Corp")).not.toHaveClass("bg-primary text-surface-container-lowest");
  });

  it("clears address book query when Escape is pressed", async () => {
    render(<SubmitInvoiceForm />);
    
    const payerInput = screen.getByPlaceholderText("G...");
    fireEvent.change(payerInput, { target: { value: "acme" } });
    
    // Press Escape
    fireEvent.keyDown(payerInput, { key: "Escape" });
    
    // Dropdown should be closed and query cleared
    expect(payerInput).toHaveValue("");
  });

  it("does not show dropdown when address book is empty", async () => {
    // Mock empty address book
    vi.mock("../../hooks/useAddressBook", () => ({
      default: () => ({
        addressBook: [],
        searchAddresses: () => [],
      }),
    }));
    
    // Need to re-render with new mock
    await waitFor(() => {
      render(<SubmitInvoiceForm />);
    });
    
    const payerInput = screen.getByPlaceholderText("G...");
    fireEvent.change(payerInput, { target: { value: "acme" } });
    
    // Should not show any dropdown items
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
  });
});
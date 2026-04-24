import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SubmitInvoiceForm from "../components/SubmitInvoiceForm";
import { ToastProvider } from "../context/ToastContext";
import { WalletProvider } from "../context/WalletContext";

// Mock the hooks used in SubmitInvoiceForm
vi.mock("../hooks/useApprovedTokens", () => ({
  useApprovedTokens: () => ({
    tokens: [],
    tokenMap: new Map(),
    defaultToken: { contractId: "USDC_CONTRACT", symbol: "USDC", decimals: 7 },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../context/WalletContext", () => ({
  useWallet: () => ({
    address: "GABC...",
    isConnected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    networkMismatch: false,
    error: null,
    signTx: vi.fn(),
  }),
  WalletProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => {
      const params: any = {
        prefill_id: "123",
        payer: "GPAYER...",
        amount: "1000",
        discount: "5",
        token: "USDC_CONTRACT",
      };
      return params[key];
    },
  }),
}));

describe("Submit similar invoice feature", () => {
  const renderForm = (initialValues?: any, prefillId?: string) => {
    return render(
      <ToastProvider>
        <SubmitInvoiceForm initialValues={initialValues} prefillId={prefillId} />
      </ToastProvider>
    );
  };

  it("pre-fills form fields correctly from initialValues", () => {
    const initialValues = {
      payer: "GPAYER...",
      amount: "1000",
      discountRate: "5",
      tokenId: "USDC_CONTRACT",
    };
    renderForm(initialValues, "123");

    expect(screen.getByLabelText(/Payer Stellar address/i)).toHaveValue("GPAYER...");
    expect(screen.getByLabelText(/Invoice amount/i)).toHaveValue(1000);
    expect(screen.getByLabelText(/Discount rate \(%\)/i)).toHaveValue(5);
  });

  it("ensures due date is always blank on initialization even with pre-fill", () => {
    const initialValues = {
      payer: "GPAYER...",
      amount: "1000",
      dueDate: "2026-12-31", // Should be ignored
    };
    renderForm(initialValues, "123");

    expect(screen.getByLabelText(/Due date/i)).toHaveValue("");
  });

  it("displays the pre-fill banner with correct invoice ID", () => {
    renderForm({}, "123");
    expect(screen.getByText(/Pre-filled from invoice #123/i)).toBeInTheDocument();
  });

  it("allows dismissing the pre-fill banner without clearing fields", () => {
    const initialValues = { payer: "GPAYER..." };
    renderForm(initialValues, "123");

    const dismissBtn = screen.getByLabelText(/Dismiss banner/i);
    fireEvent.click(dismissBtn);

    expect(screen.queryByText(/Pre-filled from invoice #123/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Payer Stellar address/i)).toHaveValue("GPAYER...");
  });

  it("keeps fields editable after pre-fill", () => {
    const initialValues = { payer: "GPAYER..." };
    renderForm(initialValues, "123");

    const payerInput = screen.getByLabelText(/Payer Stellar address/i);
    fireEvent.change(payerInput, { target: { value: "GNEWPAYER..." } });

    expect(payerInput).toHaveValue("GNEWPAYER...");
  });
});

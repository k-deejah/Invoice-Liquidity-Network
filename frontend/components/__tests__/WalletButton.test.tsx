/**
 * @file WalletButton.test.tsx
 *
 * Covers three distinct UI states of the WalletButton component:
 *
 *  1. Disconnected  – shows "Connect Wallet" button; calling it invokes `connect`.
 *  2. Connected (correct network) – shows a truncated address, a green indicator,
 *     the network name "TESTNET", and a "Disconnect" button.
 *  3. Wrong network – shows a red/pulse indicator, "Wrong Network" label, and
 *     a "Disconnect" button; "Connect Wallet" is not rendered.
 *
 * Additional edge cases:
 *  - An error string from the wallet context is displayed below the Connect button.
 *  - Calling "Disconnect" invokes the `disconnect` callback from context.
 *
 * All `@stellar/freighter-api` calls are mocked so no browser extension is needed.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WalletButton from "../WalletButton";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@stellar/freighter-api", () => ({
  isConnected:     vi.fn().mockResolvedValue(false),
  getAddress:      vi.fn().mockResolvedValue({ address: null }),
  setAllowed:      vi.fn().mockResolvedValue(false),
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: "signed-xdr" }),
  getNetwork:      vi.fn().mockResolvedValue({ network: "TESTNET" }),
}));

/** Mutable wallet state – reset before each test. */
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

vi.mock("../../context/WalletContext", () => ({
  useWallet: () => walletState,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FULL_ADDRESS = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC6";
/** Expected shortened form produced by formatAddress(): "GCCCCC...CCC6" */
const SHORT_ADDRESS = "GCCCCC...CCC6";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WalletButton", () => {
  beforeEach(() => {
    walletState.address = null;
    walletState.isConnected = false;
    walletState.error = null;
    walletState.networkMismatch = false;
    walletState.connect.mockReset();
    walletState.disconnect.mockReset();
    walletState.signTx.mockReset();
  });

  // ── State 1: Disconnected ─────────────────────────────────────────────────

  describe("disconnected state", () => {
    it("renders the Connect Wallet button", () => {
      render(<WalletButton />);
      expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
    });

    it("does not render a Disconnect button", () => {
      render(<WalletButton />);
      expect(screen.queryByRole("button", { name: /disconnect/i })).not.toBeInTheDocument();
    });

    it("does not render a wallet address", () => {
      render(<WalletButton />);
      expect(screen.queryByText(SHORT_ADDRESS)).not.toBeInTheDocument();
    });

    it("calls connect() when the Connect Wallet button is clicked", () => {
      render(<WalletButton />);
      fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
      expect(walletState.connect).toHaveBeenCalledOnce();
    });

    it("shows the error tooltip when the wallet context has an error string", () => {
      walletState.error = "Freighter not installed. Please install the extension.";
      render(<WalletButton />);
      expect(
        screen.getByText("Freighter not installed. Please install the extension."),
      ).toBeInTheDocument();
    });

    it("shows 'Connection Error' heading alongside the error text", () => {
      walletState.error = "Connection rejected by user.";
      render(<WalletButton />);
      expect(screen.getByText("Connection Error")).toBeInTheDocument();
      expect(screen.getByText("Connection rejected by user.")).toBeInTheDocument();
    });

    it("does not render the error tooltip when there is no error", () => {
      render(<WalletButton />);
      expect(screen.queryByText("Connection Error")).not.toBeInTheDocument();
    });
  });

  // ── State 2: Connected – correct network ──────────────────────────────────

  describe("connected state – correct network", () => {
    beforeEach(() => {
      walletState.address = FULL_ADDRESS;
      walletState.isConnected = true;
      walletState.networkMismatch = false;
    });

    it("renders the truncated wallet address", () => {
      render(<WalletButton />);
      expect(screen.getByText(SHORT_ADDRESS)).toBeInTheDocument();
    });

    it("renders the network name 'TESTNET'", () => {
      render(<WalletButton />);
      expect(screen.getByText("TESTNET")).toBeInTheDocument();
    });

    it("renders a green status dot (not error colour)", () => {
      render(<WalletButton />);
      // The status dot is a <span> with bg-green-500; it has no text but a distinctive class.
      const dot = document.querySelector(".bg-green-500");
      expect(dot).toBeTruthy();
    });

    it("does NOT render an animate-pulse red dot", () => {
      render(<WalletButton />);
      const redPulse = document.querySelector(".bg-error.animate-pulse");
      expect(redPulse).toBeNull();
    });

    it("renders a Disconnect button", () => {
      render(<WalletButton />);
      expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
    });

    it("calls disconnect() when the Disconnect button is clicked", () => {
      render(<WalletButton />);
      fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));
      expect(walletState.disconnect).toHaveBeenCalledOnce();
    });

    it("does NOT render the Connect Wallet button", () => {
      render(<WalletButton />);
      expect(screen.queryByRole("button", { name: /connect wallet/i })).not.toBeInTheDocument();
    });
  });

  // ── State 3: Connected – wrong network ───────────────────────────────────

  describe("connected state – wrong network", () => {
    beforeEach(() => {
      walletState.address = FULL_ADDRESS;
      walletState.isConnected = true;
      walletState.networkMismatch = true;
    });

    it("renders 'Wrong Network' label instead of TESTNET", () => {
      render(<WalletButton />);
      expect(screen.getByText("Wrong Network")).toBeInTheDocument();
      expect(screen.queryByText("TESTNET")).not.toBeInTheDocument();
    });

    it("renders a red pulsing status dot", () => {
      render(<WalletButton />);
      // The mismatch dot has both bg-error and animate-pulse classes
      const redPulse = document.querySelector(".bg-error.animate-pulse");
      expect(redPulse).toBeTruthy();
    });

    it("does NOT render a green status dot", () => {
      render(<WalletButton />);
      const greenDot = document.querySelector(".bg-green-500");
      expect(greenDot).toBeNull();
    });

    it("still renders the truncated wallet address", () => {
      render(<WalletButton />);
      expect(screen.getByText(SHORT_ADDRESS)).toBeInTheDocument();
    });

    it("still renders the Disconnect button", () => {
      render(<WalletButton />);
      expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
    });

    it("does NOT render the Connect Wallet button", () => {
      render(<WalletButton />);
      expect(screen.queryByRole("button", { name: /connect wallet/i })).not.toBeInTheDocument();
    });

    it("applies error text colour to the 'Wrong Network' label", () => {
      render(<WalletButton />);
      const label = screen.getByText("Wrong Network");
      expect(label.className).toContain("text-error");
    });
  });
});

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "../context/WalletContext";
import { useTheme } from "../hooks/useTheme";
import { formatUSDC } from "../utils/format";
import { getUsdcBalance } from "../utils/soroban";
import WalletButton from "./WalletButton";

export default function Navbar() {
  const { address, isConnected, networkMismatch } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBalance() {
      if (!address || !isConnected || networkMismatch) {
        setUsdcBalance(null);
        return;
      }

      setBalanceLoading(true);
      try {
        const balance = await getUsdcBalance(address);
        if (!cancelled) {
          setUsdcBalance(balance);
        }
      } catch {
        if (!cancelled) {
          setUsdcBalance(null);
        }
      } finally {
        if (!cancelled) {
          setBalanceLoading(false);
        }
      }
    }

    loadBalance();

    return () => {
      cancelled = true;
    };
  }, [address, isConnected, networkMismatch]);

  return (
    <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-outline-variant/15 shadow-sm h-20 transition-colors duration-300">
      <div className="flex justify-between items-center px-8 h-full max-w-7xl mx-auto">

        <div className="text-2xl font-bold text-primary tracking-tight">
          ILN
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a className="text-on-surface-variant hover:text-primary text-sm font-medium" href="#">
            How it works
          </a>
          <a className="text-on-surface-variant hover:text-primary text-sm font-medium" href="#for-freelancers">
            For Freelancers
          </a>
          <a className="text-on-surface-variant hover:text-primary text-sm font-medium" href="#for-lps">
            For LPs
          </a>
          <Link
            className="text-on-surface-variant hover:text-primary transition-colors duration-200 text-sm font-medium"
            href="/governance"
          >
            Governance
          </Link>
          <Link
            className="text-on-surface-variant hover:text-primary transition-colors duration-200 text-sm font-medium"
            href="/payer"
          >
            Pay Invoices
          </Link>
          <Link
            className="text-on-surface-variant hover:text-primary transition-colors duration-200 text-sm font-medium"
            href="/analytics"
          >
            Analytics
          </Link>
          <a
            className="text-on-surface-variant hover:text-primary transition-colors duration-200 text-sm font-medium"
            href="#"
          >
            Docs
          </a>
        </div>

        <div className="flex items-center gap-4">
          {isConnected && !networkMismatch ? (
            <div className="hidden sm:flex flex-col items-end rounded-xl border border-outline-variant/15 bg-surface-container-low px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">USDC</span>
              <span className="text-sm font-bold text-on-surface">
                {balanceLoading ? "Loading..." : formatUSDC(usdcBalance ?? 0n)}
              </span>
            </div>
          ) : null}

          <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-surface-variant transition-colors"
            aria-label="Toggle dark mode"
          >
            <span className="material-symbols-outlined">
              {theme === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </button>

          {/* 🔔 ONLY SHOW WHEN WALLET IS CONNECTED */}
          {/* {isConnected && address && <NotificationBell />} */}

          <WalletButton />
        </div>

      </div>
    </nav>
  );
}

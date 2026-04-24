"use client";

import Link from "next/link";
import { useWallet } from "../context/WalletContext";
import { useTheme } from "../hooks/useTheme";
import WalletButton from "./WalletButton";

export default function Navbar() {
  useWallet();
  const { theme, toggleTheme } = useTheme();

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

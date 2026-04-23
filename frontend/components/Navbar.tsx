"use client";

import { useTheme } from "../hooks/useTheme";
import { useWallet } from "../context/WalletContext";
import { formatAddress } from "../utils/format";

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { address, isConnected, connect, disconnect } = useWallet();

  return (
    <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-outline-variant/15 shadow-sm h-20 transition-colors duration-300">
      <div className="flex justify-between items-center px-8 h-full max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-primary tracking-tight">ILN</div>
        <div className="hidden md:flex items-center gap-8">
          <a
            className="text-on-surface-variant hover:text-primary transition-colors duration-200 text-sm font-medium"
            href="#"
          >
            How it works
          </a>
          <a
            className="text-on-surface-variant hover:text-primary transition-colors duration-200 text-sm font-medium"
            href="#for-freelancers"
          >
            For Freelancers
          </a>
          <a
            className="text-on-surface-variant hover:text-primary transition-colors duration-200 text-sm font-medium"
            href="#for-lps"
          >
            For LPs
          </a>
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
            className="p-2 rounded-full hover:bg-surface-variant transition-colors text-foreground"
            aria-label="Toggle dark mode"
          >
            <span className="material-symbols-outlined">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          
          {isConnected ? (
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex flex-col items-end">
                <span className="text-[10px] font-bold text-primary uppercase">Connected</span>
                <span className="text-xs font-mono text-on-surface-variant">{formatAddress(address!)}</span>
              </div>
              <button 
                onClick={disconnect}
                className="bg-surface-variant text-on-surface-variant px-4 py-2 rounded-lg text-sm font-bold hover:bg-surface-dim transition-all active:scale-95"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              onClick={connect}
              className="bg-primary text-surface-container-lowest px-6 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-primary/90 transition-all active:scale-95 duration-150"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

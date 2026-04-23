"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { isConnected, getAddress, setAllowed, signTransaction } from "@stellar/freighter-api";

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTx: (txXdr: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const checkConnection = useCallback(async () => {
    const connected = await isConnected();
    if (connected) {
      try {
        const { address } = await getAddress();
        if (address) {
          setAddress(address);
          setConnected(true);
        }
      } catch (e) {
        console.error("Failed to get address", e);
      }
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const connect = async () => {
    try {
      const isAllowed = await setAllowed();
      if (isAllowed) {
        const { address } = await getAddress();
        setAddress(address);
        setConnected(true);
      }
    } catch (e) {
      console.error("Connection failed", e);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setConnected(false);
  };

  const signTx = async (txXdr: string) => {
    const signed = await signTransaction(txXdr, {
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    return signed;
  };

  return (
    <WalletContext.Provider value={{ address, isConnected: connected, connect, disconnect, signTx }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};

import { useState, useCallback, useEffect } from "react";
import { useWallet } from "../context/WalletContext";

interface AddressBookEntry {
  id: string;
  address: string;
  nickname: string;
}

const STORAGE_KEY_PREFIX = "iln-address-book-";

export default function useAddressBook() {
  const { address: walletAddress } = useWallet();
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([]);

  useEffect(() => {
    if (!walletAddress) {
      setAddressBook([]);
      return;
    }
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${walletAddress}`);
    if (stored) {
      try {
        setAddressBook(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse address book from localStorage", e);
        setAddressBook([]);
      }
    } else {
      setAddressBook([]);
    }
  }, [walletAddress]);

  const saveAddressBook = useCallback(() => {
    if (!walletAddress) return;
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${walletAddress}`,
      JSON.stringify(addressBook)
    );
  }, [walletAddress, addressBook]);

  const addAddress = useCallback(
    (address: string, nickname: string) => {
      if (!address || !nickname) return;
      // Check for duplicate address
      if (addressBook.some((entry) => entry.address === address)) {
        // Update the nickname if address exists
        setAddressBook(
          addressBook.map((entry) =>
            entry.address === address
              ? { ...entry, nickname }
              : entry
          )
        );
        return;
      }
      // Enforce max 50 entries
      if (addressBook.length >= 50) {
        // Remove the oldest entry (first one) to make space
        setAddressBook((prev) => [
          ...prev.slice(1),
          { id: Date.now().toString(), address, nickname },
        ]);
        return;
      }
      setAddressBook((prev) => [
        ...prev,
        { id: Date.now().toString(), address, nickname },
      ]);
    },
    [addressBook]
  );

  const updateAddress = useCallback(
    (id: string, updates: Partial<Omit<AddressBookEntry, "id">>) => {
      setAddressBook((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, ...updates } : entry
        )
      );
    },
    []
  );

  const deleteAddress = useCallback((id: string) => {
    setAddressBook((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const searchAddresses = useCallback(
    (query: string) => {
      if (!query) return addressBook;
      const lowerQuery = query.toLowerCase();
      return addressBook.filter(
        (entry) =>
          entry.nickname.toLowerCase().includes(lowerQuery) ||
          entry.address.toLowerCase().includes(lowerQuery)
      );
    },
    [addressBook]
  );

  return {
    addressBook,
    addAddress,
    updateAddress,
    deleteAddress,
    searchAddresses,
  };
}
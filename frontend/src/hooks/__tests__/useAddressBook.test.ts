import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useAddressBook from "../useAddressBook";

const TEST_WALLET = "GDCXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXABCD";

describe("useAddressBook", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Mock the wallet context
    vi.mock("../../context/WalletContext", () => ({
      useWallet: () => ({
        address: TEST_WALLET,
      }),
    }));
  });

  it("loads address book from localStorage", () => {
    // Pre-populate localStorage
    const testEntries = [
      { id: "1", address: "GADDRESS1", nickname: "Test 1" },
      { id: "2", address: "GADDRESS2", nickname: "Test 2" },
    ];
    localStorage.setItem(
      `iln-address-book-${TEST_WALLET}`,
      JSON.stringify(testEntries)
    );

    const { result } = renderHook(() => useAddressBook());
    
    expect(result.current.addressBook).toHaveLength(2);
    expect(result.current.addressBook[0].nickname).toBe("Test 1");
  });

  it("adds new address to address book", () => {
    const { result } = renderHook(() => useAddressBook());
    
    act(() => {
      result.current.addAddress("GNEWADDRESS", "New Contact");
    });
    
    expect(result.current.addressBook).toHaveLength(1);
    expect(result.current.addressBook[0]).toMatchObject({
      address: "GNEWADDRESS",
      nickname: "New Contact",
    });
    
    // Verify it's saved to localStorage
    const stored = localStorage.getItem(`iln-address-book-${TEST_WALLET}`);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed).toHaveLength(1);
  });

  it("prevents duplicate addresses and updates nickname", () => {
    const { result } = renderHook(() => useAddressBook());
    
    // Add first address
    act(() => {
      result.current.addAddress("GSAMEADDRESS", "First Nickname");
    });
    
    // Try to add same address with different nickname
    act(() => {
      result.current.addAddress("GSAMEADDRESS", "Updated Nickname");
    });
    
    expect(result.current.addressBook).toHaveLength(1);
    expect(result.current.addressBook[0].nickname).toBe("Updated Nickname");
  });

  it("enforces maximum 50 entries", () => {
    const { result } = renderHook(() => useAddressBook());
    
    // Add 51 entries
    for (let i = 0; i < 51; i++) {
      act(() => {
        result.current.addAddress(`GADDRESS${i}`, `Contact ${i}`);
      });
    }
    
    // Should only have 50 entries (oldest removed)
    expect(result.current.addressBook).toHaveLength(50);
    // First entry should be address 1 (address 0 was removed)
    expect(result.current.addressBook[0].address).toBe("GADDRESS1");
    expect(result.current.addressBook[49].address).toBe("GADDRESS50");
  });

  it("deletes address from address book", () => {
    const { result } = renderHook(() => useAddressBook());
    
    // Add two addresses
    act(() => {
      result.current.addAddress("GADDRESS1", "Contact 1");
      result.current.addAddress("GADDRESS2", "Contact 2");
    });
    
    expect(result.current.addressBook).toHaveLength(2);
    
    // Delete first address
    act(() => {
      result.current.deleteAddress(result.current.addressBook[0].id);
    });
    
    expect(result.current.addressBook).toHaveLength(1);
    expect(result.current.addressBook[0].address).toBe("GADDRESS2");
  });

  it("searches addresses by nickname and address", () => {
    const { result } = renderHook(() => useAddressBook());
    
    // Add test addresses
    act(() => {
      result.current.addAddress("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABC", "Acme Corp");
      result.current.addAddress("GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBD", "Beta LLC");
      result.current.addAddress("GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBE", "Charlie Inc");
    });
    
    // Search by nickname
    let results = result.current.searchAddresses("Acme");
    expect(results).toHaveLength(1);
    expect(results[0].nickname).toBe("Acme Corp");
    
    // Search by address (partial)
    results = result.current.searchAddresses("BBBB");
    expect(results).toHaveLength(1);
    expect(results[0].address).toBe("GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBD");
    
    // Search case insensitive
    results = result.current.searchAddresses("acme");
    expect(results).toHaveLength(1);
    
    // Search with no matches
    results = result.current.searchAddresses("XYZ");
    expect(results).toHaveLength(0);
    
    // Empty search returns all
    results = result.current.searchAddresses("");
    expect(results).toHaveLength(3);
  });
});
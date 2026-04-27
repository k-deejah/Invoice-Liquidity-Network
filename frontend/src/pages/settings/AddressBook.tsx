"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../context/ToastContext";
import useAddressBook from "../../hooks/useAddressBook";

interface AddressBookEntry {
  id: string;
  address: string;
  nickname: string;
}

export default function AddressBookPage() {
  const { t, i18n } = useTranslation();
  const { addToast, updateToast } = useToast();
  const { addressBook, addAddress, updateAddress, deleteAddress, searchAddresses } =
    useAddressBook();

  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [newNickname, setNewNickname] = useState("");

  const filteredAddresses = searchAddresses(searchQuery);

  const handleAddAddress = () => {
    if (!newAddress || !newNickname) {
      addToast({ type: "error", title: t("addressBook.errors.missingFields") });
      return;
    }
    addAddress(newAddress, newNickname);
    setNewAddress("");
    setNewNickname("");
    addToast({ type: "success", title: t("addressBook.success.added") });
  };

  const handleUpdateAddress = (id: string) => {
    // Find the current values from the form (in a real implementation, we'd have form state)
    // For simplicity, we'll just show a toast indicating it would be updated
    updateToast(addToast({ type: "pending", title: t("addressBook.updating") }), {
      type: "success",
      title: t("addressBook.success.updated"),
    });
    // In a real implementation, we would update the address with current form values
    // updateAddress(id, { address: currentAddress, nickname: currentNickname });
    setEditingId(null);
  };

  const handleDeleteAddress = (id: string) => {
    deleteAddress(id);
    addToast({ type: "success", title: t("addressBook.success.deleted") });
  };

  const formatAddress = (addr: string): string => {
    if (!addr) return "";
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="space-y-6">
      <div className="border border-surface-dim rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-surface-container-low">
          <h3 className="text-lg font-medium">{t("addressBook.title")}</h3>
          <p className="text-sm text-on-surface-variant">
            {t("addressBook.subtitle")}
          </p>
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-2">
            <label className="flex items-center justify-between text-sm font-medium text-on-surface-variant">
              {t("addressBook.newAddress")}
              <span className="text-xs text-on-surface-variant/50">
                ({t("addressBook.maxEntries", { count: 50 })} {t("addressBook.entries")})
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <input
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder={t("addressBook.stellarAddressPlaceholder")}
                className="w-full rounded-2xl bg-surface-container-low px-4 py-3.5 text-sm border border-outline-variant/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                inputMode="decimal"
              />
              <input
                value={newNickname}
                onChange={(e) => setNewNickname(e.target.value)}
                placeholder={t("addressBook.nicknamePlaceholder")}
                className="w-full rounded-2xl bg-surface-container-low px-4 py-3.5 text-sm border border-outline-variant/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <button
              onClick={handleAddAddress}
              className="w-full rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-surface-container-lowest hover:bg-primary/90 transition-colors"
            >
              {t("addressBook.addAddress")}
            </button>
          </div>
        </div>
      </div>

      <div className="border border-surface-dim rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-surface-container-low">
          <h3 className="text-lg font-medium">{t("addressBook.yourAddresses")}</h3>
          <div className="flex items-center gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("addressBook.searchPlaceholder")}
              className="rounded-xl bg-surface-container-low px-4 py-3 text-sm border border-outline-variant/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none w-[200px]"
            />
            {filteredAddresses.length !== addressBook.length && (
              <span className="text-xs text-on-surface-variant">
                {filteredAddresses.length} {t("addressBook.shownOf", { total: addressBook.length })}
              </span>
            )}
          </div>
        </div>
        {filteredAddresses.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant">
            <p>{t("addressBook.noAddresses")}</p>
            <p className="mt-2 text-xs">
              {t("addressBook.noAddressesHint")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surface-dim">
            {filteredAddresses.map((entry) => (
              <div
                key={entry.id}
                className={`p-4 flex justify-between items-start ${
                  editingId === entry.id ? "bg-primary/5" : ""
                }`}
              >
                {editingId === entry.id ? (
                  <div className="flex flex-col gap-2 w-[300px]">
                    <input
                      defaultValue={entry.address}
                      onChange={(e) => {
                        // In a real implementation, we'd update form state
                        console.log("Address changed:", e.target.value);
                      }}
                      className="w-full rounded-xl bg-surface-container-low px-4 py-3 text-sm border border-outline-variant/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <input
                      defaultValue={entry.nickname}
                      onChange={(e) => {
                        // In a real implementation, we'd update form state
                        console.log("Nickname changed:", e.target.value);
                      }}
                      className="w-full rounded-xl bg-surface-container-low px-4 py-3 text-sm border border-outline-variant/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateAddress(entry.id)}
                        className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-surface-container-lowest hover:bg-primary/90 transition-colors"
                      >
                        {t("addressBook.save")}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex-1 rounded-xl bg-surface-container-low px-4 py-3 text-sm font-bold text-on-surface-variant border border-outline-variant/15 hover:bg-surface-variant/50 transition-colors"
                      >
                        {t("addressBook.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="bg-primary-container text-on-primary-container rounded-xl p-3">
                          <span className="material-symbols-outlined">account_circle</span>
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="font-medium">{entry.nickname}</p>
                        <p className="text-xs text-on-surface-variant break-all">
                          {formatAddress(entry.address)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <button
                        onClick={() => setEditingId(entry.id)}
                        className="p-1 rounded-full hover:bg-surface-variant/50 transition-colors"
                        title={t("addressBook.edit")}
                      >
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(entry.id)}
                        className="p-1 rounded-full text-error-container hover:bg-error-container/20 transition-colors"
                        title={t("addressBook.delete")}
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
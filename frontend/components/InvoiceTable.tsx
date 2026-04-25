"use client";

import React, { useState, useEffect, useMemo } from "react";
import ColumnCustomiser, { ColumnConfig } from "./ColumnCustomiser";

export interface ColumnDefinition<T> extends ColumnConfig {
  renderCell: (item: T) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  sortable?: boolean;
}

interface InvoiceTableProps<T> {
  tableId: string;
  data: T[];
  columns: ColumnDefinition<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyStateNode?: React.ReactNode;
  onSort?: (key: keyof T | string) => void;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  keyExtractor: (item: T) => string;
}

export default function InvoiceTable<T>({
  tableId,
  data,
  columns,
  isLoading,
  emptyMessage = "No data found.",
  emptyStateNode,
  onSort,
  sortKey,
  sortOrder,
  keyExtractor,
}: InvoiceTableProps<T>) {
  const storageKey = `iln_table_config_${tableId}`;

  // State for order and visibility
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [isInitialised, setIsInitialised] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    const defaultOrder = columns.map((c) => c.id);
    const defaultVisible = columns.filter((c) => c.isMandatory !== false).map((c) => c.id);

    if (saved) {
      try {
        const config = JSON.parse(saved);
        // Merge with current columns (in case columns changed in code)
        const validOrder = config.order.filter((id: string) => columns.some((c) => c.id === id));
        const missingFromOrder = defaultOrder.filter((id) => !validOrder.includes(id));
        
        setColumnOrder([...validOrder, ...missingFromOrder]);
        setVisibleColumns(config.visibility || defaultVisible);
      } catch (e) {
        console.error("Failed to load table config", e);
        setColumnOrder(defaultOrder);
        setVisibleColumns(defaultVisible);
      }
    } else {
      setColumnOrder(defaultOrder);
      setVisibleColumns(defaultVisible);
    }
    setIsInitialised(true);
  }, [tableId, columns]);

  // Save to localStorage when state changes
  useEffect(() => {
    if (!isInitialised) return;
    const config = {
      order: columnOrder,
      visibility: visibleColumns,
    };
    localStorage.setItem(storageKey, JSON.stringify(config));
  }, [columnOrder, visibleColumns, isInitialised, storageKey]);

  const handleVisibilityChange = (id: string, visible: boolean) => {
    if (visible) {
      setVisibleColumns((prev) => [...prev, id]);
    } else {
      setVisibleColumns((prev) => prev.filter((v) => v !== id));
    }
  };

  const handleReset = () => {
    const defaultOrder = columns.map((c) => c.id);
    const defaultVisible = columns.map((c) => c.id); // All visible by default
    setColumnOrder(defaultOrder);
    setVisibleColumns(defaultVisible);
  };

  const activeColumns = useMemo(() => {
    return columnOrder
      .map((id) => columns.find((c) => c.id === id))
      .filter((c): c is ColumnDefinition<T> => !!c && visibleColumns.includes(c.id));
  }, [columnOrder, visibleColumns, columns]);

  if (!isInitialised) return null; // Avoid layout shift

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end px-6">
        <ColumnCustomiser
          allColumns={columns}
          visibleColumns={visibleColumns}
          columnOrder={columnOrder}
          onVisibilityChange={handleVisibilityChange}
          onOrderChange={setColumnOrder}
          onReset={handleReset}
        />
      </div>

      <div className="overflow-x-auto rounded-xl">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low">
            <tr>
              {activeColumns.map((col) => (
                <th
                  key={col.id}
                  onClick={() => col.sortable && onSort?.(col.id)}
                  className={`px-6 py-4 text-[11px] font-bold uppercase text-on-surface-variant tracking-wider ${
                    col.sortable ? "cursor-pointer select-none group" : ""
                  } ${col.headerClassName || ""}`}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-100 transition-opacity">
                        {sortKey === col.id ? (sortOrder === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-dim bg-surface-container-lowest/50">
            {isLoading ? (
              <tr>
                <td colSpan={activeColumns.length} className="px-6 py-12 text-center text-on-surface-variant italic">
                  <div className="flex flex-col items-center gap-3">
                    <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></span>
                    Loading assets...
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td 
                  colSpan={activeColumns.length} 
                  className={emptyStateNode ? "px-6 py-12" : "px-6 py-12 text-center text-on-surface-variant italic"}
                >
                  {emptyStateNode || emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr key={keyExtractor(item)} className="hover:bg-surface-variant/10 transition-colors group">
                  {activeColumns.map((col) => (
                    <td key={col.id} className={`px-6 py-5 ${col.cellClassName || ""}`}>
                      {col.renderCell(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

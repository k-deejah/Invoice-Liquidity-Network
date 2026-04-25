"use client";

import { formatAddress, formatDate, formatUSDC, calculateYield } from "../utils/format";
import type { Invoice } from "../utils/soroban";
import InvoiceTable, { ColumnDefinition } from "./InvoiceTable";
import { EmptyState } from "./EmptyState";
import { LPPortfolioEmptyIllustration } from "./illustrations/EmptyIllustrations";

interface LPPortfolioProps {
  invoices: Invoice[];
  isLoading: boolean;
  onClaimDefault: (invoice: Invoice) => Promise<void>;
  claimingInvoiceId: string | null;
}

export default function LPPortfolio({
  invoices,
  isLoading,
  onClaimDefault,
  claimingInvoiceId,
}: LPPortfolioProps) {
  const now = Date.now();
  const totalYieldEarned = invoices
    .filter((invoice) => invoice.status === "Paid")
    .reduce((total, invoice) => total + calculateYield(invoice.amount, invoice.discount_rate), 0n);

  const columns: ColumnDefinition<Invoice>[] = [
    {
      id: "id",
      label: "ID",
      isMandatory: true,
      sortable: true,
      renderCell: (inv) => <span className="font-bold text-primary">#{inv.id.toString()}</span>,
    },
    {
      id: "freelancer",
      label: "Freelancer",
      sortable: false,
      renderCell: (inv) => <span>{formatAddress(inv.freelancer)}</span>,
    },
    {
      id: "amount",
      label: "Amount Funded",
      sortable: true,
      renderCell: (inv) => <span className="font-bold">{formatUSDC(inv.amount)}</span>,
    },
    {
      id: "discount",
      label: "Discount %",
      sortable: true,
      renderCell: (inv) => <span>{(inv.discount_rate / 100).toFixed(2)}%</span>,
    },
    {
      id: "due_date",
      label: "Due Date",
      sortable: true,
      renderCell: (inv) => <span>{formatDate(inv.due_date)}</span>,
    },
    {
      id: "status",
      label: "Status",
      isMandatory: true,
      sortable: true,
      renderCell: (inv) => (
        <span className="rounded px-2 py-1 text-xs font-bold bg-surface-container-low text-on-surface">
          {inv.status}
        </span>
      ),
    },
    {
      id: "yield",
      label: "Yield Earned",
      sortable: false,
      renderCell: (inv) => {
        const yieldAmount = calculateYield(inv.amount, inv.discount_rate);
        return (
          <span className="font-bold">
            {inv.status === "Paid" ? (
              <span className="text-green-600">{formatUSDC(yieldAmount)}</span>
            ) : (
              <span className="text-on-surface-variant">Pending</span>
            )}
          </span>
        );
      },
    },
    {
      id: "actions",
      label: "",
      sortable: false,
      renderCell: (inv) => {
        const isPastDue = Number(inv.due_date) * 1000 < now;
        const isClaimEligible = inv.status === "Funded" && isPastDue;
        const isClaiming = claimingInvoiceId === inv.id.toString();
        
        if (!isClaimEligible) return null;

        return (
          <div className="text-right">
            <button
              onClick={() => onClaimDefault(inv)}
              disabled={isClaiming}
              className="rounded-lg bg-error px-3 py-2 text-xs font-bold text-on-error transition-all hover:opacity-90 disabled:opacity-60"
            >
              {isClaiming ? "Claiming..." : "Claim Default"}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 p-6">
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Total Yield Earned</p>
        <p className="mt-1 text-2xl font-bold text-green-700">{formatUSDC(totalYieldEarned)}</p>
      </div>

      <InvoiceTable
        tableId="lp_portfolio_table"
        data={invoices}
        columns={columns}
        isLoading={isLoading}
        emptyStateNode={
          <EmptyState
            title="Portfolio Empty"
            description="You haven't funded any invoices yet."
            illustration={<LPPortfolioEmptyIllustration />}
          />
        }
        keyExtractor={(inv) => inv.id.toString()}
      />
    </div>
  );
}

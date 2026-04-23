import express, { Request, Response } from "express";
import { getInvoiceById, queryInvoices } from "./db";

/**
 * Build and return the Express application.
 * Calling this as a factory (rather than exporting a singleton) makes
 * the app trivially injectable in tests.
 */
export function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  // ── GET /health ────────────────────────────────────────────────────────────
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // ── GET /invoices ──────────────────────────────────────────────────────────
  // Supported query parameters (all optional, ANDed together):
  //   ?status=Pending|Funded|Paid|Defaulted
  //   ?freelancer=G...
  //   ?payer=G...
  //   ?funder=G...
  app.get("/invoices", (req: Request, res: Response) => {
    const { status, freelancer, payer, funder } = req.query;

    const invoices = queryInvoices({
      status: typeof status === "string" ? status : undefined,
      freelancer: typeof freelancer === "string" ? freelancer : undefined,
      payer: typeof payer === "string" ? payer : undefined,
      funder: typeof funder === "string" ? funder : undefined,
    });

    res.json({ invoices });
  });

  // ── GET /invoice/:id ───────────────────────────────────────────────────────
  app.get("/invoice/:id", (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id) || id <= 0) {
      res.status(400).json({ error: "Invalid invoice ID — must be a positive integer" });
      return;
    }

    const invoice = getInvoiceById(id);
    if (!invoice) {
      res.status(404).json({ error: `Invoice #${id} not found` });
      return;
    }

    res.json({ invoice });
  });

  return app;
}

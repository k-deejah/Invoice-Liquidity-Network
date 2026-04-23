import Database from "better-sqlite3";
import { CONFIG } from "./config";
import type { ILNEvent, Invoice, InvoiceStatus } from "./types";

// ─── Singleton connection ─────────────────────────────────────────────────────

let _db: Database.Database | null = null;

/** Return the singleton database connection, creating and migrating it on first call. */
export function getDb(): Database.Database {
  if (!_db) {
    _db = createDb(CONFIG.dbPath);
  }
  return _db;
}

/** Create a new database at the given path (use ":memory:" for tests). */
export function createDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

/** Override the singleton. Used in tests to inject an in-memory database. */
export function setDb(db: Database.Database): void {
  _db = db;
}

// ─── Schema migrations ────────────────────────────────────────────────────────

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id            INTEGER PRIMARY KEY,
      freelancer    TEXT    NOT NULL,
      payer         TEXT    NOT NULL,
      amount        TEXT    NOT NULL,
      due_date      INTEGER NOT NULL,
      discount_rate INTEGER NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'Pending',
      funder        TEXT,
      funded_at     INTEGER,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id         TEXT    PRIMARY KEY,
      event_type       TEXT    NOT NULL,
      invoice_id       INTEGER NOT NULL,
      ledger           INTEGER NOT NULL,
      ledger_closed_at TEXT    NOT NULL,
      created_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cursor (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      last_ledger  INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_freelancer ON invoices(freelancer);
    CREATE INDEX IF NOT EXISTS idx_invoices_payer      ON invoices(payer);
    CREATE INDEX IF NOT EXISTS idx_invoices_funder     ON invoices(funder);
    CREATE INDEX IF NOT EXISTS idx_events_invoice_id   ON events(invoice_id);
  `);
}

// ─── Invoice CRUD ─────────────────────────────────────────────────────────────

/**
 * Insert a new invoice or update an existing one.
 * On conflict (same id), only mutable fields are updated.
 * `created_at` is never overwritten.
 */
export function upsertInvoice(
  invoice: Omit<Invoice, "created_at" | "updated_at">
): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO invoices
         (id, freelancer, payer, amount, due_date, discount_rate,
          status, funder, funded_at, created_at, updated_at)
       VALUES
         (@id, @freelancer, @payer, @amount, @due_date, @discount_rate,
          @status, @funder, @funded_at, @created_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
         status    = excluded.status,
         funder    = excluded.funder,
         funded_at = excluded.funded_at,
         updated_at = excluded.updated_at`
    )
    .run({
      ...invoice,
      funder: invoice.funder ?? null,
      funded_at: invoice.funded_at ?? null,
      created_at: now,
      updated_at: now,
    });
}

/** Update only the status (and optionally funder/funded_at) of an existing invoice. */
export function updateInvoiceStatus(
  id: number,
  status: InvoiceStatus,
  extra?: { funder?: string; funded_at?: number }
): void {
  const now = Date.now();
  if (extra?.funder !== undefined) {
    getDb()
      .prepare(
        `UPDATE invoices
         SET status = ?, funder = ?, funded_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(status, extra.funder, extra.funded_at ?? null, now, id);
  } else {
    getDb()
      .prepare(
        `UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?`
      )
      .run(status, now, id);
  }
}

/** Return a single invoice by ID, or undefined if not found. */
export function getInvoiceById(id: number): Invoice | undefined {
  return getDb()
    .prepare("SELECT * FROM invoices WHERE id = ?")
    .get(id) as Invoice | undefined;
}

export interface InvoiceFilter {
  status?: string;
  freelancer?: string;
  payer?: string;
  funder?: string;
}

/** Return all invoices matching the given filter (all fields are ANDed). */
export function queryInvoices(filter: InvoiceFilter): Invoice[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.freelancer) {
    clauses.push("freelancer = ?");
    params.push(filter.freelancer);
  }
  if (filter.payer) {
    clauses.push("payer = ?");
    params.push(filter.payer);
  }
  if (filter.funder) {
    clauses.push("funder = ?");
    params.push(filter.funder);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM invoices ${where} ORDER BY id ASC`)
    .all(...params) as Invoice[];
}

// ─── Event deduplication ──────────────────────────────────────────────────────

/** Return true if this event has already been processed. */
export function hasEvent(eventId: string): boolean {
  return (
    getDb()
      .prepare("SELECT 1 FROM events WHERE event_id = ?")
      .get(eventId) !== undefined
  );
}

/**
 * Insert an event record.
 * Uses INSERT OR IGNORE so duplicate events are silently dropped.
 */
export function insertEvent(event: ILNEvent): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO events
         (event_id, event_type, invoice_id, ledger, ledger_closed_at, created_at)
       VALUES
         (@event_id, @event_type, @invoice_id, @ledger, @ledger_closed_at, @created_at)`
    )
    .run(event);
}

// ─── Cursor management ────────────────────────────────────────────────────────

/** Return the last processed ledger sequence, or 0 if never set. */
export function getCursorLedger(): number {
  const row = getDb()
    .prepare("SELECT last_ledger FROM cursor WHERE id = 1")
    .get() as { last_ledger: number } | undefined;
  return row?.last_ledger ?? 0;
}

/** Persist the last processed ledger sequence. */
export function setCursorLedger(ledger: number): void {
  getDb()
    .prepare(
      `INSERT INTO cursor (id, last_ledger, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_ledger = excluded.last_ledger,
         updated_at  = excluded.updated_at`
    )
    .run(ledger, Date.now());
}

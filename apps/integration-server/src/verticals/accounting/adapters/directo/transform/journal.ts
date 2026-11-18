import { toCalendarDate } from '../../shared/transform'
/**
 * Directo transaction (general ledger journal entry) transform.
 *
 * Endpoint: GET /v1/transactions
 * Single: GET /v1/transactions?number=<n>
 *
 * Directo calls GL postings "transactions" (type=FIN by default).
 * Each transaction has rows with debit/credit amounts per account.
 */
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

// ── Directo wire types ────────────────────────────────────────────────────────

export interface DirectoTransactionRow {
  rn?: number           // row number
  account?: string      // GL account code
  debitamount?: number  // debit side amount
  creditamount?: number // credit side amount
  vatcode?: string      // VAT code
  currency?: string     // row currency
  description?: string  // row description
  reference?: string    // row reference
  project?: string      // project code
  [key: string]: unknown
}

export interface DirectoTransaction {
  number?: string | number   // transaction number (mandatory)
  type?: string              // transaction type (FIN = journal entry)
  date?: string              // transaction date ISO-8601
  reference?: string         // document reference
  description?: string       // description / comment
  rows?: DirectoTransactionRow[]
  [key: string]: unknown
}

// ── Line item mapping ─────────────────────────────────────────────────────────

function mapRow(row: DirectoTransactionRow): JournalLineitem {
  return {
    id: row.rn !== undefined ? String(row.rn) : undefined,
    accountId: row.account || undefined,
    description: row.description || undefined,
    debitAmount: row.debitamount || undefined,
    creditAmount: row.creditamount || undefined,
    projectId: row.project || undefined,
  }
}

// ── Public transforms ─────────────────────────────────────────────────────────

export function transformJournal(raw: DirectoTransaction): Journal {
  return {
    id: raw.number !== undefined ? String(raw.number) : undefined,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    source: raw.type || undefined,
    lineItems: Array.isArray(raw.rows) ? raw.rows.map(mapRow) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Journal → Directo body (for create)
export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    type: 'FIN',
    date: toCalendarDate(journal.postedAt),
    reference: journal.reference,
    description: journal.description,
    rows: journal.lineItems?.map((li) => ({
      account: li.accountId,
      debitamount: li.debitAmount,
      creditamount: li.creditAmount,
      description: li.description,
      project: li.projectId,
    })),
  }
}

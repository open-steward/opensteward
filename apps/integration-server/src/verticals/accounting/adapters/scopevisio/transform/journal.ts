/**
 * Scopevisio journal (posting) → canonical Journal transform.
 *
 * Scopevisio field notes (journal / Buchungsjournal):
 *  - `rowNumber`           : sequential row number within the journal
 *  - `documentNumber`      : internal document number (Belegnummer)
 *  - `externalDocumentNumber` : external reference number
 *  - `postingDate`         : epoch ms – the posting date (Buchungsdatum)
 *  - `documentText`        : booking description / memo
 *  - `accountNumber`       : account number involved in this posting row
 *  - `accountName`         : account name
 *  - `amount`              : posting amount (positive = debit, negative = credit)
 *  - `createdTs`           : epoch ms – when the record was created
 *
 * The journal endpoint returns posting rows (individual debit/credit lines) rather
 * than grouped voucher objects; we group by `documentNumber` to produce one Journal
 * per document.  When fetching a single journal by id we receive a list and collapse.
 *
 * List endpoint: POST /journal  (search body with page/pageSize/fields/postingDateSince/postingDateBefore)
 * File endpoint: GET /journal/{documentNumber}/file
 *
 * Docs: https://appload.scopevisio.com/rest/swagger.json
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ScopevisioPostingRow {
  rowNumber?: number
  documentNumber?: string
  externalDocumentNumber?: string
  postingDate?: number     // epoch ms
  documentText?: string
  accountNumber?: string
  accountName?: string
  summaryAccount?: string
  amount?: number
  foreignCurrencyAmount?: number
  foreignCurrencyCode?: string
  rowText?: string
  vatKey?: string
  createdTs?: number       // epoch ms
  postingPeriodLabel?: string
  [key: string]: unknown
}

function toDate(epochMs?: number | null): Date | undefined {
  if (!epochMs) return undefined
  return new Date(epochMs)
}

function mapRow(row: ScopevisioPostingRow): JournalLineitem {
  const amount = row.amount ?? 0
  return {
    accountId: row.accountNumber || undefined,
    description: row.rowText || row.documentText || undefined,
    debitAmount: amount >= 0 ? amount : undefined,
    creditAmount: amount < 0 ? Math.abs(amount) : undefined,
  }
}

/** Transform a group of posting rows that share a documentNumber into a Journal. */
export function transformJournalRows(rows: ScopevisioPostingRow[]): Journal {
  const first = rows[0] ?? {}
  return {
    id: first.documentNumber || undefined,
    description: first.documentText || undefined,
    reference: first.externalDocumentNumber || first.documentNumber || undefined,
    lineItems: rows.map(mapRow),
    postedAt: toDate(first.postingDate),
    createdAt: toDate(first.createdTs),
    metadata: { rows } as Record<string, unknown>,
  }
}

/** Transform a single raw posting row into a Journal (used when /journal returns records[]).
 *  Callers that receive a flat list should group by documentNumber first, then call
 *  transformJournalRows().  This helper is a convenience for single-row responses. */
export function transformJournal(raw: ScopevisioPostingRow): Journal {
  return transformJournalRows([raw])
}

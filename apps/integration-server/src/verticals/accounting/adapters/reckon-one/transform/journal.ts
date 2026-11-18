/**
 * Reckon One v2 journal entry transforms.
 *
 * API endpoint: GET /R1/{cashbookId}/journals[/{journalId}]
 *
 * Key fields: id, date, reference, description, currency,
 *             lines[].{id, accountId, description, debitAmount, creditAmount}
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ReckonOneJournalLine {
  id?: string
  account?: { id: string; name?: string }
  contact?: { id: string; name?: string }
  description?: string
  /** If positive: credit. Reckon One uses separate debit/credit fields. */
  debitAmount?: number
  creditAmount?: number
  taxAmount?: number
  [key: string]: unknown
}

export interface ReckonOneJournalEntry {
  id: string
  date?: string
  reference?: string
  description?: string
  currency?: string
  lines?: ReckonOneJournalLine[]
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

function toMinorUnits(value: number | undefined | null): number | undefined {
  return value != null ? Math.round(value * 100) : undefined
}

function mapLine(line: ReckonOneJournalLine): JournalLineitem {
  return {
    id: line.id || undefined,
    accountId: line.account?.id || undefined,
    contactId: line.contact?.id || undefined,
    description: line.description || undefined,
    debitAmount: toMinorUnits(line.debitAmount),
    creditAmount: toMinorUnits(line.creditAmount),
    taxAmount: toMinorUnits(line.taxAmount),
  }
}

export function transformJournal(raw: ReckonOneJournalEntry): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.createdDateTime ? new Date(raw.createdDateTime) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

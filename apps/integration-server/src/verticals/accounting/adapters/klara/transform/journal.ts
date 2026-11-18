/**
 * KLARA journal entry (Buchungssatz) transform.
 *
 * KLARA accounting journal entries are double-entry bookkeeping records.
 * Fields: id, description, reference, currency, posted_date, lines[]
 * Line fields: id, account_id, contact_id, description, debit_amount, credit_amount
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface KlaraJournalLine {
  id?: string
  account_id?: string
  contact_id?: string
  description?: string
  debit_amount?: number
  credit_amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface KlaraJournalEntry {
  id: string
  description?: string
  reference?: string
  currency?: string
  posted_date?: string
  created_at?: string
  updated_at?: string
  lines?: KlaraJournalLine[]
  [key: string]: unknown
}

function mapLine(line: KlaraJournalLine): JournalLineitem {
  return {
    id: line.id || undefined,
    accountId: line.account_id || undefined,
    contactId: line.contact_id || undefined,
    description: line.description || undefined,
    debitAmount: line.debit_amount,
    creditAmount: line.credit_amount,
    taxAmount: line.tax_amount,
  }
}

export function transformJournal(raw: KlaraJournalEntry): Journal {
  return {
    id: raw.id || undefined,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).length > 0 ? (raw.lines ?? []).map(mapLine) : undefined,
    postedAt: raw.posted_date ? new Date(raw.posted_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

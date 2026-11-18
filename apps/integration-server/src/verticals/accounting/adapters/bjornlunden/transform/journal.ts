import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BlJournalRow {
  Id: string
  AccountNumber: number
  Description: string
  DebitAmount: number
  CreditAmount: number
  ContactId: string
  [key: string]: unknown
}

export interface BlJournalEntry {
  Id: string
  Description: string
  VoucherNumber: string
  EntryDate: string
  Rows: BlJournalRow[]
  [key: string]: unknown
}

function mapRow(row: BlJournalRow): JournalLineitem {
  return {
    id: row.Id || undefined,
    accountId: row.AccountNumber ? String(row.AccountNumber) : undefined,
    description: row.Description || undefined,
    debitAmount: row.DebitAmount || undefined,
    creditAmount: row.CreditAmount || undefined,
    contactId: row.ContactId || undefined,
  }
}

export function transformJournal(raw: BlJournalEntry): Journal {
  return {
    id: raw.Id,
    description: raw.Description || undefined,
    reference: raw.VoucherNumber || undefined,
    lineItems: (raw.Rows ?? []).map(mapRow),
    postedAt: raw.EntryDate ? new Date(raw.EntryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface TwentyFourSevenJournalLine {
  id: string
  accountId: string
  description: string
  debit: number
  credit: number
  taxAmount: number
  contactId: string
  [key: string]: unknown
}

export interface TwentyFourSevenJournal {
  id: string
  entryDate: string
  description: string
  voucherNumber: string
  lines: TwentyFourSevenJournalLine[]
  [key: string]: unknown
}

function mapLine(row: TwentyFourSevenJournalLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    contactId: row.contactId || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
    taxAmount: row.taxAmount || undefined,
  }
}

export function transformJournal(raw: TwentyFourSevenJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.voucherNumber || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

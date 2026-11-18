import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ExactJournalLine {
  ID?: string
  GLAccount?: string
  Description?: string
  AmountDC?: number
  AmountDCDebit?: number
  AmountDCCredit?: number
  [key: string]: unknown
}

export interface ExactJournalEntry {
  EntryID?: string
  EntryNumber?: number | string
  JournalCode?: string
  Description?: string
  EntryDate?: string
  Lines?: ExactJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: ExactJournalLine): JournalLineitem {
  return {
    id: line.ID || undefined,
    accountId: line.GLAccount || undefined,
    description: line.Description || undefined,
    debitAmount: line.AmountDCDebit,
    creditAmount: line.AmountDCCredit,
    totalAmount: line.AmountDC,
  }
}

export function transformJournal(raw: ExactJournalEntry): Journal {
  return {
    id: raw.EntryID || undefined,
    reference: raw.EntryNumber !== undefined ? String(raw.EntryNumber) : undefined,
    description: raw.Description || undefined,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.EntryDate ? new Date(raw.EntryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

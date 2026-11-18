import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface DineroJournalLine {
  Guid: string
  AccountNumber: number
  Description: string
  Amount: number
  VatAmount: number
  [key: string]: unknown
}

export interface DineroJournalEntry {
  Guid: string
  Description: string
  VoucherNumber: number
  EntryDate: string
  Lines: DineroJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: DineroJournalLine): JournalLineitem {
  return {
    id: line.Guid || undefined,
    accountId: line.AccountNumber ? String(line.AccountNumber) : undefined,
    description: line.Description || undefined,
    debitAmount: line.Amount > 0 ? line.Amount : undefined,
    creditAmount: line.Amount < 0 ? Math.abs(line.Amount) : undefined,
    taxAmount: line.VatAmount || undefined,
  }
}

export function transformJournal(raw: DineroJournalEntry): Journal {
  return {
    id: raw.Guid,
    description: raw.Description || undefined,
    reference: raw.VoucherNumber != null ? String(raw.VoucherNumber) : undefined,
    lineItems: (raw.Lines ?? []).map(mapJournalLine),
    postedAt: raw.EntryDate ? new Date(raw.EntryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface PowerOfficeJournalEntryLine {
  id: number
  accountCode: string
  description: string
  amount: number
  debitCreditCode: 'D' | 'C'
  currencyCode: string
}

export interface PowerOfficeJournalEntry {
  id: number
  transactionDate: string
  description: string
  lines: PowerOfficeJournalEntryLine[]
  [key: string]: unknown
}

function mapLine(line: PowerOfficeJournalEntryLine): JournalLineitem {
  return {
    accountId: line.accountCode || undefined,
    description: line.description || undefined,
    debitAmount: line.debitCreditCode === 'D' ? line.amount : undefined,
    creditAmount: line.debitCreditCode === 'C' ? line.amount : undefined,
  }
}

export function transformJournal(raw: PowerOfficeJournalEntry): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

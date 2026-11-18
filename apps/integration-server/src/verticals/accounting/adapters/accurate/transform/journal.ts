import type { Journal } from '../../../schema/journal'

export interface AccurateJournalLine {
  id: number
  accountNo: string
  description: string | null
  debitAmount: number
  creditAmount: number
  [key: string]: unknown
}

export interface AccurateJournal {
  id: number
  date: string
  description: string | null
  lines: AccurateJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: AccurateJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map((line) => ({
      id: String(line.id),
      accountId: line.accountNo || undefined,
      description: line.description || undefined,
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
    })),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

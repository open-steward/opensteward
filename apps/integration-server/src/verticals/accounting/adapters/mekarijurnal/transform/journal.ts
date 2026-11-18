import type { Journal } from '../../../schema/journal'

export interface MekariJurnalJournalLine {
  id: number
  account_id: number | string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface MekariJurnalJournal {
  id: number
  date: string
  memo: string | null
  lines: MekariJurnalJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: MekariJurnalJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.memo || undefined,
    lineItems: (raw.lines ?? []).map((line) => ({
      id: String(line.id),
      accountId: String(line.account_id),
      debitAmount: line.debit,
      creditAmount: line.credit,
    })),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

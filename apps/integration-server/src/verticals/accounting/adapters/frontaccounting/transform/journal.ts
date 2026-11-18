import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FAJournalLine {
  id?: number | string
  account?: string
  account_name?: string
  memo?: string
  amount?: number
  [key: string]: unknown
}

export interface FAJournal {
  id?: number | string
  reference?: string
  memo?: string
  tran_date?: string
  lines?: FAJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: FAJournalLine): JournalLineitem {
  const amount = line.amount ?? 0
  return {
    accountId: line.account || undefined,
    description: line.memo || line.account_name || undefined,
    debitAmount: amount > 0 ? amount : undefined,
    creditAmount: amount < 0 ? Math.abs(amount) : undefined,
  }
}

export function transformJournal(raw: FAJournal): Journal {
  return {
    id: raw.id !== undefined ? String(raw.id) : '',
    description: raw.memo || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.tran_date ? new Date(raw.tran_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

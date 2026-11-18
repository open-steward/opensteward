import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface DaftraJournalLine {
  AccountId?: string
  Debit?: number
  Credit?: number
  Description?: string
  [key: string]: unknown
}

export interface DaftraJournal {
  id: string
  Date?: string
  Description?: string
  Reference?: string
  Lines?: DaftraJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: DaftraJournalLine): JournalLineitem {
  return {
    accountId: line.AccountId ? String(line.AccountId) : undefined,
    description: line.Description || undefined,
    debitAmount: line.Debit,
    creditAmount: line.Credit,
  }
}

export function transformJournal(raw: DaftraJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.Description || undefined,
    reference: raw.Reference || undefined,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

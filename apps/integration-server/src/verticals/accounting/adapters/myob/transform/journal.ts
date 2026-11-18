import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MyobJournalLine {
  UID?: string
  Account?: { UID?: string }
  Memo?: string
  IsCredit?: boolean
  Amount?: number
  [key: string]: unknown
}

export interface MyobJournalEntry {
  UID?: string
  DisplayID?: string
  DateOccurred?: string
  Memo?: string
  Lines?: MyobJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: MyobJournalLine): JournalLineitem {
  return {
    id: line.UID || undefined,
    accountId: line.Account?.UID || undefined,
    description: line.Memo || undefined,
    debitAmount: line.IsCredit ? undefined : line.Amount,
    creditAmount: line.IsCredit ? line.Amount : undefined,
  }
}

export function transformJournal(raw: MyobJournalEntry): Journal {
  return {
    id: raw.UID || undefined,
    reference: raw.DisplayID || undefined,
    description: raw.Memo || undefined,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.DateOccurred ? new Date(raw.DateOccurred) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

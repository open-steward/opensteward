import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ReckonJournalLineItem {
  id: string
  accountId: string
  accountName: string
  description: string
  debitAmount: number
  creditAmount: number
  [key: string]: unknown
}

export interface ReckonJournal {
  id: string
  reference: string
  date: string
  description: string
  lineItems: ReckonJournalLineItem[]
  [key: string]: unknown
}

function mapJournalLineitem(item: ReckonJournalLineItem): JournalLineitem {
  return {
    id: item.id || undefined,
    accountId: item.accountId || undefined,
    description: item.description || undefined,
    debitAmount: item.debitAmount || undefined,
    creditAmount: item.creditAmount || undefined,
  }
}

export function transformJournal(raw: ReckonJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lineItems ?? []).map(mapJournalLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

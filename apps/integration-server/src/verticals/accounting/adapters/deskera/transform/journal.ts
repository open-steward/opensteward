import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface DeskeraJournalLineItem {
  id?: string
  accountCode?: string
  accountName?: string
  description?: string
  credit?: number
  debit?: number
  [key: string]: unknown
}

export interface DeskeraJournal {
  id: string
  entryNumber?: string
  journalDate?: string
  memo?: string
  lineItems?: DeskeraJournalLineItem[]
  [key: string]: unknown
}

function mapLineitem(item: DeskeraJournalLineItem): JournalLineitem {
  return {
    accountId: item.accountCode || undefined,
    description: item.description || item.accountName || undefined,
    debitAmount: item.debit || undefined,
    creditAmount: item.credit || undefined,
  }
}

export function transformJournal(raw: DeskeraJournal): Journal {
  return {
    id: raw.id,
    description: raw.memo || undefined,
    reference: raw.entryNumber || undefined,
    lineItems: (raw.lineItems ?? []).map(mapLineitem),
    postedAt: raw.journalDate ? new Date(raw.journalDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

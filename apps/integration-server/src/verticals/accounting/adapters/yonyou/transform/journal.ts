import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface YonyouJournalLine {
  id?: string
  accountId?: string
  description?: string
  debit?: number
  credit?: number
  taxAmount?: number
  [key: string]: unknown
}

export interface YonyouJournal {
  id?: string
  vouchdate?: string
  description?: string
  code?: string
  currency?: string
  lines?: YonyouJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: YonyouJournal): Journal {
  return {
    id: raw.id ? String(raw.id) : '',
    description: raw.description || undefined,
    reference: raw.code || undefined,
    currency: raw.currency || undefined,
    postedAt: raw.vouchdate ? new Date(raw.vouchdate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      accountId: l.accountId ? String(l.accountId) : undefined,
      description: l.description || undefined,
      debitAmount: l.debit,
      creditAmount: l.credit,
      taxAmount: l.taxAmount,
    } satisfies JournalLineitem)),
    metadata: raw as Record<string, unknown>,
  }
}

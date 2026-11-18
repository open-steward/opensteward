import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ChanjetJournalLine {
  id?: string
  accountId?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface ChanjetJournal {
  id?: string
  date?: string
  description?: string
  reference?: string
  currency?: string
  lines?: ChanjetJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: ChanjetJournal): Journal {
  return {
    id: raw.id ? String(raw.id) : '',
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      accountId: l.accountId ? String(l.accountId) : undefined,
      description: l.description || undefined,
      debitAmount: l.debit,
      creditAmount: l.credit,
    } satisfies JournalLineitem)),
    metadata: raw as Record<string, unknown>,
  }
}

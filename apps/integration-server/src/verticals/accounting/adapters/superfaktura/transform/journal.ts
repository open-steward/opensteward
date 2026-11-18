import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SuperfakturaJournalLine {
  id?: string | number
  account_id?: string
  description?: string
  debit?: number
  credit?: number
  amount?: number
  [key: string]: unknown
}

export interface SuperfakturaJournal {
  id: string | number
  date?: string
  description?: string
  reference?: string
  currency?: string
  items?: SuperfakturaJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: SuperfakturaJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.items ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      accountId: l.account_id ? String(l.account_id) : undefined,
      description: l.description || undefined,
      debitAmount: l.debit,
      creditAmount: l.credit,
      totalAmount: l.amount,
    } satisfies JournalLineitem)),
    metadata: raw as Record<string, unknown>,
  }
}

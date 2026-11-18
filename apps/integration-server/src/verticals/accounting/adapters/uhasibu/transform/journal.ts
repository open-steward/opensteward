import type { Journal } from '../../../schema/journal'
import { nonempty, parseDecimal } from '../../shared/transform'

export interface UhasibuJournalLine {
  id?: string
  account_id?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface UhasibuJournal {
  id: string
  reference?: string
  date?: string
  currency?: string
  description?: string
  lines?: UhasibuJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: UhasibuJournal): Journal {
  return {
    id: String(raw.id),
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    description: raw.description || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: nonempty(
      (raw.lines ?? []).map((li) => ({
        id: li.id ? String(li.id) : undefined,
        accountId: li.account_id ? String(li.account_id) : undefined,
        description: li.description || undefined,
        debitAmount: parseDecimal(li.debit),
        creditAmount: parseDecimal(li.credit),
      })),
    ),
    metadata: raw as Record<string, unknown>,
  }
}

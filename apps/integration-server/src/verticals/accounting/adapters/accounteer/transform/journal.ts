import type { Journal } from '../../../schema/journal'
import { nonempty, parseDecimal } from '../../shared/transform'

export interface AccounteerJournalLine {
  id?: string
  account_id?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface AccounteerJournal {
  id: string
  reference?: string
  description?: string
  date?: string
  currency?: string
  lines?: AccounteerJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: AccounteerJournal): Journal {
  return {
    id: String(raw.id),
    reference: raw.reference || undefined,
    description: raw.description || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    currency: raw.currency || undefined,
    lineItems: nonempty(
      (raw.lines ?? []).map((line) => ({
        id: line.id ? String(line.id) : undefined,
        accountId: line.account_id ? String(line.account_id) : undefined,
        description: line.description || undefined,
        debitAmount: parseDecimal(line.debit),
        creditAmount: parseDecimal(line.credit),
      })),
    ),
    metadata: raw as Record<string, unknown>,
  }
}

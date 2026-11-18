import type { Journal } from '../../../schema/journal'
import { nonempty, parseDecimal } from '../../shared/transform'

export interface MazumaJournalLine {
  id?: string
  account_id?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface MazumaJournal {
  id: string
  reference?: string
  description?: string
  date?: string
  lines?: MazumaJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: MazumaJournal): Journal {
  return {
    id: String(raw.id),
    reference: raw.reference || undefined,
    description: raw.description || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
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

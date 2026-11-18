import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface EBoekhoudenMutationLine {
  id?: number | string
  ledgerId?: number | string
  description?: string
  debit?: number
  credit?: number
  amount?: number
  [key: string]: unknown
}

export interface EBoekhoudenMutation {
  id?: number | string
  date?: string
  description?: string
  reference?: string
  lines?: EBoekhoudenMutationLine[]
  [key: string]: unknown
}

function mapLineitem(line: EBoekhoudenMutationLine): JournalLineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.ledgerId !== undefined ? String(line.ledgerId) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit,
    creditAmount: line.credit,
    totalAmount: line.amount,
  }
}

export function transformJournal(raw: EBoekhoudenMutation): Journal {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

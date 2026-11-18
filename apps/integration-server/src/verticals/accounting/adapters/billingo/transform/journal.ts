import type { Journal } from '../../../schema/journal'

export interface BillingoJournal {
  id: string | number
  date?: string
  reference?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export function transformJournal(raw: BillingoJournal): Journal {
  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    reference: raw.reference || undefined,
    description: raw.description || undefined,
    metadata: raw as Record<string, unknown>,
  }
}

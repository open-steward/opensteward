import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface DilovodJournal {
  id: string
  date: string
  doc_number?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export function transformJournal(raw: DilovodJournal): Journal {
  const lineItems: JournalLineitem[] = []
  if (raw.debit !== undefined || raw.credit !== undefined) {
    lineItems.push({
      description: raw.description || undefined,
      debitAmount: raw.debit || undefined,
      creditAmount: raw.credit || undefined,
    })
  }

  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.doc_number || undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

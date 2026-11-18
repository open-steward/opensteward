import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SevDeskAccountingContact {
  id: string
  object: { id: string; objectName: string }
  bookingDate: string
  amount: number
  currency: string
  comment: string
  entryType: { id: string; objectName: string } | null
  [key: string]: unknown
}

export function transformJournal(raw: SevDeskAccountingContact): Journal {
  const lineitem: JournalLineitem = {
    description: raw.comment || undefined,
    totalAmount: raw.amount,
    debitAmount: raw.amount > 0 ? raw.amount : undefined,
    creditAmount: raw.amount < 0 ? Math.abs(raw.amount) : undefined,
  }

  return {
    id: raw.id,
    description: raw.comment || undefined,
    currency: raw.currency || undefined,
    lineItems: [lineitem],
    postedAt: raw.bookingDate ? new Date(raw.bookingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

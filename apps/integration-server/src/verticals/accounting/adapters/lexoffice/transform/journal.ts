import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface LexofficeJournalEntry {
  id: string
  createdDate: string
  updatedDate: string
  bookingDate: string
  description: string
  accountId: string
  amount: number
  currency: string
  debitCreditIndicator: 'debit' | 'credit'
  [key: string]: unknown
}

export function transformJournal(raw: LexofficeJournalEntry): Journal {
  const lineitem: JournalLineitem = {
    accountId: raw.accountId || undefined,
    description: raw.description || undefined,
    debitAmount: raw.debitCreditIndicator === 'debit' ? raw.amount : undefined,
    creditAmount: raw.debitCreditIndicator === 'credit' ? raw.amount : undefined,
  }

  return {
    id: raw.id,
    description: raw.description || undefined,
    currency: raw.currency || undefined,
    lineItems: [lineitem],
    postedAt: raw.bookingDate ? new Date(raw.bookingDate) : undefined,
    createdAt: raw.createdDate ? new Date(raw.createdDate) : undefined,
    updatedAt: raw.updatedDate ? new Date(raw.updatedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

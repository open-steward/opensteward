import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FreshBooksJournalEntry {
  id: number
  account_id: number
  credit: { amount: string }
  debit: { amount: string }
  description: string
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export function transformJournal(raw: FreshBooksJournalEntry): Journal {
  const lineItems: JournalLineitem[] = []

  const debitAmount = raw.debit?.amount ? parseFloat(raw.debit.amount) : undefined
  const creditAmount = raw.credit?.amount ? parseFloat(raw.credit.amount) : undefined

  if (debitAmount !== undefined || creditAmount !== undefined) {
    lineItems.push({
      accountId: raw.account_id ? String(raw.account_id) : undefined,
      description: raw.description || undefined,
      debitAmount,
      creditAmount,
    })
  }

  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

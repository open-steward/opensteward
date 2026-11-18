import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface InbooksTransaction {
  id: number | string
  account_id?: number | string
  description?: string
  date?: string
  currency?: string
  amount?: number
  type?: string
  reference?: string
  [key: string]: unknown
}

function mapLineitem(raw: InbooksTransaction): TransactionLineitem {
  return {
    accountId: raw.account_id !== undefined ? String(raw.account_id) : undefined,
    description: raw.description || undefined,
    totalAmount: raw.amount,
  }
}

export function transformTransaction(raw: InbooksTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id !== undefined ? String(raw.account_id) : undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    memo: raw.description || undefined,
    lineItems: [mapLineitem(raw)],
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

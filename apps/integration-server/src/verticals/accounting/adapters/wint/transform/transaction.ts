import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface WintTransaction {
  id: number | string
  account_id?: string | number
  description?: string
  date?: string
  currency?: string
  amount?: number
  type?: string
  reference?: string
  [key: string]: unknown
}

function mapLineitem(raw: WintTransaction): TransactionLineitem {
  return {
    accountId: raw.account_id != null ? String(raw.account_id) : undefined,
    description: raw.description || undefined,
    totalAmount: raw.amount,
  }
}

export function transformTransaction(raw: WintTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id != null ? String(raw.account_id) : undefined,
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

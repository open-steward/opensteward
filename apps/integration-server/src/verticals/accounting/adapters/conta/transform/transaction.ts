import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface ContaTransaction {
  id: string
  date?: string
  description?: string
  amount?: number
  currency?: string
  account_id?: string
  [key: string]: unknown
}

function mapLineitem(raw: ContaTransaction): TransactionLineitem {
  return {
    accountId: raw.account_id || undefined,
    description: raw.description || undefined,
    totalAmount: raw.amount,
  }
}

export function transformTransaction(raw: ContaTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.account_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    memo: raw.description || undefined,
    lineItems: [mapLineitem(raw)],
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

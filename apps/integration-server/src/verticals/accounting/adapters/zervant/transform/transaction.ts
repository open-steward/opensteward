import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface ZervantTransaction {
  id: string
  date?: string
  description?: string
  amount?: number
  currency?: string
  accountCode?: string
  [key: string]: unknown
}

function mapLineitem(raw: ZervantTransaction): TransactionLineitem {
  return {
    accountId: raw.accountCode || undefined,
    description: raw.description || undefined,
    totalAmount: raw.amount,
  }
}

export function transformTransaction(raw: ZervantTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.accountCode || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    memo: raw.description || undefined,
    lineItems: [mapLineitem(raw)],
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

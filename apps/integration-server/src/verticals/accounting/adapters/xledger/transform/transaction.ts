import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface XledgerTransaction {
  id: string
  transactionDate?: string
  description?: string
  amount?: number
  currency?: string
  accountCode?: string
  [key: string]: unknown
}

function mapLineitem(raw: XledgerTransaction): TransactionLineitem {
  return {
    accountId: raw.accountCode || undefined,
    description: raw.description || undefined,
    totalAmount: raw.amount,
  }
}

export function transformTransaction(raw: XledgerTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.accountCode || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems: [mapLineitem(raw)],
    createdAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface SendRegningTransaction {
  id: string
  date?: string
  description?: string
  amount?: number
  currency?: string
  accountNo?: string
  [key: string]: unknown
}

function mapLineitem(raw: SendRegningTransaction): TransactionLineitem {
  return {
    accountId: raw.accountNo || undefined,
    description: raw.description || undefined,
    totalAmount: raw.amount,
  }
}

export function transformTransaction(raw: SendRegningTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.accountNo || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    memo: raw.description || undefined,
    lineItems: [mapLineitem(raw)],
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

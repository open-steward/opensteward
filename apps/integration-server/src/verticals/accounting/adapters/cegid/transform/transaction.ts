import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface CegidTransaction {
  id: string
  accountId: string
  type: string
  reference: string
  currency: string
  amount: number
  transactionDate: string
  [key: string]: unknown
}

export function transformTransaction(raw: CegidTransaction): Transaction {
  const lineItems: TransactionLineitem[] = [
    {
      accountId: raw.accountId || undefined,
      name: raw.type || undefined,
      totalAmount: raw.amount,
    },
  ]

  return {
    id: String(raw.id),
    accountId: raw.accountId || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems,
    createdAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

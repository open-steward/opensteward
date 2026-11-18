import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface RegateTransaction {
  id: string
  account_id: string
  type: string
  reference: string
  currency: string
  amount: number
  date: string
  [key: string]: unknown
}

export function transformTransaction(raw: RegateTransaction): Transaction {
  const lineItems: TransactionLineitem[] = [
    {
      accountId: raw.account_id || undefined,
      name: raw.type || undefined,
      totalAmount: raw.amount,
    },
  ]

  return {
    id: String(raw.id),
    accountId: raw.account_id || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

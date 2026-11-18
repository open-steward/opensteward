import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface QuipuTransaction {
  id: string
  account_id: string
  kind: string
  reference: string
  currency: string
  amount: number
  date: string
  description: string
  [key: string]: unknown
}

export function transformTransaction(raw: QuipuTransaction): Transaction {
  const lineItems: TransactionLineitem[] = [
    {
      accountId: raw.account_id || undefined,
      description: raw.description || undefined,
      totalAmount: raw.amount,
    },
  ]
  return {
    id: raw.id,
    accountId: raw.account_id || undefined,
    type: raw.kind || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

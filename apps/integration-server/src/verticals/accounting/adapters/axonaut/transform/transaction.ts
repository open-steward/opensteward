import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface AxonautTransaction {
  id: string
  account_id: string
  type: string
  description: string
  currency: string
  amount: number
  operation_date: string
  [key: string]: unknown
}

export function transformTransaction(raw: AxonautTransaction): Transaction {
  const lineItems: TransactionLineitem[] = [
    {
      accountId: raw.account_id || undefined,
      name: raw.description || undefined,
      totalAmount: raw.amount,
    },
  ]

  return {
    id: String(raw.id),
    accountId: raw.account_id || undefined,
    type: raw.type || undefined,
    reference: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems,
    createdAt: raw.operation_date ? new Date(raw.operation_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

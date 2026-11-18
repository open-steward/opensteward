import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface TeamSystemTransaction {
  id: string
  accountId: string
  transactionType: string
  reference: string
  currency: string
  amount: number
  date: string
  description: string
  [key: string]: unknown
}

function mapLineitems(raw: TeamSystemTransaction): TransactionLineitem[] {
  return [
    {
      accountId: raw.accountId || undefined,
      description: raw.description || undefined,
      totalAmount: raw.amount,
    },
  ]
}

export function transformTransaction(raw: TeamSystemTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.accountId || undefined,
    type: raw.transactionType || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems: mapLineitems(raw),
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

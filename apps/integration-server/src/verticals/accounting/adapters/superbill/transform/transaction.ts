import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface SuperbillTransaction {
  id: string
  account_id: string
  transaction_type: string
  reference: string
  currency: string
  amount: number
  date: string
  description: string
  [key: string]: unknown
}

function mapLineitems(raw: SuperbillTransaction): TransactionLineitem[] {
  return [
    {
      accountId: raw.account_id || undefined,
      description: raw.description || undefined,
      totalAmount: raw.amount,
    },
  ]
}

export function transformTransaction(raw: SuperbillTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id || undefined,
    type: raw.transaction_type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems: mapLineitems(raw),
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

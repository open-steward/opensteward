import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface CloudFinanceTransaction {
  id: string
  account_id: string
  type: string
  reference: string
  currency: string
  total_amount: number
  date: string
  description: string
  [key: string]: unknown
}

function mapLineitems(raw: CloudFinanceTransaction): TransactionLineitem[] {
  return [{ accountId: raw.account_id || undefined, description: raw.description || undefined, totalAmount: raw.total_amount }]
}

export function transformTransaction(raw: CloudFinanceTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: mapLineitems(raw),
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

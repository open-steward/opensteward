import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface BluenextTransaction {
  id: string
  accountId: string
  transactionType: string
  reference: string
  currency: string
  totalAmount: number
  date: string
  description: string
  [key: string]: unknown
}

function mapLineitems(raw: BluenextTransaction): TransactionLineitem[] {
  return [{ accountId: raw.accountId || undefined, description: raw.description || undefined, totalAmount: raw.totalAmount }]
}

export function transformTransaction(raw: BluenextTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.accountId || undefined,
    type: raw.transactionType || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: mapLineitems(raw),
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

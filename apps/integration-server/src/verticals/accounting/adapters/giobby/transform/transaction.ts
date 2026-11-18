import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface GiobbyTransaction {
  id: string
  account_id: string
  type: string
  reference: string
  currency: string
  amount: number
  date: string
  description: string
  [key: string]: unknown
}

function mapLineitems(raw: GiobbyTransaction): TransactionLineitem[] {
  return [{ accountId: raw.account_id || undefined, description: raw.description || undefined, totalAmount: raw.amount }]
}

export function transformTransaction(raw: GiobbyTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems: mapLineitems(raw),
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

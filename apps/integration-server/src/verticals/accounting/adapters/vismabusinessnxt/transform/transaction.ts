import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface VismaBusinessNxtTransaction {
  id: string
  date?: string
  description?: string
  amount?: number
  currency?: string
  accountNumber?: string
  [key: string]: unknown
}

function mapLineitem(raw: VismaBusinessNxtTransaction): TransactionLineitem {
  return {
    accountId: raw.accountNumber || undefined,
    description: raw.description || undefined,
    totalAmount: raw.amount,
  }
}

export function transformTransaction(raw: VismaBusinessNxtTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.accountNumber || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems: [mapLineitem(raw)],
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

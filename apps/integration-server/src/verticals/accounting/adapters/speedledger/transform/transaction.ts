import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface SpeedLedgerTransaction {
  id: number | string
  accountId?: number | string
  description?: string
  date?: string
  currency?: string
  amount?: number
  type?: string
  reference?: string
  [key: string]: unknown
}

function mapLineitem(raw: SpeedLedgerTransaction): TransactionLineitem {
  return {
    accountId: raw.accountId !== undefined ? String(raw.accountId) : undefined,
    description: raw.description || undefined,
    totalAmount: raw.amount,
  }
}

export function transformTransaction(raw: SpeedLedgerTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.accountId !== undefined ? String(raw.accountId) : undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    memo: raw.description || undefined,
    lineItems: [mapLineitem(raw)],
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

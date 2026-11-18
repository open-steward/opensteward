import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface UnimicroTransaction {
  ID?: number
  TransactionDate?: string
  Description?: string
  Amount?: number
  CurrencyCode?: string
  Account?: { AccountNumber?: string }
  [key: string]: unknown
}

function mapLineitem(raw: UnimicroTransaction): TransactionLineitem {
  return {
    accountId: raw.Account?.AccountNumber || undefined,
    description: raw.Description || undefined,
    totalAmount: raw.Amount,
  }
}

export function transformTransaction(raw: UnimicroTransaction): Transaction {
  return {
    id: String(raw.ID ?? ''),
    accountId: raw.Account?.AccountNumber || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.Amount,
    memo: raw.Description || undefined,
    lineItems: [mapLineitem(raw)],
    createdAt: raw.TransactionDate ? new Date(raw.TransactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Transaction } from '../../../schema/transaction'

export interface ManagerioTransaction {
  Key: string
  Date: string
  Description: string
  Amount: number
  Currency: string
  Status: string
  [key: string]: unknown
}

export function transformTransaction(raw: ManagerioTransaction): Transaction {
  return {
    id: String(raw.Key),
    memo: raw.Description || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    createdAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Transaction } from '../../../schema/transaction'

export interface ProsvasisTransaction {
  id: string | number
  Date: string
  Description: string
  Amount: number
  Currency: string
  [key: string]: unknown
}

export function transformTransaction(raw: ProsvasisTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.Description || undefined,
    totalAmount: raw.Amount,
    currency: raw.Currency || undefined,
    createdAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

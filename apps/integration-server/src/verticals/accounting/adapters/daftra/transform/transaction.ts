import type { Transaction } from '../../../schema/transaction'

export interface DaftraTransaction {
  id: string
  Date?: string
  Amount?: number
  Currency?: string
  Type?: string
  Description?: string
  Status?: string
  [key: string]: unknown
}

export function transformTransaction(raw: DaftraTransaction): Transaction {
  return {
    id: String(raw.id),
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    memo: raw.Description || undefined,
    type: raw.Type || undefined,
    createdAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

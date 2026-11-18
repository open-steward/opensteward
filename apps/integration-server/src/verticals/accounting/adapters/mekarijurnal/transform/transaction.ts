import type { Transaction } from '../../../schema/transaction'

export interface MekariJurnalTransaction {
  id: number
  transaction_date: string
  description: string | null
  amount: number
  currency_code: string | null
  [key: string]: unknown
}

export function transformTransaction(raw: MekariJurnalTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount,
    createdAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

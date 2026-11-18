import type { Transaction } from '../../../schema/transaction'

export interface PennylaneTransaction {
  id: string
  date: string
  label: string
  currency: string
  amount: number
  [key: string]: unknown
}

export function transformTransaction(raw: PennylaneTransaction): Transaction {
  return {
    id: raw.id,
    memo: raw.label || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

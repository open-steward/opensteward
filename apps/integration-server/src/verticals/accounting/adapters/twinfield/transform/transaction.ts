import type { Transaction } from '../../../schema/transaction'

export interface TwinfieldTransaction {
  code: string
  number: string
  date: string
  currency: string
  value: number
  dim1: string
  regime: string
  origin: string
  [key: string]: unknown
}

export function transformTransaction(raw: TwinfieldTransaction): Transaction {
  return {
    id: raw.code,
    accountId: raw.dim1 || undefined,
    type: raw.regime || undefined,
    reference: raw.number || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.value,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

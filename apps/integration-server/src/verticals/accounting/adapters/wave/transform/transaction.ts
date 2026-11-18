import type { Transaction } from '../../../schema/transaction'

export interface WaveTransaction {
  id: string
  accountId: string
  description: string
  amount: number
  currency: { code: string } | null
  date: string
  type: string
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

export function transformTransaction(raw: WaveTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.accountId || undefined,
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.amount,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.modifiedAt ? new Date(raw.modifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

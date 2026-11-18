import type { Transaction } from '../../../schema/transaction'

export interface ProcountorTransaction {
  id: number
  accountNumber: string
  transactionType: string
  currency: string
  amount: number
  date: string
  [key: string]: unknown
}

export function transformTransaction(raw: ProcountorTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.accountNumber ? String(raw.accountNumber) : undefined,
    type: raw.transactionType || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

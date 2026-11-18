import type { Transaction } from '../../../schema/transaction'

export interface BCBankTransaction {
  id: string
  bankAccountId: string
  bankAccountNumber?: string
  transactionDate: string
  amount: number
  description?: string
  comment?: string
  documentNumber?: string
  statementLineNo?: number
  [key: string]: unknown
}

export function transformTransaction(raw: BCBankTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.bankAccountId || undefined,
    memo: raw.description || raw.comment || undefined,
    reference: raw.documentNumber || undefined,
    totalAmount: raw.amount,
    createdAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

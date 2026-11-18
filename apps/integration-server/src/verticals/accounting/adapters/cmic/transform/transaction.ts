import type { Transaction } from '../../../schema/transaction'

export interface CmicTransaction {
  TransactionId: string
  Description: string
  Amount: number
  Currency: string
  TransactionDate: string
  AccountCode: string
  ProjectCode: string
  CostCode: string
  [key: string]: unknown
}

export function transformTransaction(raw: CmicTransaction): Transaction {
  return {
    id: String(raw.TransactionId),
    memo: raw.Description || undefined,
    totalAmount: raw.Amount,
    currency: raw.Currency || undefined,
    accountId: raw.AccountCode || undefined,
    createdAt: raw.TransactionDate ? new Date(raw.TransactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Transaction } from '../../../schema/transaction'

export interface NetvisorTransaction {
  NetvisorKey: number
  AccountNumber: string
  TransactionType: string
  Currency: string
  Amount: number
  TransactionDate: string
  [key: string]: unknown
}

export function transformTransaction(raw: NetvisorTransaction): Transaction {
  return {
    id: String(raw.NetvisorKey),
    accountId: raw.AccountNumber ? String(raw.AccountNumber) : undefined,
    type: raw.TransactionType || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    createdAt: raw.TransactionDate ? new Date(raw.TransactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

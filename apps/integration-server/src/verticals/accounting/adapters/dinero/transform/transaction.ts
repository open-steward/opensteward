import type { Transaction } from '../../../schema/transaction'

export interface DineroTransaction {
  Guid: string
  AccountNumber: number
  Type: string
  Currency: string
  Amount: number
  EntryDate: string
  [key: string]: unknown
}

export function transformTransaction(raw: DineroTransaction): Transaction {
  return {
    id: raw.Guid,
    accountId: raw.AccountNumber ? String(raw.AccountNumber) : undefined,
    type: raw.Type || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    createdAt: raw.EntryDate ? new Date(raw.EntryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Transaction } from '../../../schema/transaction'

export interface ExactBankTransaction {
  ID?: string
  BankAccount?: string
  Date?: string
  Amount?: number
  Description?: string
  Currency?: string
  [key: string]: unknown
}

export function transformTransaction(raw: ExactBankTransaction): Transaction {
  return {
    id: raw.ID || undefined,
    accountId: raw.BankAccount || undefined,
    memo: raw.Description || undefined,
    totalAmount: raw.Amount,
    currency: raw.Currency || undefined,
    createdAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Transaction } from '../../../schema/transaction'

export interface IdokladTransaction {
  Id: string | number
  DateOfTransaction?: string
  TotalAmount?: number
  CurrencyId?: string
  Description?: string
  TransactionType?: string
  AccountId?: string
  VatAmount?: number
  [key: string]: unknown
}

export function transformTransaction(raw: IdokladTransaction): Transaction {
  return {
    id: String(raw.Id),
    accountId: raw.AccountId ? String(raw.AccountId) : undefined,
    type: raw.TransactionType || undefined,
    memo: raw.Description || undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.VatAmount,
    createdAt: raw.DateOfTransaction ? new Date(raw.DateOfTransaction) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

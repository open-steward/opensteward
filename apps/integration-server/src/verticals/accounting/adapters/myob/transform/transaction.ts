import type { Transaction } from '../../../schema/transaction'

export interface MyobBankTransaction {
  UID?: string
  Date?: string
  TotalAmount?: number
  Account?: { UID?: string }
  Memo?: string
  [key: string]: unknown
}

export function transformTransaction(raw: MyobBankTransaction): Transaction {
  return {
    id: raw.UID || undefined,
    accountId: raw.Account?.UID || undefined,
    memo: raw.Memo || undefined,
    totalAmount: raw.TotalAmount,
    createdAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

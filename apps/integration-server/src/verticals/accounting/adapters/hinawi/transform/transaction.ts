import type { Transaction } from '../../../schema/transaction'

export interface HinawiTransaction {
  id: string | number
  Date: string
  Amount: number
  Currency: string
  Type: string
  Description: string
  Status: string
  AccountId: string | number
  ContactId: string | number
  [key: string]: unknown
}

export function transformTransaction(raw: HinawiTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.AccountId ? String(raw.AccountId) : undefined,
    type: raw.Type || undefined,
    memo: raw.Description || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    contacts: raw.ContactId
      ? [{ id: String(raw.ContactId) }]
      : undefined,
    createdAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

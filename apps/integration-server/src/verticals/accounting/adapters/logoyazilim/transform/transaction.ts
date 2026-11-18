import type { Transaction } from '../../../schema/transaction'

export interface LogoTransaction {
  id: string
  Date?: string
  Description?: string
  Amount?: number
  CurrencyCode?: string
  AccountId?: string
  [key: string]: unknown
}

export function transformTransaction(raw: LogoTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.AccountId ? String(raw.AccountId) : undefined,
    memo: raw.Description || undefined,
    totalAmount: raw.Amount,
    currency: raw.CurrencyCode || undefined,
    createdAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Transaction } from '../../../schema/transaction'

export interface BusyTransaction {
  VoucherNo: string
  Date: string
  Amount: number
  CurrencyCode: string
  Type: string
  Description: string
  Status: string
  [key: string]: unknown
}

export function transformTransaction(raw: BusyTransaction): Transaction {
  return {
    id: String(raw.VoucherNo),
    type: raw.Type || undefined,
    memo: raw.Description || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.Amount,
    createdAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

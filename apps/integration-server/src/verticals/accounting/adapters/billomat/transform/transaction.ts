import type { Transaction } from '../../../schema/transaction'

export interface BillomatTransaction {
  id: string
  invoice_id: string
  date: string
  amount: number
  currency_code: string
  type: string
  comment: string
  [key: string]: unknown
}

export function transformTransaction(raw: BillomatTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.invoice_id || undefined,
    type: raw.type || undefined,
    reference: raw.comment || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

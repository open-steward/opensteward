import type { Transaction } from '../../../schema/transaction'

export interface ICountPayment {
  payment_id: string
  date: string
  sum: number
  currency_code?: string
  description?: string
  client_id?: string
  [key: string]: unknown
}

export function transformTransaction(raw: ICountPayment): Transaction {
  return {
    id: raw.payment_id,
    totalAmount: raw.sum,
    currency: raw.currency_code || undefined,
    memo: raw.description as string | undefined,
    contacts: raw.client_id ? [{ id: raw.client_id }] : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

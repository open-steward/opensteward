import type { Transaction } from '../../../schema/transaction'

export interface MaxioTransaction {
  id: number
  transaction_type: string
  memo: string
  amount_in_cents: number
  currency: string
  created_at: string
  subscription_id: number | null
  customer_id: number | null
  [key: string]: unknown
}

export function transformTransaction(raw: MaxioTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.memo || undefined,
    // Maxio amounts are in cents — divide by 100
    totalAmount: typeof raw.amount_in_cents === 'number' ? raw.amount_in_cents / 100 : 0,
    currency: raw.currency || undefined,
    contacts: raw.customer_id ? [{ id: String(raw.customer_id) }] : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

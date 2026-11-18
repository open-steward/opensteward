import type { Expense } from '../../../schema/expense'

export interface MaxioExpense {
  id: number
  memo: string
  amount_in_cents: number
  currency: string
  created_at: string
  category: string
  [key: string]: unknown
}

export function transformExpense(raw: MaxioExpense): Expense {
  return {
    id: String(raw.id),
    // Maxio amounts in cents — divide by 100
    totalAmount: typeof raw.amount_in_cents === 'number' ? raw.amount_in_cents / 100 : 0,
    currency: raw.currency || undefined,
    name: raw.memo || undefined,
    postedAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

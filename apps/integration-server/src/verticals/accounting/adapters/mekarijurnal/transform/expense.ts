import type { Expense } from '../../../schema/expense'

export interface MekariJurnalExpense {
  id: number
  date: string
  description: string | null
  amount: number
  currency_code: string | null
  account_id: number | string | null
  [key: string]: unknown
}

export function transformExpense(raw: MekariJurnalExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    accountId: raw.account_id != null ? String(raw.account_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

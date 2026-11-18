import type { Expense } from '../../../schema/expense'

export interface SilverfinExpense {
  id: string | number
  period: string
  description: string
  value: number
  contact_id: string | number
  [key: string]: unknown
}

export function transformExpense(raw: SilverfinExpense): Expense {
  return {
    id: String(raw.id),
    totalAmount: raw.value,
    name: raw.description || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    postedAt: raw.period ? new Date(raw.period) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

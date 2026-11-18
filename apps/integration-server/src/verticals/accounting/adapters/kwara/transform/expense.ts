import type { Expense } from '../../../schema/expense'

export interface KwaraExpense {
  id: string
  [key: string]: unknown
}

export function transformExpense(raw: KwaraExpense): Expense {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Expense } from '../../../schema/expense'

export interface SageExpense {
  id: string
  [key: string]: unknown
}

export function transformExpense(raw: SageExpense): Expense {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}

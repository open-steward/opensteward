import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

export interface MoloniExpense {
  expense_id: number
  date: string
  description: string
  value: number
  [key: string]: unknown
}

export function transformExpense(raw: MoloniExpense): Expense {
  return {
    id: String(raw.expense_id),
    name: raw.description || undefined,
    totalAmount: toMinorUnits(raw.value),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

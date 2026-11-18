import type { Expense } from '../../../schema/expense'

export interface UnimicroExpense {
  ID?: number
  StatusCode?: number
  Description?: string
  JournalDate?: string
  EmployeeID?: number
  Amount?: number
  [key: string]: unknown
}

export function transformExpense(raw: UnimicroExpense): Expense {
  return {
    id: String(raw.ID ?? ''),
    name: raw.Description || undefined,
    userId: raw.EmployeeID !== undefined ? String(raw.EmployeeID) : undefined,
    totalAmount: raw.Amount,
    postedAt: raw.JournalDate ? new Date(raw.JournalDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

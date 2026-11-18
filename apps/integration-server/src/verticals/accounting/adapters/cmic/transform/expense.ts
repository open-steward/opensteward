import type { Expense } from '../../../schema/expense'

export interface CmicExpense {
  ExpenseId: string
  Description: string
  Amount: number
  Currency: string
  ExpenseDate: string
  ProjectCode: string
  CostCode: string
  EmployeeId: string
  [key: string]: unknown
}

export function transformExpense(raw: CmicExpense): Expense {
  return {
    id: String(raw.ExpenseId),
    totalAmount: raw.Amount,
    currency: raw.Currency || undefined,
    name: raw.Description || undefined,
    postedAt: raw.ExpenseDate ? new Date(raw.ExpenseDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

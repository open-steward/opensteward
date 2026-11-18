import type { Expense } from '../../../schema/expense'

export interface AcumaticaExpense {
  RefNbr: string
  ExpenseDate: string
  Description: string
  CuryTotalAmt: number
  CuryID: string
  EmployeeID: string
  Status: string
  [key: string]: unknown
}

export function transformExpense(raw: AcumaticaExpense): Expense {
  return {
    id: raw.RefNbr,
    totalAmount: raw.CuryTotalAmt,
    currency: raw.CuryID || undefined,
    name: raw.Description || undefined,
    postedAt: raw.ExpenseDate ? new Date(raw.ExpenseDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

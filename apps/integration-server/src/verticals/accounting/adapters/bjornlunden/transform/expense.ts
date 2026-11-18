import type { Expense } from '../../../schema/expense'

export interface BlExpense {
  Id: string
  Description: string
  SupplierId: string
  Currency: string
  TotalAmount: number
  VatAmount: number
  ExpenseDate: string
  [key: string]: unknown
}

export function transformExpense(raw: BlExpense): Expense {
  return {
    id: raw.Id,
    name: raw.Description || undefined,
    contactId: raw.SupplierId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.VatAmount || undefined,
    postedAt: raw.ExpenseDate ? new Date(raw.ExpenseDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

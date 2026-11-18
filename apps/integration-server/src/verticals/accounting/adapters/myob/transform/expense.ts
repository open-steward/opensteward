import type { Expense } from '../../../schema/expense'

export interface MyobExpense {
  UID?: string
  Number?: string
  Supplier?: { UID?: string }
  Date?: string
  TotalAmount?: number
  TotalTax?: number
  [key: string]: unknown
}

export function transformExpense(raw: MyobExpense): Expense {
  return {
    id: raw.UID || undefined,
    contactId: raw.Supplier?.UID || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.TotalTax,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

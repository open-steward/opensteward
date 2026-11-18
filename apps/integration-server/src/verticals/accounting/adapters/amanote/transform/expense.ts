import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface AmanoteExpenseItem {
  description?: string
  quantity?: number
  unit_price?: number
  tax?: number
  total?: number
  [key: string]: unknown
}

export interface AmanoteExpense {
  id: string | number
  date?: string
  total?: number
  tax?: number
  employee_id?: string | number
  items?: AmanoteExpenseItem[]
  [key: string]: unknown
}

export function transformExpense(raw: AmanoteExpense): Expense {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    taxAmount: item.tax,
    totalAmount: item.total,
    metadata: item as Record<string, unknown>,
  }))

  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    userId: raw.employee_id !== undefined ? String(raw.employee_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

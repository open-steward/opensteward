import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface FinancioExpenseItem {
  id: string | number
  description: string
  qty: number
  unit_price: number
  amount: number
  tax_amount: number
  account_code: string
  [key: string]: unknown
}

export interface FinancioExpense {
  id: string | number
  reference: string
  date: string
  total: number
  tax_total: number
  status: string
  employee_id: string | number
  items: FinancioExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(item: FinancioExpenseItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformExpense(raw: FinancioExpense): Expense {
  return {
    id: String(raw.id),
    userId: raw.employee_id ? String(raw.employee_id) : undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_total || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

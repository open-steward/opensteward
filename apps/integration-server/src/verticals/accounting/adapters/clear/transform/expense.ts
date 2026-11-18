import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ClearExpenseLineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  tax_amount: number
  total_amount: number
  account_id: string
  [key: string]: unknown
}

export interface ClearExpense {
  id: string
  expense_number: string
  date: string
  total_amount: number
  tax_amount: number
  status: string
  employee_id: string
  description: string
  line_items: ClearExpenseLineItem[]
  [key: string]: unknown
}

function mapLineitem(item: ClearExpenseLineItem): Lineitem {
  return {
    id: item.id,
    accountId: item.account_id || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.total_amount,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformExpense(raw: ClearExpense): Expense {
  return {
    id: raw.id,
    name: raw.expense_number || undefined,
    userId: raw.employee_id || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

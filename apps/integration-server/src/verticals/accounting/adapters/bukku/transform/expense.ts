import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface BukkuExpenseLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  account_id: string | number
  account_code: string
  [key: string]: unknown
}

export interface BukkuExpense {
  id: string | number
  number: string
  date: string
  total: number
  tax_total: number
  status: string
  employee_id: string | number
  line_items: BukkuExpenseLineItem[]
  [key: string]: unknown
}

function mapLineitem(item: BukkuExpenseLineItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id ? String(item.account_id) : undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformExpense(raw: BukkuExpense): Expense {
  return {
    id: String(raw.id),
    userId: raw.employee_id ? String(raw.employee_id) : undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_total || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

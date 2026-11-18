import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ReckonExpenseLineItem {
  id: string
  description: string
  quantity: number
  unitAmount: number
  amount: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface ReckonExpense {
  id: string
  date: string
  totalAmount: number
  taxAmount: number
  status: string
  employeeId: string
  description: string
  lineItems: ReckonExpenseLineItem[]
  [key: string]: unknown
}

function mapLineitem(item: ReckonExpenseLineItem): Lineitem {
  return {
    id: item.id || undefined,
    accountId: item.accountId || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unitAmount,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.taxAmount || undefined,
  }
}

export function transformExpense(raw: ReckonExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    userId: raw.employeeId || undefined,
    taxAmount: raw.taxAmount || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lineItems ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

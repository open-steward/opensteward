import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface DeskeraExpenseItem {
  id?: string
  description?: string
  amount?: number
  taxAmount?: number
  accountCode?: string
  [key: string]: unknown
}

export interface DeskeraExpense {
  id: string
  expenseCode?: string
  expenseDate?: string
  totalAmount?: number
  taxAmount?: number
  status?: string
  contactCode?: string
  description?: string
  expenseItems?: DeskeraExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(item: DeskeraExpenseItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    accountId: item.accountCode || undefined,
    itemDescription: item.description || undefined,
    totalAmount: item.amount ?? 0,
    taxAmount: item.taxAmount || undefined,
  }
}

export function transformExpense(raw: DeskeraExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || raw.expenseCode || undefined,
    contactId: raw.contactCode || undefined,
    taxAmount: raw.taxAmount || undefined,
    totalAmount: raw.totalAmount ?? 0,
    lineItems: (raw.expenseItems ?? []).map(mapLineitem),
    postedAt: raw.expenseDate ? new Date(raw.expenseDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

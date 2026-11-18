import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface SiigoExpenseItem {
  id: number
  accountId: number
  description: string
  total: number
  taxAmount: number
  [key: string]: unknown
}

export interface SiigoExpense {
  id: number
  name: string
  supplierId: number
  total: number
  taxTotal: number
  currency: string
  date: string
  items: SiigoExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(row: SiigoExpenseItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId ? String(row.accountId) : undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.total,
    taxAmount: row.taxAmount || undefined,
  }
}

export function transformExpense(raw: SiigoExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.taxTotal || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    supplierId: expense.contactId ? Number(expense.contactId) : undefined,
    name: expense.name,
    currency: expense.currency,
    date: toCalendarDate(expense.postedAt),
    items: expense.lineItems?.map((li) => ({
      accountId: li.accountId ? Number(li.accountId) : undefined,
      description: li.itemDescription,
      total: li.totalAmount,
    })),
  }
}

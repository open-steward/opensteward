import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface AlegraExpenseItem {
  id: number
  accountId: number
  description: string
  total: number
  tax: number
  [key: string]: unknown
}

export interface AlegraExpense {
  id: number
  name: string
  providerId: number
  total: number
  totalTax: number
  currency: string
  date: string
  items: AlegraExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(row: AlegraExpenseItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId ? String(row.accountId) : undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
  }
}

export function transformExpense(raw: AlegraExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    contactId: raw.providerId ? String(raw.providerId) : undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.totalTax || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    providerId: expense.contactId ? Number(expense.contactId) : undefined,
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

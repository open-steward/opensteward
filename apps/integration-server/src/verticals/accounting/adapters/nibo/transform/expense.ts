import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface NiboExpenseItem {
  itemId: number
  accountCode: string
  description: string
  totalValue: number
  taxValue: number
  [key: string]: unknown
}

export interface NiboExpense {
  expenseId: number
  description: string
  supplierId: number
  totalValue: number
  taxValue: number
  currencyCode: string
  issueDate: string
  items: NiboExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(row: NiboExpenseItem): Lineitem {
  return {
    id: String(row.itemId),
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.totalValue,
    taxAmount: row.taxValue || undefined,
  }
}

export function transformExpense(raw: NiboExpense): Expense {
  return {
    id: String(raw.expenseId),
    name: raw.description || undefined,
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currencyCode || undefined,
    taxAmount: raw.taxValue || undefined,
    totalAmount: raw.totalValue,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    supplierId: expense.contactId ? Number(expense.contactId) : undefined,
    description: expense.name,
    currencyCode: expense.currency,
    issueDate: toCalendarDate(expense.postedAt),
    items: expense.lineItems?.map((li) => ({
      accountCode: li.accountId,
      description: li.itemDescription,
      totalValue: li.totalAmount,
    })),
  }
}

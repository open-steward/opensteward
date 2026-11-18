import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ContaAzulExpenseItem {
  id: string
  account_id: string
  description: string
  total: number
  tax_amount: number
  [key: string]: unknown
}

export interface ContaAzulExpense {
  id: string
  name: string
  supplier_id: string
  total: number
  tax_total: number
  currency: string
  issue_date: string
  items: ContaAzulExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(row: ContaAzulExpenseItem): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.total,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformExpense(raw: ContaAzulExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_total || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    supplier_id: expense.contactId,
    name: expense.name,
    currency: expense.currency,
    issue_date: toCalendarDate(expense.postedAt),
    items: expense.lineItems?.map((li) => ({
      account_id: li.accountId,
      description: li.itemDescription,
      total: li.totalAmount,
    })),
  }
}

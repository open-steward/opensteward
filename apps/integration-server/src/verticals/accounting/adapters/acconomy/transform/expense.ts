import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface AcconomyExpenseLine {
  description?: string
  amount?: number
  tax?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface AcconomyExpense {
  id: number | string
  date?: string
  description?: string
  total?: number
  tax?: number
  currency?: string
  contact_id?: number | string
  category?: string
  state?: string
  lines?: AcconomyExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: AcconomyExpenseLine): Lineitem {
  return {
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    totalAmount: line.amount,
    taxAmount: line.tax || undefined,
  }
}

export function transformExpense(raw: AcconomyExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

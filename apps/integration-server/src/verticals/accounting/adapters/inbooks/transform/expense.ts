import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface InbooksExpenseLine {
  id?: number | string
  description?: string
  amount?: number
  tax_amount?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface InbooksExpense {
  id: number | string
  description?: string
  date?: string
  currency?: string
  total_amount?: number
  tax_amount?: number
  status?: string
  lines?: InbooksExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: InbooksExpenseLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    totalAmount: line.amount,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformExpense(raw: InbooksExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

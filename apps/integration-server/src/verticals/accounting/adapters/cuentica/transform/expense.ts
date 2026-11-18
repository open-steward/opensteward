import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface CuenticaExpenseRow {
  id: number
  description: string
  account: string
  total: number
  tax: number
  [key: string]: unknown
}

export interface CuenticaExpense {
  id: string
  description: string
  contact_id: string
  currency: string
  total: number
  tax: number
  date: string
  lines: CuenticaExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: CuenticaExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
  }
}

export function transformExpense(raw: CuenticaExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

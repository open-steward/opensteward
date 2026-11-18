import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface BluenextExpenseLine {
  id: string
  accountCode: string
  description: string
  totalAmount: number
  vatAmount: number
  [key: string]: unknown
}

export interface BluenextExpense {
  id: string
  description: string
  supplierId: string
  currency: string
  vatAmount: number
  totalAmount: number
  date: string
  lines?: BluenextExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(row: BluenextExpenseLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.totalAmount,
    taxAmount: row.vatAmount || undefined,
  }
}

export function transformExpense(raw: BluenextExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.vatAmount || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

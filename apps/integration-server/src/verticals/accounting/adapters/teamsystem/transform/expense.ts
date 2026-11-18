import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface TeamSystemExpenseLine {
  id: string
  accountCode: string
  description: string
  totalAmount: number
  taxAmount: number
  [key: string]: unknown
}

export interface TeamSystemExpense {
  id: string
  description: string
  supplierId: string
  currency: string
  taxAmount: number
  totalAmount: number
  date: string
  lines?: TeamSystemExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(row: TeamSystemExpenseLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.totalAmount,
    taxAmount: row.taxAmount || undefined,
  }
}

export function transformExpense(raw: TeamSystemExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.taxAmount || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

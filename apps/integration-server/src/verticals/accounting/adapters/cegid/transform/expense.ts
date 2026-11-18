import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface CegidExpenseRow {
  id: number
  accountId: string
  description: string
  netAmount: number
  taxAmount: number
  [key: string]: unknown
}

export interface CegidExpense {
  id: string
  name: string
  supplierId: string
  netAmount: number
  taxAmount: number
  grossAmount: number
  currency: string
  documentDate: string
  lines: CegidExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: CegidExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.netAmount,
    taxAmount: row.taxAmount || undefined,
  }
}

export function transformExpense(raw: CegidExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.taxAmount || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

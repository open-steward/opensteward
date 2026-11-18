import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface BillinExpenseRow {
  id: number
  description: string
  account: string
  total: number
  tax_amount: number
  [key: string]: unknown
}

export interface BillinExpense {
  id: string
  description: string
  supplier_id: string
  currency: string
  total: number
  tax_amount: number
  issue_date: string
  lines: BillinExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: BillinExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.total,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformExpense(raw: BillinExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

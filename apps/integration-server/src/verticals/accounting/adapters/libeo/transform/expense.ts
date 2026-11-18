import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface LibeoExpenseRow {
  id: number
  account_id: string
  label: string
  net_amount: number
  vat_amount: number
  [key: string]: unknown
}

export interface LibeoExpense {
  id: string
  label: string
  supplier_id: string
  net_amount: number
  vat_amount: number
  total_amount: number
  currency: string
  date: string
  lines: LibeoExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: LibeoExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.label || undefined,
    totalAmount: row.net_amount,
    taxAmount: row.vat_amount || undefined,
  }
}

export function transformExpense(raw: LibeoExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.label || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.vat_amount || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

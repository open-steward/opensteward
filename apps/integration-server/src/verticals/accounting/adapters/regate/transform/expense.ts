import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface RegateExpenseRow {
  id: number
  account_id: string
  description: string
  amount_excluding_tax: number
  tax_amount: number
  [key: string]: unknown
}

export interface RegateExpense {
  id: string
  name: string
  supplier_id: string
  amount_excluding_tax: number
  tax_amount: number
  total_amount: number
  currency: string
  date: string
  lines: RegateExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: RegateExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.amount_excluding_tax,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformExpense(raw: RegateExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

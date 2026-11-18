import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface SinaoExpenseRow {
  id: number
  account_id: string
  description: string
  amount_excl_tax: number
  tax_amount: number
  [key: string]: unknown
}

export interface SinaoExpense {
  id: string
  name: string
  supplier_id: string
  amount_excl_tax: number
  tax_amount: number
  amount_incl_tax: number
  currency: string
  date: string
  lines: SinaoExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: SinaoExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.amount_excl_tax,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformExpense(raw: SinaoExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.amount_incl_tax,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

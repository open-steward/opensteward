import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface EvolizExpenseRow {
  id: number
  account_code: string
  designation: string
  total_without_taxes: number
  total_taxes: number
  [key: string]: unknown
}

export interface EvolizExpense {
  id: string
  label: string
  supplier_id: string
  total_without_taxes: number
  total_taxes: number
  total_with_taxes: number
  currency: string
  date: string
  items: EvolizExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: EvolizExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.designation || undefined,
    totalAmount: row.total_without_taxes,
    taxAmount: row.total_taxes || undefined,
  }
}

export function transformExpense(raw: EvolizExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.label || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.total_taxes || undefined,
    totalAmount: raw.total_with_taxes,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface FacturadirectaExpenseRow {
  id: number
  description: string
  account_id: string
  total: number
  tax_amount: number
  [key: string]: unknown
}

export interface FacturadirectaExpense {
  id: string
  description: string
  supplier_id: string
  currency: string
  total_amount: number
  tax_amount: number
  document_date: string
  lines: FacturadirectaExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: FacturadirectaExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.total,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformExpense(raw: FacturadirectaExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.document_date ? new Date(raw.document_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

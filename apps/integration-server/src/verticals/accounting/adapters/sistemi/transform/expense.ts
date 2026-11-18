import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface SistemiExpenseLine {
  id: string
  account_code: string
  description: string
  total_amount: number
  vat_amount: number
  [key: string]: unknown
}

export interface SistemiExpense {
  id: string
  description: string
  supplier_id: string
  currency: string
  vat_amount: number
  gross_amount: number
  date: string
  lines?: SistemiExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(row: SistemiExpenseLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.total_amount,
    taxAmount: row.vat_amount || undefined,
  }
}

export function transformExpense(raw: SistemiExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.vat_amount || undefined,
    totalAmount: raw.gross_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface QuipuExpenseRow {
  id: number
  concept: string
  account_id: string
  total_amount: number
  taxes_amounts: number
  [key: string]: unknown
}

export interface QuipuExpense {
  id: string
  description: string
  contact_id: string
  currency: string
  total_amount: number
  taxes_amounts: number
  issued_at: string
  items: QuipuExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: QuipuExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.concept || undefined,
    totalAmount: row.total_amount,
    taxAmount: row.taxes_amounts || undefined,
  }
}

export function transformExpense(raw: QuipuExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.taxes_amounts || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

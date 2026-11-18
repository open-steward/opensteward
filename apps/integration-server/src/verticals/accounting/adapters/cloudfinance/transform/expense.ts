import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface CloudFinanceExpenseLine {
  id: string
  account_code: string
  description: string
  total_amount: number
  vat_amount: number
  [key: string]: unknown
}

export interface CloudFinanceExpense {
  id: string
  description: string
  supplier_id: string
  currency: string
  vat_amount: number
  total_amount: number
  date: string
  lines?: CloudFinanceExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(row: CloudFinanceExpenseLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.total_amount,
    taxAmount: row.vat_amount || undefined,
  }
}

export function transformExpense(raw: CloudFinanceExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.vat_amount || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

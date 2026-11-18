import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface MazeedOneExpenseLine {
  id: string | number
  description: string
  qty: number
  unit_price: number
  total: number
  vat_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface MazeedOneExpense {
  id: string | number
  date: string
  total: number
  vat_amount: number
  currency: string
  account_id: string | number
  contact_id: string | number
  description: string
  lines: MazeedOneExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: MazeedOneExpenseLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.qty,
    totalAmount: line.total,
    taxAmount: line.vat_amount || undefined,
  }
}

export function transformExpense(raw: MazeedOneExpense): Expense {
  return {
    id: String(raw.id),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

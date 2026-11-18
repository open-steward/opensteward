import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface WintExpenseLine {
  id?: number | string
  text?: string
  amount?: number
  vat_amount?: number
  account?: string | number
  [key: string]: unknown
}

export interface WintExpense {
  id: number | string
  description?: string
  employee_id?: number | string
  date?: string
  currency?: string
  gross?: number
  vat?: number
  status?: string
  lines?: WintExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: WintExpenseLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    accountId: line.account != null ? String(line.account) : undefined,
    itemDescription: line.text || undefined,
    totalAmount: line.amount,
    taxAmount: line.vat_amount || undefined,
  }
}

export function transformExpense(raw: WintExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    taxAmount: raw.vat || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

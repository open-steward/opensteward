import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface WrebitExpenseLine {
  id?: number | string
  description?: string
  total?: number
  vat?: number
  account?: string | number
  [key: string]: unknown
}

export interface WrebitExpense {
  id: number | string
  description?: string
  date?: string
  currency?: string
  gross_amount?: number
  vat_amount?: number
  status?: string
  lines?: WrebitExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: WrebitExpenseLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account !== undefined ? String(line.account) : undefined,
    itemDescription: line.description || undefined,
    totalAmount: line.total,
    taxAmount: line.vat || undefined,
  }
}

export function transformExpense(raw: WrebitExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    taxAmount: raw.vat_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

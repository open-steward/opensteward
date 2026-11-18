import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface PromikBookExpenseLine {
  id?: number | string
  description?: string
  amount?: number
  vat?: number
  account_no?: string | number
  [key: string]: unknown
}

export interface PromikBookExpense {
  id: number | string
  description?: string
  date?: string
  currency?: string
  amount_incl_vat?: number
  vat_amount?: number
  status?: string
  lines?: PromikBookExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: PromikBookExpenseLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_no !== undefined ? String(line.account_no) : undefined,
    itemDescription: line.description || undefined,
    totalAmount: line.amount,
    taxAmount: line.vat || undefined,
  }
}

export function transformExpense(raw: PromikBookExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_incl_vat,
    taxAmount: raw.vat_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

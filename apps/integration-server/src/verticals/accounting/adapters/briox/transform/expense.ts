import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface BrioxExpenseLine {
  id?: number | string
  description?: string
  amount?: number
  vat_amount?: number
  account_number?: string | number
  [key: string]: unknown
}

export interface BrioxExpense {
  id: number | string
  description?: string
  employee_id?: number | string
  date?: string
  currency?: string
  total?: number
  vat_amount?: number
  status?: string
  lines?: BrioxExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: BrioxExpenseLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    accountId: line.account_number != null ? String(line.account_number) : undefined,
    itemDescription: line.description || undefined,
    totalAmount: line.amount,
    taxAmount: line.vat_amount || undefined,
  }
}

export function transformExpense(raw: BrioxExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

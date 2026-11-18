import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface FAExpenseLine {
  id?: number | string
  account?: string
  memo?: string
  amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface FAExpense {
  id?: number | string
  reference?: string
  tran_date?: string
  total?: number
  memo?: string
  lines?: FAExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: FAExpenseLine): Lineitem {
  return {
    accountId: line.account || undefined,
    itemDescription: line.memo || undefined,
    totalAmount: line.amount ?? 0,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformExpense(raw: FAExpense): Expense {
  return {
    id: raw.id !== undefined ? String(raw.id) : '',
    name: raw.reference || raw.memo || String(raw.id),
    totalAmount: raw.total ?? 0,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.tran_date ? new Date(raw.tran_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

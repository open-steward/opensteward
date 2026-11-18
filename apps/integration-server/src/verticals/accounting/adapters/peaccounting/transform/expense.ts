import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface PEAccountingExpenseLine {
  description?: string
  amount?: number
  tax_amount?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface PEAccountingExpense {
  id: number | string
  date?: string
  description?: string
  total?: number
  tax_amount?: number
  currency?: string
  contact_id?: number | string
  category?: string
  status?: string
  lines?: PEAccountingExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: PEAccountingExpenseLine): Lineitem {
  return {
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    totalAmount: line.amount,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformExpense(raw: PEAccountingExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

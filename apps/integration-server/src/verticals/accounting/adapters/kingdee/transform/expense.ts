import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface KingdeeExpenseLine {
  id?: string
  description?: string
  price?: number
  qty?: number
  amount?: number
  taxAmount?: number
  acctId?: string
  [key: string]: unknown
}

export interface KingdeeExpense {
  id?: string
  date?: string
  totalAmount?: number
  taxAmount?: number
  currency?: string
  empId?: string
  acctId?: string
  lines?: KingdeeExpenseLine[]
  [key: string]: unknown
}

export function transformExpense(raw: KingdeeExpense): Expense {
  return {
    id: raw.id ? String(raw.id) : '',
    contactId: raw.empId ? String(raw.empId) : undefined,
    accountId: raw.acctId ? String(raw.acctId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.qty,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.acctId ? String(l.acctId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}

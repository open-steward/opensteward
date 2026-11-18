import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface YonyouExpenseLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface YonyouExpense {
  id?: string
  vouchdate?: string
  ttaxmny?: number
  tax?: number
  currency?: string
  empid?: string
  accountId?: string
  lines?: YonyouExpenseLine[]
  [key: string]: unknown
}

export function transformExpense(raw: YonyouExpense): Expense {
  return {
    id: raw.id ? String(raw.id) : '',
    contactId: raw.empid ? String(raw.empid) : undefined,
    accountId: raw.accountId ? String(raw.accountId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.ttaxmny,
    taxAmount: raw.tax,
    postedAt: raw.vouchdate ? new Date(raw.vouchdate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}

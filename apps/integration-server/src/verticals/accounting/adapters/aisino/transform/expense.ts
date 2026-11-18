import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface AisinoExpenseLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  vatAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface AisinoExpense {
  id?: string
  date?: string
  total?: number
  vatTotal?: number
  currency?: string
  clientId?: string
  accountId?: string
  lines?: AisinoExpenseLine[]
  [key: string]: unknown
}

export function transformExpense(raw: AisinoExpense): Expense {
  return {
    id: raw.id ? String(raw.id) : '',
    contactId: raw.clientId ? String(raw.clientId) : undefined,
    accountId: raw.accountId ? String(raw.accountId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vatTotal,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.vatAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}

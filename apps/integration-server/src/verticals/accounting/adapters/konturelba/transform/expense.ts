import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface KonturelbaExpenseLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  vatAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface KonturelbaExpense {
  id?: string
  date?: string
  total?: number
  vatTotal?: number
  currency?: string
  counterpartyId?: string
  accountId?: string
  lines?: KonturelbaExpenseLine[]
  [key: string]: unknown
}

export function transformExpense(raw: KonturelbaExpense): Expense {
  return {
    id: raw.id ? String(raw.id) : '',
    contactId: raw.counterpartyId ? String(raw.counterpartyId) : undefined,
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

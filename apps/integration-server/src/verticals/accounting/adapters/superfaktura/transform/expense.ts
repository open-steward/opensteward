import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface SuperfakturaExpenseLine {
  id: string | number
  description?: string
  unit_price?: number
  quantity?: number
  total?: number
  tax?: number
  account_id?: string
  [key: string]: unknown
}

export interface SuperfakturaExpense {
  id: string | number
  created?: string
  total?: number
  tax?: number
  currency?: string
  client_id?: string | number
  account_id?: string
  expense_items?: SuperfakturaExpenseLine[]
  [key: string]: unknown
}

export function transformExpense(raw: SuperfakturaExpense): Expense {
  return {
    id: String(raw.id),
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    postedAt: raw.created ? new Date(raw.created) : undefined,
    lineItems: (raw.expense_items ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.description || undefined,
      unitAmount: l.unit_price,
      unitQuantity: l.quantity,
      totalAmount: l.total,
      taxAmount: l.tax,
      accountId: l.account_id ? String(l.account_id) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface PohodaExpenseLine {
  id: string | number
  text?: string
  unitPrice?: number
  quantity?: number
  amount?: number
  vatAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface PohodaExpense {
  id: string | number
  date?: string
  totalAmount?: number
  vatAmount?: number
  currency?: string
  partnerId?: string | number
  accountId?: string
  items?: PohodaExpenseLine[]
  [key: string]: unknown
}

export function transformExpense(raw: PohodaExpense): Expense {
  return {
    id: String(raw.id),
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    accountId: raw.accountId ? String(raw.accountId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.items ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.text || undefined,
      unitAmount: l.unitPrice,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.vatAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}

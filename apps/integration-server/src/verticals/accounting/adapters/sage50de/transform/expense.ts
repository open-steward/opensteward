/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface Sage50DeExpenseLineItem {
  description?: string
  quantity?: number
  unit_price?: number
  tax_amount?: number
  net_amount?: number
  [key: string]: unknown
}

export interface Sage50DeExpense {
  id: string
  date?: string
  total_amount?: number
  tax_amount?: number
  contact_id?: string
  transaction_lines?: Sage50DeExpenseLineItem[]
  [key: string]: unknown
}

export function transformExpense(raw: Sage50DeExpense): Expense {
  const lineItems: Lineitem[] = (raw.transaction_lines ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    taxAmount: item.tax_amount,
    totalAmount: item.net_amount,
    metadata: item as Record<string, unknown>,
  }))

  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    contactId: raw.contact_id,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

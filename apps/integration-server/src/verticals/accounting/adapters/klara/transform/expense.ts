/**
 * KLARA expense (Spesen) transform.
 *
 * KLARA supports expense/reimbursement tracking for SMEs.
 * Fields: id, name, account_id, contact_id, currency, payment_method,
 *         total_amount, tax_amount, expense_date
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface KlaraExpenseLine {
  id?: string
  account_id?: string
  description?: string
  unit_amount?: number
  quantity?: number
  total_amount?: number
  [key: string]: unknown
}

export interface KlaraExpense {
  id: string
  name?: string
  account_id?: string
  contact_id?: string
  currency?: string
  payment_method?: string
  total_amount?: number
  tax_amount?: number
  expense_date?: string
  created_at?: string
  updated_at?: string
  lines?: KlaraExpenseLine[]
  [key: string]: unknown
}

function mapLines(lines: KlaraExpenseLine[]): Lineitem[] {
  return lines.map((l) => ({
    id: l.id || undefined,
    accountId: l.account_id || undefined,
    itemDescription: l.description || undefined,
    unitAmount: l.unit_amount,
    unitQuantity: l.quantity != null ? Math.round(l.quantity) : undefined,
    totalAmount: l.total_amount,
  }))
}

export function transformExpense(raw: KlaraExpense): Expense {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    accountId: raw.account_id || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    paymentMethod: raw.payment_method || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    lineItems: (raw.lines ?? []).length > 0 ? mapLines(raw.lines ?? []) : undefined,
    postedAt: raw.expense_date ? new Date(raw.expense_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

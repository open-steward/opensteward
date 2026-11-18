/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface DatevExpenseLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  account_number: string
  [key: string]: unknown
}

export interface DatevExpense {
  id: string | number
  document_number: string
  booking_date: string
  total_amount: number
  tax_amount: number
  employee_id: string | number
  line_items: DatevExpenseLineItem[]
  [key: string]: unknown
}

function mapLineitem(item: DatevExpenseLineItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformExpense(raw: DatevExpense): Expense {
  return {
    id: String(raw.id),
    userId: raw.employee_id ? String(raw.employee_id) : undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.booking_date ? new Date(raw.booking_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

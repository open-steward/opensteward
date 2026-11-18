/**
 * Transform Pleo expense to canonical Expense.
 *
 * Pleo API: GET /expenses, GET /expenses/{expenseId}
 * Response fields: id, employeeId, performedAt, amountOriginal, amountSettled,
 *                  type, status, accountId, taxCodeId, tagIds, lines, createdAt, updatedAt
 *
 * Pleo amounts are objects: { value: number, currency: string }
 * `value` is in the minor units of the currency (integer cents).
 *
 * Docs: https://developers.pleo.io/docs/expense-types
 */

import type { Expense } from '../../../schema/expense'

export interface PleoAmountObject {
  value: number
  currency: string
}

export interface PleoExpenseLine {
  id?: string
  accountId?: string
  taxCodeId?: string
  description?: string
  amount?: PleoAmountObject
  [key: string]: unknown
}

export interface PleoExpense {
  id: string
  employeeId?: string
  performedAt?: string
  amountOriginal?: PleoAmountObject
  amountSettled?: PleoAmountObject
  type?: string
  status?: string
  accountId?: string
  taxCodeId?: string
  tagIds?: string[]
  lines?: PleoExpenseLine[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapLines(lines?: PleoExpenseLine[]) {
  if (!lines?.length) return undefined
  return lines.map((l) => ({
    id: l.id || undefined,
    accountId: l.accountId || undefined,
    itemDescription: l.description || undefined,
    totalAmount: l.amount?.value,
  }))
}

export function transformExpense(raw: PleoExpense): Expense {
  // Use settled amount when available, fall back to original
  const amount = raw.amountSettled ?? raw.amountOriginal
  return {
    id: raw.id,
    userId: raw.employeeId || undefined,
    accountId: raw.accountId || undefined,
    currency: amount?.currency || undefined,
    paymentMethod: raw.type || undefined,
    totalAmount: amount?.value,
    lineItems: mapLines(raw.lines),
    postedAt: raw.performedAt ? new Date(raw.performedAt) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

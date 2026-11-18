/**
 * Soldo expense report → canonical Expense.
 *
 * Endpoint: GET /business/v2/expense-reports, GET /business/v2/expense-reports/{id}
 *
 * Expense report fields:
 *   id, number, status (TO_BE_PROCESSED | PROCESSED | CANCELLED),
 *   type (EMPLOYEE | COMPANY), trxOwnerId (user who made expenses),
 *   totalAmount, currency, toReimburse, reimbursedAmount,
 *   trxDateFrom, trxDateTo, exportedDate
 */

import type { Expense } from '../../../schema/expense'

export interface SoldoExpenseReport {
  id: string
  number?: string
  status?: string
  type?: string
  trxOwnerId?: string
  totalAmount?: number
  currency?: string
  toReimburse?: boolean
  reimbursedAmount?: number
  trxDateFrom?: string
  trxDateTo?: string
  exportedDate?: string
  [key: string]: unknown
}

/**
 * Convert a Soldo major-unit decimal amount to canonical integer minor units.
 * Soldo returns amounts as decimals (e.g. 100.50 EUR). The canonical Amount
 * schema requires integer minor units (e.g. 10050 for €100.50).
 */
function toMinorUnits(amount: number | undefined | null): number | undefined {
  if (amount == null) return undefined
  return Math.round(amount * 100)
}

export function transformExpenseReport(raw: SoldoExpenseReport): Expense {
  return {
    id: raw.id,
    userId: raw.trxOwnerId ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: toMinorUnits(raw.totalAmount),
    reimbursedAmount: toMinorUnits(raw.reimbursedAmount),
    postedAt: raw.trxDateFrom ? new Date(raw.trxDateFrom) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

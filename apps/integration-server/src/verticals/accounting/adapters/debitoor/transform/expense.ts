/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Platform deprecated (Debitoor shut down).
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface DebitoorExpenseRow {
  id: string
  description: string
  accountId: string
  netAmount: number
  taxAmount: number
  [key: string]: unknown
}

export interface DebitoorExpense {
  id: string
  description: string
  supplierId: string
  currency: string
  grossAmount: number
  taxAmount: number
  date: string
  lines: DebitoorExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: DebitoorExpenseRow): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.netAmount,
    taxAmount: row.taxAmount || undefined,
  }
}

export function transformExpense(raw: DebitoorExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.taxAmount || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

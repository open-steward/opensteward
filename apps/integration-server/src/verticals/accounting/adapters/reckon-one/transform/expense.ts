/**
 * Reckon One Expense Receipts → canonical Expense.
 *
 * Endpoint: GET /R1/{cashbookId}/expenseReceipts[/{id}]
 *
 * Key fields:
 *   id, date, description, supplier.id, currency,
 *   totalAmount, taxAmount, lines[]
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ReckonOneExpenseLine {
  id?: string
  description?: string
  accountId?: string
  amount?: number
  taxAmount?: number
  [key: string]: unknown
}

export interface ReckonOneExpenseReceipt {
  id: string
  description?: string
  /** Supplier / contact */
  supplier?: { id: string; name?: string }
  contact?: { id: string; name?: string }
  /** ISO date string e.g. "2024-03-01" */
  date?: string
  currency?: string
  totalAmount?: number
  taxAmount?: number
  paymentMethod?: string
  lines?: ReckonOneExpenseLine[]
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMinorUnits(value: number | undefined | null): number | undefined {
  return value != null ? Math.round(value * 100) : undefined
}

function mapLine(l: ReckonOneExpenseLine): Lineitem {
  return {
    id: l.id || undefined,
    accountId: l.accountId || undefined,
    itemDescription: l.description || undefined,
    totalAmount: toMinorUnits(l.amount),
    taxAmount: toMinorUnits(l.taxAmount),
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformExpense(raw: ReckonOneExpenseReceipt): Expense {
  const contactId = raw.supplier?.id ?? raw.contact?.id ?? undefined
  return {
    id: raw.id,
    name: raw.description || undefined,
    contactId: contactId || undefined,
    currency: raw.currency || undefined,
    paymentMethod: raw.paymentMethod || undefined,
    totalAmount: toMinorUnits(raw.totalAmount),
    taxAmount: toMinorUnits(raw.taxAmount),
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.createdDateTime ? new Date(raw.createdDateTime) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

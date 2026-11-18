/**
 * Invoice Ninja v5 expense transforms.
 *
 * Endpoint: GET /api/v1/expenses
 * Single:   GET /api/v1/expenses/{id}
 *
 * Invoice Ninja expense records map to the canonical Expense schema.
 */

import type { Expense } from '../../../schema/expense'
import { currencyIdToIso } from '../constants'

export interface InvoiceNinjaExpense {
  id: string
  vendor_id?: string | null
  client_id?: string | null
  category_id?: string | null
  currency_id?: string | null
  amount?: number | null
  tax_amount?: number | null
  payment_date?: string | null
  date?: string | null
  public_notes?: string | null
  private_notes?: string | null
  payment_type_id?: string | null
  is_deleted?: boolean | null
  updated_at?: number | null
  created_at?: number | null
  [key: string]: unknown
}

function parseDateStr(s?: string | null): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

function parseEpoch(n?: number | null): Date | undefined {
  if (!n) return undefined
  return new Date(n * 1000)
}

export function transformExpense(raw: InvoiceNinjaExpense): Expense {
  return {
    id: raw.id,
    // Invoice Ninja expenses don't have a name field — use public_notes as fallback
    name: raw.public_notes || undefined,
    // vendor_id maps to the supplier contact; client_id to the customer
    contactId: raw.vendor_id || raw.client_id || undefined,
    currency: currencyIdToIso(raw.currency_id),
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.amount ?? undefined,
    paymentMethod: raw.payment_type_id ? String(raw.payment_type_id) : undefined,
    postedAt: parseDateStr(raw.date),
    createdAt: parseEpoch(raw.created_at),
    updatedAt: parseEpoch(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

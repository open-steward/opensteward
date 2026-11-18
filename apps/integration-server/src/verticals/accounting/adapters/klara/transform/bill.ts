/**
 * KLARA supplier-invoice (bill / Eingangsrechnung) transform.
 *
 * KLARA bill resource fields (snake_case REST API):
 *   id, bill_number, status, contact_id, currency, total_amount,
 *   tax_amount, paid_amount, balance_amount, bill_date, due_date,
 *   paid_date, notes, positions[]
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface KlaraBillPosition {
  id?: string
  article_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total_price?: number
  tax_rate_id?: string
  account_id?: string
  [key: string]: unknown
}

export interface KlaraBill {
  id: string
  bill_number?: string
  status?: string
  contact_id?: string
  currency?: string
  total_amount?: number
  tax_amount?: number
  paid_amount?: number
  balance_amount?: number
  bill_date?: string
  due_date?: string
  paid_date?: string
  notes?: string
  created_at?: string
  updated_at?: string
  positions?: KlaraBillPosition[]
  [key: string]: unknown
}

function mapStatus(raw: KlaraBill): BillStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'open':
    case 'pending':
    case 'submitted':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'partial':
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'overdue':
      return 'OVERDUE'
    case 'cancelled':
    case 'voided':
      return 'VOIDED'
    default: {
      const balance = raw.balance_amount ?? 0
      const total = raw.total_amount ?? 0
      if (balance === 0 && total > 0) return 'PAID'
      if (balance > 0 && balance < total) return 'PARTIALLY_PAID'
      if (raw.due_date && new Date(raw.due_date).getTime() < Date.now() && balance > 0)
        return 'OVERDUE'
      return 'AUTHORIZED'
    }
  }
}

function mapPositions(positions: KlaraBillPosition[]): Lineitem[] {
  return positions.map((p) => ({
    id: p.id || undefined,
    accountId: p.account_id || undefined,
    itemId: p.article_id || undefined,
    itemDescription: p.description || undefined,
    unitAmount: p.unit_price,
    unitQuantity: p.quantity != null ? Math.round(p.quantity) : undefined,
    totalAmount: p.total_price,
    taxrateId: p.tax_rate_id || undefined,
  }))
}

export function transformBill(raw: KlaraBill): Bill {
  return {
    id: raw.id || undefined,
    status: mapStatus(raw),
    billNumber: raw.bill_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    paidAmount: raw.paid_amount,
    balanceAmount: raw.balance_amount,
    notes: raw.notes || undefined,
    lineItems: (raw.positions ?? []).length > 0 ? mapPositions(raw.positions ?? []) : undefined,
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    paidAt: raw.paid_date ? new Date(raw.paid_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * LEDGERS.Cloud purchase invoice (bill) transform.
 *
 * Endpoints:
 *   GET  /v3/purchase-invoice/{id}   — view single
 *   GET  /v3/list-purchase-invoice   — paginated list
 *   POST /v3/add-purchase-invoice    — create
 *   PUT  /v3/update-purchase-invoice — update
 *
 * Wire fields: id, invoice_number (bill number), invoice_date,
 *   due_date / validity_date, contact.id / contact_id,
 *   currency, payment_status, total_amount, paid_amount,
 *   balance_amount, tax_amount, items[]
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface LedgersBillItem {
  id?: string | number
  item_id?: string | number
  name?: string
  description?: string
  unit_price?: number
  quantity?: number
  amount?: number
  tax_amount?: number
  account_id?: string | number
  [key: string]: unknown
}

export interface LedgersBill {
  id?: string | number
  invoice_number?: string
  bill_number?: string
  invoice_date?: string
  due_date?: string
  validity_date?: string
  created_at?: string
  updated_at?: string
  contact?: { id?: string | number; contact_id?: string | number }
  contact_id?: string | number
  currency?: string
  payment_status?: string       // "Paid" | "Part Paid" | "Not Paid"
  total_amount?: number
  paid_amount?: number
  balance_amount?: number
  tax_amount?: number
  discount_amount?: number
  notes?: string
  items?: LedgersBillItem[]
  [key: string]: unknown
}

function mapStatus(raw: LedgersBill): BillStatus {
  const ps = (raw.payment_status ?? '').toLowerCase()
  if (ps === 'paid') return 'PAID'
  if (ps === 'part paid' || ps === 'partially paid') return 'PARTIALLY_PAID'
  const dueStr = raw.due_date || raw.validity_date
  if (dueStr && new Date(dueStr).getTime() < Date.now()) return 'OVERDUE'
  return 'AUTHORIZED'
}

function mapLines(items: LedgersBillItem[]): Lineitem[] {
  return (items ?? []).map((it) => ({
    id: it.id != null ? String(it.id) : undefined,
    itemId: it.item_id != null ? String(it.item_id) : undefined,
    itemName: it.name || undefined,
    itemDescription: it.description || undefined,
    accountId: it.account_id != null ? String(it.account_id) : undefined,
    unitAmount: it.unit_price,
    unitQuantity: it.quantity != null ? Math.round(it.quantity) : undefined,
    taxAmount: it.tax_amount,
    totalAmount: it.amount,
  }))
}

export function transformBill(raw: LedgersBill): Bill {
  const contactId =
    raw.contact?.id ??
    raw.contact?.contact_id ??
    raw.contact_id
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapStatus(raw),
    billNumber: raw.bill_number || raw.invoice_number || undefined,
    contactId: contactId != null ? String(contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    discountAmount: raw.discount_amount,
    paidAmount: raw.paid_amount,
    balanceAmount: raw.balance_amount,
    notes: raw.notes || undefined,
    lineItems: raw.items ? mapLines(raw.items) : undefined,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date
      ? new Date(raw.due_date)
      : raw.validity_date
        ? new Date(raw.validity_date)
        : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

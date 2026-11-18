import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface QoyodBillLineItem {
  id?: number | null
  product_id?: number | null
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  tax_amount?: number | null
  total?: number | null
  account_id?: number | null
  [key: string]: unknown
}

// Qoyod bills = "Purchase Bills" (supplier invoices)
export interface QoyodBill {
  id: number
  reference?: string | null
  vendor_id?: number | null
  vendor_name?: string | null
  date?: string | null
  due_date?: string | null
  status?: string | null
  notes?: string | null
  currency?: string | null
  subtotal?: number | null
  tax_total?: number | null
  total?: number | null
  paid_amount?: number | null
  balance?: number | null
  line_items?: QoyodBillLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: QoyodBill): BillStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'draft') return 'DRAFT'
  if (s === 'approved' || s === 'issued') return 'AUTHORIZED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid' || s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'voided' || s === 'cancelled' || s === 'canceled') return 'VOIDED'
  return 'DRAFT'
}

function mapLineItem(li: QoyodBillLineItem): Lineitem {
  return {
    id: li.id != null ? String(li.id) : undefined,
    itemId: li.product_id != null ? String(li.product_id) : undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.unit_price ?? undefined,
    unitQuantity: li.quantity ?? undefined,
    totalAmount: li.total ?? undefined,
    taxAmount: li.tax_amount ?? undefined,
    accountId: li.account_id != null ? String(li.account_id) : undefined,
  }
}

export function transformBill(raw: QoyodBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.reference || String(raw.id),
    contactId: raw.vendor_id != null ? String(raw.vendor_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.tax_total ?? undefined,
    paidAmount: raw.paid_amount ?? undefined,
    balanceAmount: raw.balance ?? undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

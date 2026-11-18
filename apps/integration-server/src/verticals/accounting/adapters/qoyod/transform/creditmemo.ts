import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface QoyodCreditNoteLineItem {
  id?: number | null
  product_id?: number | null
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  tax_amount?: number | null
  total?: number | null
  discount?: number | null
  account_id?: number | null
  [key: string]: unknown
}

// Qoyod "credit_notes"
export interface QoyodCreditNote {
  id: number
  reference?: string | null
  customer_id?: number | null
  date?: string | null
  due_date?: string | null
  status?: string | null
  notes?: string | null
  currency?: string | null
  subtotal?: number | null
  tax_total?: number | null
  discount_total?: number | null
  total?: number | null
  paid_amount?: number | null
  balance?: number | null
  line_items?: QoyodCreditNoteLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: QoyodCreditNote): CreditMemoStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'draft') return 'DRAFT'
  if (s === 'approved' || s === 'issued' || s === 'sent') return 'AUTHORIZED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid' || s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'voided' || s === 'cancelled' || s === 'canceled') return 'VOIDED'
  return 'DRAFT'
}

function mapLineItem(li: QoyodCreditNoteLineItem): Lineitem {
  return {
    id: li.id != null ? String(li.id) : undefined,
    itemId: li.product_id != null ? String(li.product_id) : undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.unit_price ?? undefined,
    unitQuantity: li.quantity ?? undefined,
    totalAmount: li.total ?? undefined,
    taxAmount: li.tax_amount ?? undefined,
    discountAmount: li.discount ?? undefined,
    accountId: li.account_id != null ? String(li.account_id) : undefined,
  }
}

export function transformCreditMemo(raw: QoyodCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.reference || String(raw.id),
    contactId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.tax_total ?? undefined,
    discountAmount: raw.discount_total ?? undefined,
    paidAmount: raw.paid_amount ?? undefined,
    balanceAmount: raw.balance ?? undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

// SimplBooks credit invoice (credit note) line row
export interface SimplbooksCreditInvoiceRow {
  id: number
  product_id?: number | null
  description?: string | null
  quantity: number
  unit_price: number
  total: number
  vat_rate?: number | null
  vat_amount?: number | null
  discount?: number | null
  account_code?: string | null
  [key: string]: unknown
}

// SimplBooks credit invoice (negative/refund invoice)
export interface SimplbooksCreditInvoice {
  id: number
  number?: string | null
  client_id?: number | null
  currency?: string | null
  total?: number | null
  total_vat?: number | null
  paid?: number | null
  balance?: number | null
  status?: string | null        // 'draft' | 'sent' | 'paid' | 'cancelled'
  invoice_date?: string | null  // YYYY-MM-DD
  due_date?: string | null      // YYYY-MM-DD
  paid_date?: string | null     // YYYY-MM-DD
  notes?: string | null
  rows?: SimplbooksCreditInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(raw: SimplbooksCreditInvoice): CreditMemoStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'cancelled' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'sent') {
    const paid = raw.paid ?? 0
    const total = raw.total ?? 0
    if (paid > 0 && paid < total) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

function mapRow(row: SimplbooksCreditInvoiceRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemId: row.product_id != null ? String(row.product_id) : undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.vat_amount ?? undefined,
    discountAmount: row.discount ?? undefined,
  }
}

export function transformCreditMemo(raw: SimplbooksCreditInvoice): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.client_id != null ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.total_vat ?? undefined,
    balanceAmount: raw.balance ?? undefined,
    paidAmount: raw.paid ?? undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.rows ?? []).map(mapRow),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    paidAt: raw.paid_date ? new Date(raw.paid_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

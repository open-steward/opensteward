import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

// ── Mezan wire types ──────────────────────────────────────────────────────────

export interface MezanCreditNoteProduct {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  amount_discount?: number
  subtotal: number
  tax_subtotal?: number
  subtotal_including_tax: number
  account_id?: string
  [key: string]: unknown
}

export interface MezanCreditNote {
  id: string
  reference?: string
  status?: string             // 'draft' | 'confirmed' | 'cancelled'
  issue_date?: string         // YYYY-MM-DD
  customer_id?: string
  customer_name?: string
  currency?: string
  total?: number
  total_tax?: number
  total_discount?: number
  total_paid?: number
  balance?: number
  transaction_note?: string
  products?: MezanCreditNoteProduct[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: MezanCreditNote): CreditMemoStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'cancelled' || s === 'voided') return 'VOIDED'
  if (s === 'confirmed') {
    if (raw.balance != null && raw.balance === 0) return 'PAID'
    if (raw.balance != null && raw.total != null && raw.balance > 0 && raw.balance < raw.total) {
      return 'PARTIALLY_PAID'
    }
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

// ── Line-item mapping ─────────────────────────────────────────────────────────

function mapLineitem(p: MezanCreditNoteProduct): Lineitem {
  return {
    id: String(p.id),
    accountId: p.account_id || undefined,
    itemDescription: p.product_name || undefined,
    unitAmount: p.unit_price,
    unitQuantity: p.quantity != null ? Math.round(p.quantity) : undefined,
    discountAmount: p.amount_discount || undefined,
    taxAmount: p.tax_subtotal || undefined,
    totalAmount: p.subtotal_including_tax,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCreditMemo(raw: MezanCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.reference || String(raw.id),
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.total_tax,
    discountAmount: raw.total_discount,
    paidAmount: raw.total_paid,
    balanceAmount: raw.balance,
    notes: raw.transaction_note || undefined,
    lineItems: (raw.products ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

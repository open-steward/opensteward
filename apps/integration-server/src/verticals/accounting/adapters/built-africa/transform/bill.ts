import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

// ── Built Accounting raw types ────────────────────────────────────────────────

export interface BuiltAfricaBillItem {
  id?: number
  bill_id?: number
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface BuiltAfricaBill {
  id: number
  bill_id?: string
  supplier_id?: number
  purchase_date?: string  // YYYY-MM-DD
  due_date?: string       // YYYY-MM-DD
  gross_amount?: number
  amount_due?: number
  amount_paid?: number
  balance?: number
  paid_status?: string    // "paid" | "partial" | "unpaid" | "overdue"
  base_currency?: string
  fx_currency?: string
  note?: string
  items?: BuiltAfricaBillItem[]
  taxes?: unknown[]
  total_taxAmount?: number
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: BuiltAfricaBill): BillStatus {
  if (raw.deleted_at) return 'VOIDED'
  const s = (raw.paid_status ?? '').toLowerCase()
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  return 'AUTHORIZED'
}

// ── Line-item mapping ─────────────────────────────────────────────────────────

function mapLineitem(item: BuiltAfricaBillItem): Lineitem {
  return {
    id: item.id !== undefined ? String(item.id) : undefined,
    itemDescription: item.description || undefined,
    // Built returns decimal amounts; canonical is integer minor units
    unitAmount: toMinorUnits(item.unit_price),
    unitQuantity: item.quantity !== undefined ? Math.round(item.quantity) : undefined,
    totalAmount: toMinorUnits(item.amount),
    taxAmount: toMinorUnits(item.tax_amount),
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformBill(raw: BuiltAfricaBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.bill_id || undefined,
    // Prefix matches transformSupplier id: 'supp_<n>' — ensures contactId round-trips
    // correctly when a supplier contact is fetched via listContacts/getContact before
    // being used in a write path.
    contactId: raw.supplier_id !== undefined ? `supp_${raw.supplier_id}` : undefined,
    currency: raw.base_currency || raw.fx_currency || undefined,
    // Built returns decimal amounts; canonical is integer minor units
    totalAmount: toMinorUnits(raw.gross_amount),
    taxAmount: toMinorUnits(raw.total_taxAmount),
    paidAmount: toMinorUnits(raw.amount_paid),
    balanceAmount: toMinorUnits(raw.balance),
    notes: raw.note || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.purchase_date ? new Date(raw.purchase_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

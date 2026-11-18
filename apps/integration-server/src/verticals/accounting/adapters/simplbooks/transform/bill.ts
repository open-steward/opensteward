import type { Bill, BillStatus } from '../../../schema/bill'

// SimplBooks purchase invoice (bill / incoming invoice from supplier)
export interface SimplbooksBill {
  id: number
  number?: string | null
  supplier_id?: number | null
  currency?: string | null
  total?: number | null
  total_vat?: number | null
  paid?: number | null
  balance?: number | null
  // status: 'draft' | 'confirmed' | 'paid' | 'overdue' | 'cancelled'
  status?: string | null
  invoice_date?: string | null   // YYYY-MM-DD
  due_date?: string | null       // YYYY-MM-DD
  paid_date?: string | null      // YYYY-MM-DD
  notes?: string | null
  [key: string]: unknown
}

function mapStatus(raw: SimplbooksBill): BillStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'cancelled' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'confirmed') {
    const paid = raw.paid ?? 0
    const total = raw.total ?? 0
    if (paid > 0 && paid < total) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

export function transformBill(raw: SimplbooksBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.number || undefined,
    contactId: raw.supplier_id != null ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.total_vat ?? undefined,
    balanceAmount: raw.balance ?? undefined,
    paidAmount: raw.paid ?? undefined,
    notes: raw.notes || undefined,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    paidAt: raw.paid_date ? new Date(raw.paid_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

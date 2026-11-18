import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// SimplBooks sales invoice line row
export interface SimplbooksInvoiceRow {
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

// SimplBooks sales invoice
export interface SimplbooksInvoice {
  id: number
  number?: string | null
  client_id?: number | null
  currency?: string | null
  total?: number | null
  total_vat?: number | null
  total_without_vat?: number | null
  paid?: number | null
  balance?: number | null
  status?: string | null        // 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  invoice_date?: string | null  // YYYY-MM-DD
  due_date?: string | null      // YYYY-MM-DD
  paid_date?: string | null     // YYYY-MM-DD
  reference?: string | null
  notes?: string | null
  rows?: SimplbooksInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(raw: SimplbooksInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'cancelled' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'sent') {
    const paid = raw.paid ?? 0
    const total = raw.total ?? 0
    if (paid > 0 && paid < total) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

function mapRow(row: SimplbooksInvoiceRow): Lineitem {
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

export function transformInvoice(raw: SimplbooksInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.client_id != null ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.total_vat ?? undefined,
    balanceAmount: raw.balance ?? undefined,
    paidAmount: raw.paid ?? undefined,
    reference: raw.reference || undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.rows ?? []).map(mapRow),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    paidAt: raw.paid_date ? new Date(raw.paid_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Invoice → SimplBooks invoice body (for create/update)
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    client_id: invoice.contactId ? Number(invoice.contactId) : undefined,
    currency: invoice.currency,
    invoice_date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    reference: invoice.reference,
    notes: invoice.notes,
    rows: invoice.lineItems?.map((li) => ({
      product_id: li.itemId ? Number(li.itemId) : undefined,
      description: li.itemDescription,
      quantity: li.unitQuantity ?? 1,
      unit_price: li.unitAmount,
      account_code: li.accountId,
    })),
  }
}

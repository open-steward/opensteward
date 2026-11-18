import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'

// ── Built Accounting raw types ────────────────────────────────────────────────

export interface BuiltAfricaInvoiceItem {
  id?: number
  invoice_id?: number
  product_id?: number
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  tax_amount?: number
  discount_amount?: number
  [key: string]: unknown
}

export interface BuiltAfricaInvoice {
  id: number
  uuid?: string
  invoice_number?: string
  customer_id?: number
  start_date?: string   // issue date (YYYY-MM-DD)
  end_date?: string     // due date  (YYYY-MM-DD)
  gross_amount?: number
  discount_amount?: number
  amount_due?: number
  amount_paid?: number
  balance?: number
  paid_status?: string  // "paid" | "partial" | "unpaid" | "overdue"
  base_currency?: string
  fx_currency?: string
  note?: string
  items?: BuiltAfricaInvoiceItem[]
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: BuiltAfricaInvoice): InvoiceStatus {
  if (raw.deleted_at) return 'VOIDED'
  const s = (raw.paid_status ?? '').toLowerCase()
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  return 'AUTHORIZED'
}

// ── Line-item mapping ─────────────────────────────────────────────────────────

function mapLineitem(item: BuiltAfricaInvoiceItem): Lineitem {
  return {
    id: item.id !== undefined ? String(item.id) : undefined,
    itemDescription: item.description || undefined,
    // Built returns decimal amounts; canonical is integer minor units
    unitAmount: toMinorUnits(item.unit_price),
    unitQuantity: item.quantity !== undefined ? Math.round(item.quantity) : undefined,
    totalAmount: toMinorUnits(item.amount),
    taxAmount: toMinorUnits(item.tax_amount),
    discountAmount: toMinorUnits(item.discount_amount),
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInvoice(raw: BuiltAfricaInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    // Prefix matches transformClient id: 'cust_<n>' — ensures contactId round-trips
    // correctly when a contact is fetched via listContacts/getContact before being
    // used in a write path.
    contactId: raw.customer_id !== undefined ? `cust_${raw.customer_id}` : undefined,
    currency: raw.base_currency || raw.fx_currency || undefined,
    // Built returns decimal amounts; canonical is integer minor units
    totalAmount: toMinorUnits(raw.gross_amount),
    discountAmount: toMinorUnits(raw.discount_amount),
    paidAmount: toMinorUnits(raw.amount_paid),
    balanceAmount: toMinorUnits(raw.balance),
    notes: raw.note || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.start_date ? new Date(raw.start_date) : undefined,
    dueAt: raw.end_date ? new Date(raw.end_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → Built request body) ──────────────────────────────

/**
 * Strip the 'cust_' prefix from a contactId (set by transformClient / transformInvoice)
 * and return the raw numeric customer_id for the API, or undefined if not parseable.
 */
function extractCustomerId(contactId: string | undefined): number | undefined {
  if (!contactId) return undefined
  const raw = contactId.startsWith('cust_') ? contactId.slice(5) : contactId
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  // Canonical amounts are integer minor units; Built expects decimal major units
  const toDecimal = (minorUnits: number | null | undefined): number | undefined =>
    minorUnits !== undefined && minorUnits !== null ? minorUnits / 100 : undefined

  return {
    customer_id: extractCustomerId(invoice.contactId),
    start_date: toCalendarDate(invoice.postedAt),
    end_date: toCalendarDate(invoice.dueAt),
    gross_amount: toDecimal(invoice.totalAmount),
    amount_due: toDecimal(invoice.totalAmount),
    note: invoice.notes,
    items: invoice.lineItems?.map((li) => ({
      description: li.itemDescription,
      quantity: li.unitQuantity,
      unit_price: toDecimal(li.unitAmount),
      amount: toDecimal(li.totalAmount),
    })),
  }
}

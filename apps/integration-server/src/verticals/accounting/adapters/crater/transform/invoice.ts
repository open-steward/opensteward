import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Crater wire types ─────────────────────────────────────────────────────────

export interface CraterInvoiceItem {
  id: string
  name: string
  description: string
  price: number
  quantity: number
  discount: number
  discount_type: string
  sub_total: number
  tax: number
  total: number
  unit_name?: string
  [key: string]: unknown
}

export interface CraterInvoice {
  id: string
  invoice_number: string
  status: string          // DRAFT | SENT | VIEWED | OVERDUE | COMPLETED
  paid_status: string     // UNPAID | PARTIALLY_PAID | PAID
  customer_business_id: string
  invoice_date: string    // ISO date string e.g. "2026-02-01"
  due_date: string
  total: number           // in minor units (cents)
  sub_total: number
  tax: number
  discount: number
  discount_type: string
  discount_val: number
  due_amount: number
  notes?: string
  items?: CraterInvoiceItem[]
  currency?: { code: string }
  invoice_pdf_url?: string
  created_at?: string
  updated_at?: string
  approved_at?: string
  [key: string]: unknown
}

// ── Status mapping ─────────────────────────────────────────────────────────────

function mapStatus(raw: CraterInvoice): InvoiceStatus {
  if (raw.status === 'COMPLETED' || raw.paid_status === 'PAID') return 'PAID'
  if (raw.paid_status === 'PARTIALLY_PAID') return 'PARTIALLY_PAID'
  if (raw.status === 'OVERDUE') return 'OVERDUE'
  if (raw.status === 'DRAFT') return 'DRAFT'
  if (raw.status === 'SENT' || raw.status === 'VIEWED') return 'AUTHORIZED'
  return 'DRAFT'
}

// ── Line-item mapping ─────────────────────────────────────────────────────────

function mapLineitem(item: CraterInvoiceItem): Lineitem {
  return {
    id: item.id || undefined,
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.price,
    unitQuantity: item.quantity,
    discountAmount: item.discount || undefined,
    taxAmount: item.tax || undefined,
    totalAmount: item.total,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInvoice(raw: CraterInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.customer_business_id || undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax || undefined,
    discountAmount: raw.discount_val || undefined,
    balanceAmount: raw.due_amount ?? undefined,
    paidAmount: raw.total != null && raw.due_amount != null
      ? raw.total - raw.due_amount
      : undefined,
    notes: raw.notes || undefined,
    url: raw.invoice_pdf_url || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → Crater create/update body) ───────────────────────

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customer_business_id: invoice.contactId,
    invoice_date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    notes: invoice.notes,
    items: invoice.lineItems?.map((li) => ({
      name: li.itemName ?? li.itemDescription,
      description: li.itemDescription,
      price: li.unitAmount,
      quantity: li.unitQuantity ?? 1,
      discount: li.discountAmount ?? 0,
      discount_type: 'fixed',
    })),
  }
}

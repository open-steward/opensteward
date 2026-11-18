import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Tyms wire types ────────────────────────────────────────────────────────────

export interface TymsInvoiceItem {
  uuid?: string
  name?: string
  description?: string
  quantity?: number
  price?: number
  amount?: number
  tax?: number
  discount?: number
  account?: string
  [key: string]: unknown
}

export interface TymsInvoice {
  uuid: string
  document_number?: string
  title?: string
  date?: string
  due_date?: string
  amount?: number
  tax?: number | { amount?: number; [key: string]: unknown }
  discount?: number
  balance?: number
  paid_amount?: number
  currency?: string
  status?: string
  invoiceable?: boolean
  customer?: {
    uuid?: string
    name?: string
    [key: string]: unknown
  }
  items?: TymsInvoiceItem[]
  invoice_note?: string
  source_uuid?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Status mapping ─────────────────────────────────────────────────────────────

function mapStatus(raw: TymsInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'paid') return 'PAID'
  if (s === 'partial' || s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'void' || s === 'voided' || s === 'cancelled') return 'VOIDED'
  if (s === 'draft') return 'DRAFT'
  if (s === 'sent' || s === 'approved' || s === 'authorized') return 'AUTHORIZED'
  // Derive from balance when no explicit status
  const total = raw.amount ?? 0
  const balance = raw.balance ?? total
  if (total > 0 && balance === 0) return 'PAID'
  if (total > 0 && balance > 0 && balance < total) return 'PARTIALLY_PAID'
  return 'DRAFT'
}

// ── Line-item mapping ──────────────────────────────────────────────────────────

function mapLineitem(item: TymsInvoiceItem): Lineitem {
  return {
    id: item.uuid || undefined,
    accountId: item.account || undefined,
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.price ?? undefined,
    unitQuantity: item.quantity ?? undefined,
    totalAmount: item.amount ?? undefined,
    taxAmount: item.tax ?? undefined,
    discountAmount: item.discount ?? undefined,
  }
}

// ── Tax amount extraction ──────────────────────────────────────────────────────

function extractTaxAmount(tax: TymsInvoice['tax']): number | undefined {
  if (tax === undefined || tax === null) return undefined
  if (typeof tax === 'number') return tax
  return typeof tax.amount === 'number' ? tax.amount : undefined
}

// ── Public transform ───────────────────────────────────────────────────────────

export function transformInvoice(raw: TymsInvoice): Invoice {
  return {
    id: raw.uuid,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.document_number || undefined,
    contactId: raw.customer?.uuid || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount ?? undefined,
    taxAmount: extractTaxAmount(raw.tax),
    discountAmount: raw.discount ?? undefined,
    balanceAmount: raw.balance ?? undefined,
    paidAmount: raw.paid_amount ?? undefined,
    notes: raw.invoice_note || undefined,
    lineItems: Array.isArray(raw.items) ? raw.items.map(mapLineitem) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Canonical → Tyms body (create) ────────────────────────────────────────────

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    title: invoice.invoiceNumber,
    currency: invoice.currency,
    invoice_note: invoice.notes,
    customer: invoice.contactId ? { uuid: invoice.contactId } : undefined,
    items: invoice.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      price: li.unitAmount,
      quantity: li.unitQuantity,
      account: li.accountId,
      discount: li.discountAmount,
    })),
  }
}

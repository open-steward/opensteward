import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface QoyodLineItem {
  id?: number | null
  product_id?: number | null
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  tax_rate?: number | null
  tax_amount?: number | null
  total?: number | null
  discount?: number | null
  account_id?: number | null
  [key: string]: unknown
}

export interface QoyodInvoice {
  id: number
  reference?: string | null
  customer_id?: number | null
  customer_name?: string | null
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
  line_items?: QoyodLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: QoyodInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'draft') return 'DRAFT'
  if (s === 'sent' || s === 'issued' || s === 'approved') return 'AUTHORIZED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid' || s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'voided' || s === 'cancelled' || s === 'canceled') return 'VOIDED'
  return 'DRAFT'
}

function mapLineItem(li: QoyodLineItem): Lineitem {
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

export function transformInvoice(raw: QoyodInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.reference || String(raw.id),
    contactId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.tax_total ?? undefined,
    discountAmount: raw.discount_total ?? undefined,
    paidAmount: raw.paid_amount ?? undefined,
    balanceAmount: raw.balance ?? undefined,
    reference: raw.reference || undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customer_id: invoice.contactId ? Number(invoice.contactId) : undefined,
    reference: invoice.reference,
    notes: invoice.notes,
    currency: invoice.currency,
    date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    line_items: invoice.lineItems?.map((li) => ({
      product_id: li.itemId ? Number(li.itemId) : undefined,
      description: li.itemDescription,
      quantity: li.unitQuantity,
      unit_price: li.unitAmount,
      account_id: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}

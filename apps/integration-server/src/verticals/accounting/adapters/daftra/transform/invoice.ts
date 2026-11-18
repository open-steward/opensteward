import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface DaftraInvoiceLine {
  product_id?: string | number
  product_description?: string
  description?: string
  unit?: number
  price?: number
  total?: number
  tax?: number
  [key: string]: unknown
}

export interface DaftraInvoice {
  id: string | number
  no?: string
  date?: string
  due_date?: string
  summary_subtotal?: number
  summary_tax1?: number
  summary_tax2?: number
  summary_total?: number
  summary_paid?: number
  summary_unpaid?: number
  payment_status?: string
  client_id?: string | number
  currency_code?: string
  draft?: string | number
  InvoiceProducts?: DaftraInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(draft?: string | number, paymentStatus?: string): InvoiceStatus {
  if (Number(draft) === 1) return 'DRAFT'
  if (!paymentStatus) return 'AUTHORIZED'
  const s = String(paymentStatus).toLowerCase()
  if (s.includes('paid') && !s.includes('unpaid') && !s.includes('partial')) return 'PAID'
  if (s.includes('void') || s.includes('cancelled')) return 'VOIDED'
  return 'AUTHORIZED'
}

function mapLineitem(line: DaftraInvoiceLine): Lineitem {
  return {
    itemId: line.product_id ? String(line.product_id) : undefined,
    itemDescription: line.product_description || line.description || undefined,
    unitQuantity: line.unit,
    unitAmount: line.price,
    totalAmount: line.total,
    taxAmount: line.tax,
  }
}

export function transformInvoice(raw: DaftraInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.draft, raw.payment_status),
    invoiceNumber: raw.no || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.summary_total,
    taxAmount: (raw.summary_tax1 ?? 0) + (raw.summary_tax2 ?? 0) || undefined,
    paidAmount: raw.summary_paid,
    balanceAmount: raw.summary_unpaid,
    lineItems: (raw.InvoiceProducts ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

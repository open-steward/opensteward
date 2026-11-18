import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FinlyInvoiceItem {
  id: string
  name: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax: number
  account_id: string
  [key: string]: unknown
}

export interface FinlyInvoice {
  id: string
  invoice_number: string
  vendor_id: string
  currency: string
  subtotal: number
  tax_amount: number
  total_amount: number
  items: FinlyInvoiceItem[]
  date: string
  due_date: string
  status: string
  paid_amount: number
  [key: string]: unknown
}

function mapStatus(inv: FinlyInvoice): InvoiceStatus {
  const s = inv.status?.toLowerCase()
  if (s === 'void') return 'VOIDED'
  if (s === 'rejected') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'approved') return 'AUTHORIZED'
  if (s === 'pending_approval') return 'SUBMITTED'
  return 'DRAFT'
}

function mapLineitem(row: FinlyInvoiceItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
  }
}

export function transformInvoice(raw: FinlyInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.vendor_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    paidAmount: raw.paid_amount || undefined,
    balanceAmount: raw.total_amount - (raw.paid_amount ?? 0),
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

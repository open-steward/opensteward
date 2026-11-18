import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface WafeqInvoiceLineItem {
  id?: string
  description?: string
  quantity?: number
  price?: number
  total?: number
  tax_amount?: number
  account?: string
  [key: string]: unknown
}

export interface WafeqInvoice {
  id: string
  invoice_number?: string
  invoice_date?: string
  invoice_due_date?: string
  subtotal?: number
  tax_amount?: number
  total?: number
  amount_due?: number
  status?: string
  contact?: string
  currency?: string
  line_items?: WafeqInvoiceLineItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'draft':
      return 'DRAFT'
    case 'issued':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: WafeqInvoiceLineItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    accountId: item.account ? String(item.account) : undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.quantity,
    unitAmount: item.price,
    totalAmount: item.total,
    taxAmount: item.tax_amount,
  }
}

export function transformInvoice(raw: WafeqInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact ? String(raw.contact) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.amount_due,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.invoice_due_date ? new Date(raw.invoice_due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

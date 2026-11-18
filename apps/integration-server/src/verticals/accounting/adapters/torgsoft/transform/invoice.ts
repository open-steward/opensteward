import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface TorgsoftInvoiceItem {
  id: string
  title: string
  price: number
  quantity: number
  total: number
  tax?: number
  account_id?: string
  [key: string]: unknown
}

export interface TorgsoftInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date?: string
  total_amount: number
  tax_amount?: number
  status: string
  client_id?: string
  currency?: string
  items?: TorgsoftInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'confirmed':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    case 'new':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: TorgsoftInvoiceItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id || undefined,
    itemDescription: item.title || undefined,
    unitAmount: item.price,
    unitQuantity: item.quantity,
    totalAmount: item.total,
    taxAmount: item.tax || undefined,
  }
}

export function transformInvoice(raw: TorgsoftInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

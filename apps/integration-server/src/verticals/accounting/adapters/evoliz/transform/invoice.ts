import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface EvolizInvoiceItem {
  id: number
  designation: string
  unit_price: number
  quantity: number
  total_without_taxes: number
  total_taxes: number
  account_code: string
  [key: string]: unknown
}

export interface EvolizInvoice {
  id: string
  invoice_no?: string
  invoice_date?: string
  due_date?: string
  total_without_taxes?: number
  total_taxes?: number
  total_with_taxes?: number
  balance_due?: number
  invoice_status?: string
  client_id?: string
  currency?: string
  items?: EvolizInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status?.toUpperCase()) {
    case 'SENT': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'CANCELLED': return 'VOIDED'
    case 'DRAFT':
    default: return 'DRAFT'
  }
}

function mapLineitem(row: EvolizInvoiceItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.designation || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_without_taxes,
    taxAmount: row.total_taxes,
  }
}

export function transformInvoice(raw: EvolizInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.invoice_status),
    invoiceNumber: raw.invoice_no || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_with_taxes,
    taxAmount: raw.total_taxes,
    balanceAmount: raw.balance_due,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

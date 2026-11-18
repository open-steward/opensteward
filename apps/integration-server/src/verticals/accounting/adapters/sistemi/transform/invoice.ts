import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SistemiLineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  vat_amount: number
  account_code: string
  [key: string]: unknown
}

export interface SistemiInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  net_amount: number
  vat_amount: number
  gross_amount: number
  outstanding_amount: number
  status: string
  currency: string
  customer_id: string
  lines?: SistemiLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'ISSUED': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'CANCELLED': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: SistemiLineItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
    taxAmount: row.vat_amount,
  }
}

export function transformInvoice(raw: SistemiInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.outstanding_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface CloudFinanceLineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  vat_amount: number
  account_code: string
  [key: string]: unknown
}

export interface CloudFinanceInvoice {
  id: string
  number: string
  date: string
  expiry_date: string
  taxable_amount: number
  vat_amount: number
  total_amount: number
  remaining_amount: number
  status: string
  currency: string
  customer_id: string
  lines?: CloudFinanceLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'issued': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: CloudFinanceLineItem): Lineitem {
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

export function transformInvoice(raw: CloudFinanceInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.number || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.expiry_date ? new Date(raw.expiry_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface GiobbyLineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  amount_gross: number
  amount_vat: number
  account_code: string
  [key: string]: unknown
}

export interface GiobbyInvoice {
  id: string
  invoice_no: string
  invoice_date: string
  payment_date: string
  amount_net: number
  amount_vat: number
  amount_gross: number
  amount_due: number
  invoice_status: string
  currency: string
  contact_id: string
  items?: GiobbyLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: GiobbyLineItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount_gross,
    taxAmount: row.amount_vat,
  }
}

export function transformInvoice(raw: GiobbyInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.invoice_status),
    invoiceNumber: raw.invoice_no || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_gross,
    taxAmount: raw.amount_vat,
    balanceAmount: raw.amount_due,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.payment_date ? new Date(raw.payment_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

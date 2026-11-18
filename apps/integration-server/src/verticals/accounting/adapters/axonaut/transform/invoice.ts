import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AxonautInvoiceRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  pretax_amount: number
  taxes_amount: number
  account_id: string
  [key: string]: unknown
}

export interface AxonautInvoice {
  id: string
  number: string
  creation_date: string
  payment_deadline: string
  pretax_amount: number
  taxes_amount: number
  total_amount: number
  remaining_amount: number
  status: string
  company_id: string
  currency: string
  lines: AxonautInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: AxonautInvoiceRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.pretax_amount,
    taxAmount: row.taxes_amount,
  }
}

export function transformInvoice(raw: AxonautInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.number || undefined,
    contactId: raw.company_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.taxes_amount,
    balanceAmount: raw.remaining_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.creation_date ? new Date(raw.creation_date) : undefined,
    dueAt: raw.payment_deadline ? new Date(raw.payment_deadline) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

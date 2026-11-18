import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SinaoInvoiceRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  amount_excl_tax: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface SinaoInvoice {
  id: string
  number: string
  date: string
  due_date: string
  amount_excl_tax: number
  tax_amount: number
  amount_incl_tax: number
  balance: number
  status: string
  contact_id: string
  currency: string
  lines: SinaoInvoiceRow[]
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

function mapLineitem(row: SinaoInvoiceRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount_excl_tax,
    taxAmount: row.tax_amount,
  }
}

export function transformInvoice(raw: SinaoInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_incl_tax,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.balance,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

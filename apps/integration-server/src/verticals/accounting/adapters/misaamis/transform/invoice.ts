import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface MisaAmisInvoiceDetail {
  id: string
  description: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  vat_rate: number
  vat_amount: number
  account_id: string
  account_code: string
  [key: string]: unknown
}

export interface MisaAmisInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  total_amount: number
  vat_amount: number
  total_payment: number
  remaining_amount: number
  currency_code: string
  partner_id: string
  partner_name: string
  status: number
  invoice_details: MisaAmisInvoiceDetail[]
  [key: string]: unknown
}

function mapStatus(status: number): InvoiceStatus {
  switch (status) {
    case 0:
      return 'DRAFT'
    case 1:
      return 'AUTHORIZED'
    case 2:
      return 'PAID'
    case 3:
      return 'VOIDED'
    case 4:
      return 'PARTIALLY_PAID'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: MisaAmisInvoiceDetail): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.vat_amount || undefined,
  }
}

export function transformInvoice(raw: MisaAmisInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.partner_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_payment,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining_amount,
    lineItems: (raw.invoice_details ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

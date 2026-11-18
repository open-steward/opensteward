import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FakturoidInvoiceLine {
  id: number
  name: string
  quantity: number
  unit_name: string
  unit_price: number
  vat_rate: number
  unit_price_without_vat: number
  unit_price_with_vat: number
  [key: string]: unknown
}

export interface FakturoidInvoice {
  id: number
  custom_id: string
  number: string
  subject_id: number
  status: string
  due_on: string
  issued_on: string
  total: number
  native_total: number
  remaining_amount: number
  remaining_native_amount: number
  paid_amount: number
  currency: string
  vat_price: number
  native_vat_price: number
  lines: FakturoidInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(inv: FakturoidInvoice): InvoiceStatus {
  switch (inv.status) {
    case 'paid':
      return 'PAID'
    case 'sent':
    case 'open':
      return 'SUBMITTED'
    case 'overdue':
      return 'OVERDUE'
    case 'cancelled':
      return 'VOIDED'
    case 'partial':
      return 'PARTIALLY_PAID'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: FakturoidInvoiceLine): Lineitem {
  return {
    id: String(row.id),
    itemDescription: row.name || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.unit_price_with_vat * row.quantity,
    taxAmount: (row.unit_price_with_vat - row.unit_price_without_vat) * row.quantity || undefined,
  }
}

export function transformInvoice(raw: FakturoidInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.subject_id ? String(raw.subject_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_price,
    balanceAmount: raw.remaining_amount,
    paidAmount: raw.paid_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issued_on ? new Date(raw.issued_on) : undefined,
    dueAt: raw.due_on ? new Date(raw.due_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

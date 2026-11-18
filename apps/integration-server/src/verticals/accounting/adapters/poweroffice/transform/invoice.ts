import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface PowerOfficeLine {
  id: number
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface PowerOfficeInvoice {
  id: number
  orderNo: string
  customerId: number
  invoiceDate: string
  dueDate: string
  currencyCode: string
  grossAmount: number
  netAmount: number
  vatAmount: number
  isPaid: boolean
  isVoid: boolean
  status: number
  lines?: PowerOfficeLine[]
  [key: string]: unknown
}

function mapStatus(raw: PowerOfficeInvoice): InvoiceStatus {
  if (raw.isVoid) return 'VOIDED'
  if (raw.isPaid) return 'PAID'
  if (raw.status === 5) return 'AUTHORIZED'
  if (raw.status === 0) return 'DRAFT'
  return 'AUTHORIZED'
}

function mapLineitem(line: PowerOfficeLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformInvoice(raw: PowerOfficeInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.orderNo || undefined,
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.vatAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

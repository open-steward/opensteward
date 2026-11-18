import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface EBoekhoudenLine {
  id: string
  description: string
  quantity: number
  price: number
  amount: number
}

export interface EBoekhoudenInvoice {
  id: string
  invoiceNumber: string
  relationId: string
  invoiceDate: string
  dueDate: string
  currencyCode: string
  totalAmount: number
  amountPaid: number
  vat: number
  status: string
  lines?: EBoekhoudenLine[]
  [key: string]: unknown
}

function mapStatus(raw: EBoekhoudenInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'open':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'overdue':
      return 'OVERDUE'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: EBoekhoudenLine): Lineitem {
  return {
    id: line.id,
    itemDescription: line.description || undefined,
    unitAmount: line.price,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformInvoice(raw: EBoekhoudenInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.relationId || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vat,
    paidAmount: raw.amountPaid,
    balanceAmount: raw.totalAmount - raw.amountPaid,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

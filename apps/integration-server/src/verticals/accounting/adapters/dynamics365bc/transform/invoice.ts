import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface BCInvoiceLine {
  id: string
  lineType: string
  lineObjectNumber: string
  description: string
  quantity: number
  unitPrice: number
  taxAmount: number
  totalAmountIncludingTax: number
}

export interface BCInvoice {
  id: string
  number: string
  customerId: string
  customerName: string
  postingDate: string
  invoiceDate: string
  dueDate: string
  currencyCode: string
  totalAmountIncludingTax: number
  totalTaxAmount: number
  remainingAmountIncludingTax: number
  status: 'Draft' | 'In Review' | 'Open' | 'Paid' | 'Canceled' | 'Corrective'
  invoiceLines?: BCInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: BCInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'Draft':
      return 'DRAFT'
    case 'In Review':
    case 'Open':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Canceled':
    case 'Corrective':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: BCInvoiceLine): Lineitem {
  return {
    id: line.id,
    itemId: line.lineObjectNumber || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmountIncludingTax,
  }
}

export function transformInvoice(raw: BCInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmountIncludingTax,
    taxAmount: raw.totalTaxAmount,
    balanceAmount: raw.remainingAmountIncludingTax,
    lineItems: (raw.invoiceLines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
